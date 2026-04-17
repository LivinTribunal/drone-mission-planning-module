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


def seed_lkpr():
    """seed vaclav havel airport prague."""
    db = SessionLocal()
    try:
        existing = db.query(Airport).filter_by(icao_code="LKPR").first()
        if existing:
            print("LKPR already seeded")
            return

        airport = Airport(
            icao_code="LKPR",
            name="Vaclav Havel Airport Prague",
            city="Prague",
            country="Czech Republic",
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


def seed_lzib():
    """seed bratislava m.r. stefanik airport."""
    db = SessionLocal()
    try:
        existing = db.query(Airport).filter_by(icao_code="LZIB").first()
        if existing:
            print("LZIB already seeded")
            return

        airport = Airport(
            icao_code="LZIB",
            name="M. R. Stefanik Airport",
            city="Bratislava",
            country="Slovakia",
            elevation=133.0,
            location="SRID=4326;POINTZ(17.2127 48.1702 133)",
        )
        db.add(airport)
        db.flush()

        rwy = AirfieldSurface(
            airport_id=airport.id,
            identifier="04/22",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(17.1965 48.1630 133, 17.2289 48.1774 133)",
            heading=40.0,
            length=3190.0,
            width=45.0,
            threshold_position="SRID=4326;POINTZ(17.1965 48.1630 133)",
            end_position="SRID=4326;POINTZ(17.2289 48.1774 133)",
        )
        db.add(rwy)
        db.flush()

        db.add(
            Obstacle(
                airport_id=airport.id,
                name="Control Tower",
                position="SRID=4326;POINTZ(17.2100 48.1720 133)",
                height=35.0,
                radius=10.0,
                geometry=(
                    "SRID=4326;POLYGONZ(("
                    "17.2098 48.1718 133, "
                    "17.2102 48.1718 133, "
                    "17.2102 48.1722 133, "
                    "17.2098 48.1722 133, "
                    "17.2098 48.1718 133))"
                ),
                type="TOWER",
            )
        )

        db.add(
            SafetyZone(
                airport_id=airport.id,
                name="Bratislava CTR",
                type="CTR",
                geometry=(
                    "SRID=4326;POLYGONZ(("
                    "17.1000 48.1000 0, "
                    "17.3200 48.1000 0, "
                    "17.3200 48.2400 0, "
                    "17.1000 48.2400 0, "
                    "17.1000 48.1000 0))"
                ),
                altitude_floor=0.0,
                altitude_ceiling=2000.0,
                is_active=True,
            )
        )

        db.commit()
        print("LZIB seeded")
    finally:
        db.close()


def seed_loww():
    """seed vienna international airport."""
    db = SessionLocal()
    try:
        existing = db.query(Airport).filter_by(icao_code="LOWW").first()
        if existing:
            print("LOWW already seeded")
            return

        airport = Airport(
            icao_code="LOWW",
            name="Vienna International Airport",
            city="Vienna",
            country="Austria",
            elevation=183.0,
            location="SRID=4326;POINTZ(16.5697 48.1103 183)",
        )
        db.add(airport)
        db.flush()

        rwy11_29 = AirfieldSurface(
            airport_id=airport.id,
            identifier="11/29",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(16.5380 48.1150 183, 16.5850 48.1060 183)",
            heading=112.0,
            length=3600.0,
            width=45.0,
            threshold_position="SRID=4326;POINTZ(16.5380 48.1150 183)",
            end_position="SRID=4326;POINTZ(16.5850 48.1060 183)",
        )
        db.add(rwy11_29)

        rwy16_34 = AirfieldSurface(
            airport_id=airport.id,
            identifier="16/34",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(16.5640 48.1250 183, 16.5750 48.0960 183)",
            heading=163.0,
            length=3500.0,
            width=45.0,
            threshold_position="SRID=4326;POINTZ(16.5640 48.1250 183)",
            end_position="SRID=4326;POINTZ(16.5750 48.0960 183)",
        )
        db.add(rwy16_34)
        db.flush()

        db.add(
            Obstacle(
                airport_id=airport.id,
                name="ATC Tower",
                position="SRID=4326;POINTZ(16.5680 48.1110 183)",
                height=109.0,
                radius=12.0,
                geometry=(
                    "SRID=4326;POLYGONZ(("
                    "16.5678 48.1108 183, "
                    "16.5682 48.1108 183, "
                    "16.5682 48.1112 183, "
                    "16.5678 48.1112 183, "
                    "16.5678 48.1108 183))"
                ),
                type="TOWER",
            )
        )

        db.add(
            SafetyZone(
                airport_id=airport.id,
                name="Vienna CTR",
                type="CTR",
                geometry=(
                    "SRID=4326;POLYGONZ(("
                    "16.4500 48.0400 0, "
                    "16.7000 48.0400 0, "
                    "16.7000 48.1800 0, "
                    "16.4500 48.1800 0, "
                    "16.4500 48.0400 0))"
                ),
                altitude_floor=0.0,
                altitude_ceiling=3500.0,
                is_active=True,
            )
        )

        db.commit()
        print("LOWW seeded")
    finally:
        db.close()


def seed_lzkz():
    """seed kosice international airport."""
    db = SessionLocal()
    try:
        existing = db.query(Airport).filter_by(icao_code="LZKZ").first()
        if existing:
            print("LZKZ already seeded")
            return

        airport = Airport(
            icao_code="LZKZ",
            name="Kosice International Airport",
            city="Kosice",
            country="Slovakia",
            elevation=233.0,
            location="SRID=4326;POINTZ(21.2411 48.6631 233)",
        )
        db.add(airport)
        db.flush()

        rwy = AirfieldSurface(
            airport_id=airport.id,
            identifier="01/19",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(21.2390 48.6510 233, 21.2432 48.6752 233)",
            heading=7.0,
            length=3100.0,
            width=45.0,
            threshold_position="SRID=4326;POINTZ(21.2390 48.6510 233)",
            end_position="SRID=4326;POINTZ(21.2432 48.6752 233)",
        )
        db.add(rwy)
        db.flush()

        db.commit()
        print("LZKZ seeded")
    finally:
        db.close()


def seed_eddb():
    """seed berlin brandenburg airport."""
    db = SessionLocal()
    try:
        existing = db.query(Airport).filter_by(icao_code="EDDB").first()
        if existing:
            print("EDDB already seeded")
            return

        airport = Airport(
            icao_code="EDDB",
            name="Berlin Brandenburg Airport",
            city="Berlin",
            country="Germany",
            elevation=48.0,
            location="SRID=4326;POINTZ(13.5033 52.3667 48)",
        )
        db.add(airport)
        db.flush()

        rwy07l_25r = AirfieldSurface(
            airport_id=airport.id,
            identifier="07L/25R",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(13.4780 52.3710 48, 13.5290 52.3625 48)",
            heading=70.0,
            length=4000.0,
            width=60.0,
            threshold_position="SRID=4326;POINTZ(13.4780 52.3710 48)",
            end_position="SRID=4326;POINTZ(13.5290 52.3625 48)",
        )
        db.add(rwy07l_25r)

        rwy07r_25l = AirfieldSurface(
            airport_id=airport.id,
            identifier="07R/25L",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(13.4810 52.3620 48, 13.5320 52.3535 48)",
            heading=70.0,
            length=3600.0,
            width=45.0,
            threshold_position="SRID=4326;POINTZ(13.4810 52.3620 48)",
            end_position="SRID=4326;POINTZ(13.5320 52.3535 48)",
        )
        db.add(rwy07r_25l)
        db.flush()

        db.add(
            Obstacle(
                airport_id=airport.id,
                name="Control Tower",
                position="SRID=4326;POINTZ(13.5040 52.3660 48)",
                height=72.0,
                radius=15.0,
                geometry=(
                    "SRID=4326;POLYGONZ(("
                    "13.5038 52.3658 48, "
                    "13.5042 52.3658 48, "
                    "13.5042 52.3662 48, "
                    "13.5038 52.3662 48, "
                    "13.5038 52.3658 48))"
                ),
                type="TOWER",
            )
        )

        db.commit()
        print("EDDB seeded")
    finally:
        db.close()


def seed_epwa():
    """seed warsaw chopin airport."""
    db = SessionLocal()
    try:
        existing = db.query(Airport).filter_by(icao_code="EPWA").first()
        if existing:
            print("EPWA already seeded")
            return

        airport = Airport(
            icao_code="EPWA",
            name="Warsaw Chopin Airport",
            city="Warsaw",
            country="Poland",
            elevation=110.0,
            location="SRID=4326;POINTZ(20.9671 52.1657 110)",
        )
        db.add(airport)
        db.flush()

        rwy = AirfieldSurface(
            airport_id=airport.id,
            identifier="11/29",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(20.9430 52.1690 110, 20.9910 52.1625 110)",
            heading=110.0,
            length=3690.0,
            width=60.0,
            threshold_position="SRID=4326;POINTZ(20.9430 52.1690 110)",
            end_position="SRID=4326;POINTZ(20.9910 52.1625 110)",
        )
        db.add(rwy)
        db.flush()

        db.commit()
        print("EPWA seeded")
    finally:
        db.close()


def seed_lhbp():
    """seed budapest liszt ferenc airport."""
    db = SessionLocal()
    try:
        existing = db.query(Airport).filter_by(icao_code="LHBP").first()
        if existing:
            print("LHBP already seeded")
            return

        airport = Airport(
            icao_code="LHBP",
            name="Budapest Ferenc Liszt International Airport",
            city="Budapest",
            country="Hungary",
            elevation=151.0,
            location="SRID=4326;POINTZ(19.2556 47.4393 151)",
        )
        db.add(airport)
        db.flush()

        rwy13l_31r = AirfieldSurface(
            airport_id=airport.id,
            identifier="13L/31R",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(19.2310 47.4480 151, 19.2740 47.4300 151)",
            heading=131.0,
            length=3707.0,
            width=45.0,
            threshold_position="SRID=4326;POINTZ(19.2310 47.4480 151)",
            end_position="SRID=4326;POINTZ(19.2740 47.4300 151)",
        )
        db.add(rwy13l_31r)

        rwy13r_31l = AirfieldSurface(
            airport_id=airport.id,
            identifier="13R/31L",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(19.2380 47.4430 151, 19.2810 47.4250 151)",
            heading=131.0,
            length=3010.0,
            width=45.0,
            threshold_position="SRID=4326;POINTZ(19.2380 47.4430 151)",
            end_position="SRID=4326;POINTZ(19.2810 47.4250 151)",
        )
        db.add(rwy13r_31l)
        db.flush()

        db.commit()
        print("LHBP seeded")
    finally:
        db.close()


def seed_lztt():
    """seed poprad-tatry airport."""
    db = SessionLocal()
    try:
        existing = db.query(Airport).filter_by(icao_code="LZTT").first()
        if existing:
            print("LZTT already seeded")
            return

        airport = Airport(
            icao_code="LZTT",
            name="Poprad-Tatry Airport",
            city="Poprad",
            country="Slovakia",
            elevation=718.0,
            location="SRID=4326;POINTZ(20.2411 49.0736 718)",
        )
        db.add(airport)
        db.flush()

        rwy = AirfieldSurface(
            airport_id=airport.id,
            identifier="09/27",
            surface_type="RUNWAY",
            geometry="SRID=4326;LINESTRINGZ(20.2240 49.0736 718, 20.2582 49.0736 718)",
            heading=90.0,
            length=2600.0,
            width=45.0,
            threshold_position="SRID=4326;POINTZ(20.2240 49.0736 718)",
            end_position="SRID=4326;POINTZ(20.2582 49.0736 718)",
        )
        db.add(rwy)
        db.flush()

        db.commit()
        print("LZTT seeded")
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
    """seed inspection templates."""
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
    seed_lzib()
    seed_loww()
    seed_lzkz()
    seed_eddb()
    seed_epwa()
    seed_lhbp()
    seed_lztt()
    seed_drone_profiles()
    seed_inspection_templates()
