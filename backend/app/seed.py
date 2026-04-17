import logging
import sys

from geoalchemy2.elements import WKTElement

from app.core.database import SessionLocal
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.inspection import (
    InspectionConfiguration,
    InspectionTemplate,
    insp_template_methods,
    insp_template_targets,
)
from app.models.mission import DroneProfile
from app.services.geometry_converter import geojson_to_ewkt
from app.services.openaip_service import lookup_airport_by_icao

logger = logging.getLogger(__name__)

AIRPORTS = ["LKPR", "LZIB", "LOWW", "LZKZ", "LZTT"]

DRONE_PROFILES = [
    {
        "name": "DJI Matrice 300 RTK",
        "manufacturer": "DJI",
        "model": "Matrice 300 RTK",
        "max_speed": 23.0,
        "max_climb_rate": 6.0,
        "max_altitude": 500.0,
        "battery_capacity": 5935.0,
        "endurance_minutes": 55.0,
        "camera_resolution": "20MP",
        "camera_frame_rate": 30,
        "sensor_fov": 84.0,
        "weight": 6.3,
    },
    {
        "name": "DJI Matrice 350 RTK",
        "manufacturer": "DJI",
        "model": "Matrice 350 RTK",
        "max_speed": 23.0,
        "max_climb_rate": 6.0,
        "max_altitude": 500.0,
        "battery_capacity": 5880.0,
        "endurance_minutes": 55.0,
        "camera_resolution": "48MP",
        "camera_frame_rate": 30,
        "sensor_fov": 84.0,
        "weight": 6.47,
    },
    {
        "name": "DJI Mavic 3 Enterprise",
        "manufacturer": "DJI",
        "model": "Mavic 3 Enterprise",
        "max_speed": 21.0,
        "max_climb_rate": 8.0,
        "max_altitude": 500.0,
        "battery_capacity": 5000.0,
        "endurance_minutes": 45.0,
        "camera_resolution": "20MP",
        "camera_frame_rate": 30,
        "sensor_fov": 84.0,
        "weight": 0.92,
    },
    {
        "name": "Autel EVO II Pro V3",
        "manufacturer": "Autel Robotics",
        "model": "EVO II Pro V3",
        "max_speed": 20.0,
        "max_climb_rate": 8.0,
        "max_altitude": 500.0,
        "battery_capacity": 7100.0,
        "endurance_minutes": 42.0,
        "camera_resolution": "20MP",
        "camera_frame_rate": 30,
        "sensor_fov": 82.0,
        "weight": 1.25,
    },
    {
        "name": "Freefly Astro",
        "manufacturer": "Freefly Systems",
        "model": "Astro",
        "max_speed": 18.0,
        "max_climb_rate": 5.0,
        "max_altitude": 400.0,
        "battery_capacity": 10000.0,
        "endurance_minutes": 32.0,
        "camera_resolution": "61MP",
        "camera_frame_rate": 30,
        "sensor_fov": 75.0,
        "weight": 5.9,
    },
    {
        "name": "senseFly eBee X",
        "manufacturer": "senseFly",
        "model": "eBee X",
        "max_speed": 40.0,
        "max_climb_rate": 4.0,
        "max_altitude": 500.0,
        "battery_capacity": 4000.0,
        "endurance_minutes": 90.0,
        "camera_resolution": "24MP",
        "camera_frame_rate": 1,
        "sensor_fov": 73.0,
        "weight": 1.6,
    },
    {
        "name": "Skydio X10",
        "manufacturer": "Skydio",
        "model": "X10",
        "max_speed": 18.0,
        "max_climb_rate": 8.0,
        "max_altitude": 400.0,
        "battery_capacity": 5500.0,
        "endurance_minutes": 40.0,
        "camera_resolution": "48MP",
        "camera_frame_rate": 60,
        "sensor_fov": 63.0,
        "weight": 2.2,
    },
]


def _to_wkt(geojson: dict) -> WKTElement:
    """convert a geojson geometry dict to a WKTElement."""
    return WKTElement(geojson_to_ewkt(geojson), srid=4326)


