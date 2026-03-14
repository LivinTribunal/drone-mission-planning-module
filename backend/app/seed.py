from app.core.database import SessionLocal
from app.models.agl import AGL, LHA
from app.models.airport import AirfieldSurface, Airport, Obstacle, SafetyZone


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
            geometry=("SRID=4326;LINESTRINGZ(" "14.2436 50.1044 380, " "14.2764 50.0972 380)"),
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


if __name__ == "__main__":
    seed_lkpr()
