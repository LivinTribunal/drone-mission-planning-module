from app.core.database import SessionLocal
from app.models.agl import AGL, LHA
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone
from app.models.inspection import (
    InspectionConfiguration,
    InspectionTemplate,
    insp_template_methods,
    insp_template_targets,
)
from app.models.mission import DroneProfile


# TODO: add more airports
def seed_lkpr():
    db = SessionLocal()
    try:
        existing = db.query(Airport).filter_by(icao_code="LKPR").first()
        if existing:
            print("LKPR already seeded")
            return

        airport = Airport(
            icao_code="LKPR",
            name="Vaclav Havel Airport Prague",
            elevation=380.0,
            location="SRID=4326;POINTZ(14.2600 50.1008 380)",
        )
        db.add(airport)
        db.flush()

        # RWY 06/24
        rwy = AirfieldSurface(
            airport_id=airport.id,
            identifier="06/24",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(14.2436 50.1044 380, 14.2764 50.0972 380)",
            heading=243.0,
            length=3715.0,
            width=45.0,
            threshold_position="SRID=4326;POINTZ(14.2436 50.1044 380)",
            end_position="SRID=4326;POINTZ(14.2764 50.0972 380)",
        )
        db.add(rwy)
        db.flush()

        # obstacles
        db.add(
            Obstacle(
                airport_id=airport.id,
                name="Control Tower",
                position="SRID=4326;POINTZ(14.2620 50.1015 380)",
                height=40.0,
                radius=15.0,
                geometry=(
                    "SRID=4326;POLYGONZ(("
                    "14.2618 50.1013 380, "
                    "14.2622 50.1013 380, "
                    "14.2622 50.1017 380, "
                    "14.2618 50.1017 380, "
                    "14.2618 50.1013 380))"
                ),
                type="TOWER",
            )
        )

        db.add(
            Obstacle(
                airport_id=airport.id,
                name="Terminal 2 Building",
                position="SRID=4326;POINTZ(14.2580 50.1030 380)",
                height=25.0,
                radius=50.0,
                geometry=(
                    "SRID=4326;POLYGONZ(("
                    "14.2560 50.1020 380, "
                    "14.2600 50.1020 380, "
                    "14.2600 50.1040 380, "
                    "14.2560 50.1040 380, "
                    "14.2560 50.1020 380))"
                ),
                type="BUILDING",
            )
        )

        # safety zones
        db.add(
            SafetyZone(
                airport_id=airport.id,
                name="Prague CTR",
                type="CTR",
                geometry=(
                    "SRID=4326;POLYGONZ(("
                    "14.1800 50.0500 0, "
                    "14.3400 50.0500 0, "
                    "14.3400 50.1500 0, "
                    "14.1800 50.1500 0, "
                    "14.1800 50.0500 0))"
                ),
                altitude_floor=0.0,
                altitude_ceiling=2500.0,
                is_active=True,
            )
        )

        db.add(
            SafetyZone(
                airport_id=airport.id,
                name="RWY 06/24 Approach Zone",
                type="RESTRICTED",
                geometry=(
                    "SRID=4326;POLYGONZ(("
                    "14.2300 50.0950 0, "
                    "14.2500 50.0950 0, "
                    "14.2500 50.1100 0, "
                    "14.2300 50.1100 0, "
                    "14.2300 50.0950 0))"
                ),
                altitude_floor=0.0,
                altitude_ceiling=1500.0,
                is_active=True,
            )
        )

        db.add(
            SafetyZone(
                airport_id=airport.id,
                name="Temporary Construction Zone",
                type="TEMPORARY_NO_FLY",
                geometry=(
                    "SRID=4326;POLYGONZ(("
                    "14.2550 50.0990 0, "
                    "14.2580 50.0990 0, "
                    "14.2580 50.1010 0, "
                    "14.2550 50.1010 0, "
                    "14.2550 50.0990 0))"
                ),
                altitude_floor=0.0,
                altitude_ceiling=500.0,
                is_active=True,
            )
        )

        # PAPI system on RWY 24
        papi = AGL(
            surface_id=rwy.id,
            agl_type="PAPI",
            name="PAPI RWY 24 Left",
            position="SRID=4326;POINTZ(14.2740 50.0978 380)",
            side="LEFT",
            glide_slope_angle=3.0,
            distance_from_threshold=300.0,
            offset_from_centerline=15.0,
        )
        db.add(papi)
        db.flush()

        # 4 LHAs
        for i in range(1, 5):
            db.add(
                LHA(
                    agl_id=papi.id,
                    unit_number=i,
                    setting_angle=3.0 + (i - 1) * 0.5,
                    transition_sector_width=3.0,
                    lamp_type="HALOGEN",
                    position=f"SRID=4326;POINTZ({14.2740 + i * 0.0003} 50.0978 380)",
                )
            )

        db.commit()
        print("LKPR seeded with runway, obstacles, safety zones, and PAPI system")
    finally:
        db.close()


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


def seed_drone_profiles():
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


def seed_inspection_templates():
    db = SessionLocal()
    try:
        existing = db.query(InspectionTemplate).filter_by(name="PAPI Angular Sweep").first()
        if existing:
            print("inspection templates already seeded")
            return

        # find LKPR PAPI AGL
        papi = db.query(AGL).filter_by(name="PAPI RWY 24 Left").first()
        if not papi:
            print("LKPR PAPI not found - run seed_lkpr first")
            return

        # default config for angular sweep
        sweep_config = InspectionConfiguration(
            altitude_offset=0.0,
            speed_override=5.0,
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

        db.execute(insp_template_targets.insert().values(template_id=sweep.id, agl_id=papi.id))
        db.execute(
            insp_template_methods.insert().values(template_id=sweep.id, method="ANGULAR_SWEEP")
        )

        # default config for vertical profile
        vp_config = InspectionConfiguration(
            altitude_offset=0.0,
            speed_override=3.0,
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

        db.execute(insp_template_targets.insert().values(template_id=vp.id, agl_id=papi.id))
        db.execute(
            insp_template_methods.insert().values(template_id=vp.id, method="VERTICAL_PROFILE")
        )

        db.commit()
        print("inspection templates seeded (angular sweep + vertical profile)")
    finally:
        db.close()


if __name__ == "__main__":
    seed_lkpr()
    seed_drone_profiles()
    seed_inspection_templates()
