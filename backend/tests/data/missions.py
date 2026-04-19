MISSION_AIRPORT_PAYLOAD = {
    "icao_code": "LKMT",
    "name": "Mosnov Airport",
    "elevation": 260.0,
    "location": {"type": "Point", "coordinates": [18.11, 49.69, 260.0]},
}

STATUS_TEST_AIRPORT_PAYLOAD = {
    "icao_code": "LKVO",
    "name": "Vodochody Airport",
    "elevation": 280.0,
    "location": {"type": "Point", "coordinates": [14.39, 50.22, 280.0]},
}

MISSION_UPDATE_PAYLOAD = {"name": "Updated Mission", "operator_notes": "test notes"}

MISSION_SPEED_UPDATE_PAYLOAD = {"default_speed": 10.0}

INVALID_AIRPORT_ID = "00000000-0000-0000-0000-000000000000"

MISSION_TEMPLATE_PAYLOAD = {"name": "Mission Test Template", "methods": ["PAPI_HORIZONTAL_RANGE"]}
