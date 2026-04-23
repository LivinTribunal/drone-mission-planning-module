from uuid import UUID

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import DomainError, NotFoundError
from app.models.airport import Airport
from app.models.drone import Drone
from app.models.enums import MissionStatus
from app.models.inspection import Inspection, InspectionConfiguration
from app.models.mission import TRAJECTORY_FIELDS, TRANSITIONS, DroneProfile, Mission
from app.schemas.mission import MissionCreate, MissionUpdate
from app.services import drone_service
from app.services.geometry_converter import schema_to_model_data


def transition_mission(db: Session, mission_id: UUID, target_status: str) -> Mission:
    """validate and execute status transition via aggregate root."""
    mission = (
        db.query(Mission)
        .options(joinedload(Mission.drone).joinedload(Drone.drone_profile))
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")

    try:
        mission.transition_to(target_status)
    except ValueError as e:
        raise DomainError(
            str(e),
            status_code=409,
            extra={
                "error": "invalid status transition",
                "current_status": mission.status,
                "target_status": target_status,
                "allowed_transitions": TRANSITIONS.get(mission.status, []),
            },
        )

    db.commit()

    # re-query with eager loads so MissionResponse.drone_profile_id does not
    # lazy-load on expired attributes during response serialization
    return (
        db.query(Mission)
        .options(joinedload(Mission.drone).joinedload(Drone.drone_profile))
        .filter(Mission.id == mission_id)
        .first()
    )


def list_missions(
    db: Session,
    airport_id: UUID | None = None,
    status: str | None = None,
    drone_id: UUID | None = None,
    drone_profile_id: UUID | None = None,
    limit: int = 20,
    offset: int = 0,
    airport_ids: list[UUID] | None = None,
) -> tuple[list[Mission], int]:
    """list missions with optional filters and pagination."""
    if status is not None:
        valid = {s.value for s in MissionStatus}
        if status not in valid:
            raise DomainError(f"invalid status, must be one of {valid}")

    # shared predicates for data and count queries
    filters = []
    if airport_ids is not None:
        filters.append(Mission.airport_id.in_(airport_ids))
    if airport_id:
        filters.append(Mission.airport_id == airport_id)
    if status:
        filters.append(Mission.status == status)
    if drone_id:
        filters.append(Mission.drone_id == drone_id)
    if drone_profile_id:
        # filter by template id - correlated subquery walks the drone fk inline,
        # avoiding the python round-trip and empty-result special case
        matching_drone_ids = (
            db.query(Drone.id).filter(Drone.drone_profile_id == drone_profile_id).scalar_subquery()
        )
        filters.append(Mission.drone_id.in_(matching_drone_ids))

    query = (
        db.query(Mission)
        .options(
            joinedload(Mission.inspections),
            joinedload(Mission.flight_plan),
            joinedload(Mission.drone).joinedload(Drone.drone_profile),
        )
        .filter(*filters)
    )

    # count on a clean query to avoid joinedload duplicates
    total = db.query(Mission).filter(*filters).count()

    missions = query.order_by(Mission.created_at.desc()).offset(offset).limit(limit).all()

    return missions, total


def get_mission(db: Session, mission_id: UUID) -> Mission:
    """get mission with inspections."""
    mission = (
        db.query(Mission)
        .options(
            joinedload(Mission.inspections).joinedload(Inspection.config),
            joinedload(Mission.drone).joinedload(Drone.drone_profile),
        )
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")

    return mission


def _resolve_drone_for_mission(
    db: Session,
    airport: Airport,
    drone_id: UUID | None,
    drone_profile_id: UUID | None,
) -> tuple[UUID | None, DroneProfile | None]:
    """resolve the drone_id + embedded profile for mission create/update.

    precedence:
        1. explicit drone_id on the payload
        2. legacy drone_profile_id (auto-materializes a fleet drone)
        3. airport default fleet drone
    returns (resolved_drone_id, profile_for_validation).
    """
    # explicit fleet drone
    if drone_id is not None:
        drone = db.query(Drone).filter(Drone.id == drone_id, Drone.airport_id == airport.id).first()
        if not drone:
            raise DomainError("drone not found at this airport")
        profile = db.query(DroneProfile).filter(DroneProfile.id == drone.drone_profile_id).first()
        return drone.id, profile

    # legacy: materialize a drone from a template
    if drone_profile_id is not None:
        drone = drone_service.find_or_create_drone_for_profile(db, airport.id, drone_profile_id)
        profile = db.query(DroneProfile).filter(DroneProfile.id == drone.drone_profile_id).first()
        return drone.id, profile

    # fall back to airport default
    if airport.default_drone_id:
        drone = db.query(Drone).filter(Drone.id == airport.default_drone_id).first()
        if drone:
            profile = (
                db.query(DroneProfile).filter(DroneProfile.id == drone.drone_profile_id).first()
            )
            return drone.id, profile

    return None, None


def create_mission(db: Session, schema: MissionCreate) -> Mission:
    """create mission in DRAFT status."""
    airport = db.query(Airport).filter(Airport.id == schema.airport_id).first()
    if not airport:
        raise DomainError("airport not found")

    resolved_drone_id, profile = _resolve_drone_for_mission(
        db,
        airport,
        drone_id=schema.drone_id,
        drone_profile_id=schema.drone_profile_id,
    )

    data = schema_to_model_data(schema)
    # drone_profile_id was a legacy shim - do not pass it to the ORM
    data.pop("drone_profile_id", None)
    data["drone_id"] = resolved_drone_id

    mission = Mission(**data)

    try:
        mission.validate_transit_altitude(profile)
    except ValueError as e:
        raise DomainError(str(e), status_code=422)

    db.add(mission)
    db.commit()
    db.refresh(mission)

    return mission


def update_mission(db: Session, mission_id: UUID, schema: MissionUpdate) -> Mission:
    """update mission - invalidates trajectory on config changes."""
    mission = (
        db.query(Mission)
        .options(
            joinedload(Mission.flight_plan),
            joinedload(Mission.drone).joinedload(Drone.drone_profile),
        )
        .filter(Mission.id == mission_id)
        .first()
    )
    if not mission:
        raise NotFoundError("mission not found")

    data = schema.model_dump(exclude_unset=True)

    # resolve legacy drone_profile_id to a fleet drone_id before trajectory bookkeeping.
    # explicit `drone_id: null` means "clear assignment" - it must NOT fall back to
    # the airport default, so we resolve here instead of going through the create-time
    # helper which always falls back.
    drone_id_in_payload = "drone_id" in schema.model_fields_set
    profile_id_in_payload = "drone_profile_id" in schema.model_fields_set
    explicit_drone_id = data.pop("drone_id", None) if drone_id_in_payload else None
    legacy_profile_id = data.pop("drone_profile_id", None) if profile_id_in_payload else None
    drone_touched = drone_id_in_payload or profile_id_in_payload

    if drone_touched:
        airport = db.query(Airport).filter(Airport.id == mission.airport_id).first()
        if drone_id_in_payload and explicit_drone_id is not None:
            target = (
                db.query(Drone)
                .filter(Drone.id == explicit_drone_id, Drone.airport_id == airport.id)
                .first()
            )
            if not target:
                raise DomainError("drone not found at this airport")
            data["drone_id"] = target.id
        elif legacy_profile_id is not None:
            target = drone_service.find_or_create_drone_for_profile(
                db, airport.id, legacy_profile_id
            )
            data["drone_id"] = target.id
        else:
            # caller explicitly cleared drone_id - leave the mission unassigned
            data["drone_id"] = None

    # trajectory-affecting fields changed - regress to DRAFT
    trajectory_changed = any(k in TRAJECTORY_FIELDS for k in data.keys())
    if trajectory_changed:
        if mission.flight_plan:
            db.delete(mission.flight_plan)
            db.flush()
        try:
            mission.invalidate_trajectory()
        except ValueError as e:
            raise DomainError(str(e), status_code=409)
        mission.has_unsaved_map_changes = True

    # mutate mission fields directly - apply_schema_update would re-inject the
    # legacy drone_profile_id we already translated
    for field, value in data.items():
        setattr(mission, field, value)

    # validate the new cruise altitude against the (possibly updated) drone
    if "transit_agl" in schema.model_fields_set or drone_touched:
        profile: DroneProfile | None = None
        if mission.drone_id:
            current_drone = db.query(Drone).filter(Drone.id == mission.drone_id).first()
            if current_drone:
                profile = (
                    db.query(DroneProfile)
                    .filter(DroneProfile.id == current_drone.drone_profile_id)
                    .first()
                )
        try:
            mission.validate_transit_altitude(profile)
        except ValueError as e:
            raise DomainError(str(e), status_code=422)

    db.commit()

    # re-query with eager loads so MissionResponse.drone_profile_id does not
    # lazy-load on expired attributes during response serialization
    return (
        db.query(Mission)
        .options(
            joinedload(Mission.flight_plan),
            joinedload(Mission.drone).joinedload(Drone.drone_profile),
        )
        .filter(Mission.id == mission_id)
        .first()
    )


def delete_mission(db: Session, mission_id: UUID):
    """delete mission - blocked for COMPLETED status."""
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise NotFoundError("mission not found")

    if mission.status in Mission._TERMINAL:
        raise DomainError(
            "cannot delete mission in completed or cancelled state",
            status_code=409,
        )

    db.delete(mission)
    db.flush()


def duplicate_mission(db: Session, mission_id: UUID) -> Mission:
    """duplicate mission as new DRAFT.

    runs in a single db session that auto-rolls back on exception via the
    get_db dependency, so no explicit try/except is needed here.
    """
    original = (
        db.query(Mission)
        .options(
            joinedload(Mission.inspections).joinedload(Inspection.config),
            joinedload(Mission.drone).joinedload(Drone.drone_profile),
        )
        .filter(Mission.id == mission_id)
        .first()
    )
    if not original:
        raise NotFoundError("mission not found")

    copy = Mission(
        name=f"{original.name} (copy)",
        status=MissionStatus.DRAFT,
        airport_id=original.airport_id,
        drone_id=original.drone_id,
        operator_notes=original.operator_notes,
        default_speed=original.default_speed,
        measurement_speed_override=original.measurement_speed_override,
        default_altitude_offset=original.default_altitude_offset,
        takeoff_coordinate=original.takeoff_coordinate,
        landing_coordinate=original.landing_coordinate,
        default_capture_mode=original.default_capture_mode,
        default_buffer_distance=original.default_buffer_distance,
        transit_agl=original.transit_agl,
        flight_plan_scope=original.flight_plan_scope,
    )
    db.add(copy)
    db.flush()

    for insp in original.inspections:
        new_config_id = None
        if insp.config:
            config_fields = {
                f: getattr(insp.config, f) for f in InspectionConfiguration._MERGE_FIELDS
            }
            new_config = InspectionConfiguration(**config_fields)
            db.add(new_config)
            db.flush()
            new_config_id = new_config.id

        new_insp = Inspection(
            template_id=insp.template_id,
            config_id=new_config_id,
            method=insp.method,
            sequence_order=insp.sequence_order,
        )
        copy.add_inspection(new_insp)

    db.commit()

    # re-query with eager loads so downstream serialization of drone_profile_id
    # does not trigger a lazy load on expired attributes
    return (
        db.query(Mission)
        .options(
            joinedload(Mission.inspections).joinedload(Inspection.config),
            joinedload(Mission.drone).joinedload(Drone.drone_profile),
        )
        .filter(Mission.id == copy.id)
        .first()
    )