def seed_airport(icao: str) -> None:
    """seed a single airport with infrastructure from openaip."""
    db = SessionLocal()
    try:
        existing = db.query(Airport).filter_by(icao_code=icao).first()
        if existing:
            print(f"  {icao} already seeded, skipping")
            return

        print(f"  {icao} - fetching from openaip...")
        data = lookup_airport_by_icao(icao)

        airport = Airport(
            icao_code=data.icao_code,
            name=data.name,
            city=data.city,
            country=data.country,
            elevation=data.elevation,
            location=_to_wkt(data.location.model_dump()),
        )
        db.add(airport)
        db.flush()

        for rw in data.runways:
            surface = AirfieldSurface(
                airport_id=airport.id,
                identifier=rw.identifier,
                surface_type="RUNWAY",
                geometry=_to_wkt(rw.geometry.model_dump()),
                boundary=_to_wkt(rw.boundary.model_dump()),
                heading=rw.heading,
                length=rw.length,
                width=rw.width,
                threshold_position=_to_wkt(rw.threshold_position.model_dump()),
                end_position=_to_wkt(rw.end_position.model_dump()),
            )
            db.add(surface)
        rw_count = len(data.runways)

        obs_count = 0
        for obs in data.obstacles:
            bnd = obs.boundary.model_dump()
            ring = bnd["coordinates"][0]
            lons = [c[0] for c in ring]
            lats = [c[1] for c in ring]
            centroid_lon = sum(lons) / len(lons)
            centroid_lat = sum(lats) / len(lats)
            centroid_z = ring[0][2] if len(ring[0]) >= 3 else data.elevation

            obstacle = Obstacle(
                airport_id=airport.id,
                name=obs.name,
                height=obs.height,
                boundary=_to_wkt(bnd),
                position=WKTElement(
                    f"SRID=4326;POINTZ({centroid_lon} {centroid_lat} {centroid_z})",
                    srid=4326,
                ),
                radius=3.0,
                buffer_distance=5.0,
                type=obs.type,
            )
            db.add(obstacle)
            obs_count += 1

        sz_count = 0
        for sz in data.safety_zones:
            zone = SafetyZone(
                airport_id=airport.id,
                name=sz.name,
                type=sz.type,
                geometry=_to_wkt(sz.geometry.model_dump()),
                altitude_floor=sz.altitude_floor or 0.0,
                altitude_ceiling=sz.altitude_ceiling or 0.0,
                is_active=True,
            )
            db.add(zone)
            sz_count += 1

        db.commit()
        print(
            f"  {icao} seeded: {rw_count} runways, "
            f"{obs_count} obstacles, {sz_count} safety zones"
        )
    except Exception as e:
        db.rollback()
        print(f"  {icao} failed: {e}")
    finally:
        db.close()


def seed_airports() -> None:
    """seed all airports from openaip."""
    print("seeding airports from openaip...")
    for icao in AIRPORTS:
        seed_airport(icao)


def seed_drone_profiles() -> None:
    """seed real-world drone profiles with full specs."""
    db = SessionLocal()
    try:
        existing = db.query(DroneProfile).filter_by(name="DJI Matrice 300 RTK").first()
        if existing:
            print("drone profiles already seeded")
            return

        for profile in DRONE_PROFILES:
            db.add(DroneProfile(**profile))

        db.commit()
        print(f"{len(DRONE_PROFILES)} drone profiles seeded")
    finally:
        db.close()


def seed_inspection_templates() -> None:
    """seed inspection templates for angular sweep and vertical profile methods."""
    db = SessionLocal()
    try:
        existing = db.query(InspectionTemplate).filter_by(name="PAPI Angular Sweep").first()
        if existing:
            print("inspection templates already seeded")
            return

        sweep_config = InspectionConfiguration(
            altitude_offset=0.0,
            measurement_density=10,
        )
        db.add(sweep_config)
        db.flush()

        sweep = InspectionTemplate(
            name="PAPI Angular Sweep",
            description="angular sweep inspection for PAPI systems",
            default_config_id=sweep_config.id,
            created_by="system",
        )
        db.add(sweep)
        db.flush()

        db.execute(
            insp_template_methods.insert().values(template_id=sweep.id, method="ANGULAR_SWEEP")
        )

        vp_config = InspectionConfiguration(
            altitude_offset=0.0,
            measurement_density=8,
        )
        db.add(vp_config)
        db.flush()

        vp = InspectionTemplate(
            name="PAPI Vertical Profile",
            description="vertical profile inspection for PAPI systems",
            default_config_id=vp_config.id,
            created_by="system",
        )
        db.add(vp)
        db.flush()

        db.execute(
            insp_template_methods.insert().values(template_id=vp.id, method="VERTICAL_PROFILE")
        )

        db.commit()
        print("inspection templates seeded (angular sweep + vertical profile)")
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    seed_airports()
    seed_drone_profiles()
    seed_inspection_templates()
