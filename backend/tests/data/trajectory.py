TRAJECTORY_AIRPORT_PAYLOAD = {
    "icao_code": "LKNA",
    "name": "Trajectory Test Airport",
    "elevation": 300.0,
    "location": {"type": "Point", "coordinates": [14.26, 50.10, 300]},
}

TRAJECTORY_SURFACE_PAYLOAD = {
    "identifier": "06/24",
    "surface_type": "RUNWAY",
    "geometry": {
        "type": "LineString",
        "coordinates": [[14.24, 50.10, 300], [14.28, 50.09, 300]],
    },
    "heading": 243.0,
    "length": 3500.0,
    "width": 45.0,
}

TRAJECTORY_AGL_PAYLOAD = {
    "agl_type": "PAPI",
    "name": "Test PAPI",
    "position": {"type": "Point", "coordinates": [14.274, 50.098, 300]},
    "side": "LEFT",
    "glide_slope_angle": 3.0,
}

TRAJECTORY_DRONE_PAYLOAD = {
    "name": "E2E Test Drone",
    "max_speed": 23.0,
    "max_altitude": 500.0,
    "endurance_minutes": 55.0,
    "camera_frame_rate": 30,
    "sensor_fov": 84.0,
}


# offset from runway to avoid transit crossing violations
DEFAULT_TAKEOFF = {"type": "Point", "coordinates": [14.26, 50.105, 300]}
DEFAULT_LANDING = {"type": "Point", "coordinates": [14.26, 50.105, 300]}


DESIGNATOR_MAP = {1: "D", 2: "C", 3: "B", 4: "A"}


def make_lha_payload(i: int) -> dict:
    """build lha create payload with icao-style designator."""
    return {
        "unit_designator": DESIGNATOR_MAP[i],
        "setting_angle": 3.0 + (i - 1) * 0.5,
        "lamp_type": "HALOGEN",
        "position": {
            "type": "Point",
            "coordinates": [14.274 + i * 0.0003, 50.098, 300],
        },
    }
