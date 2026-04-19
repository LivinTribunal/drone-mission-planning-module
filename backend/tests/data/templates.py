TEMPLATE_UPDATE_PAYLOAD = {
    "name": "Updated Sweep",
    "methods": ["PAPI_HORIZONTAL_RANGE", "VERTICAL_PROFILE"],
}

THROWAWAY_TEMPLATE_PAYLOAD = {"name": "Temp Template", "methods": []}

TEMPLATE_PAYLOAD = {
    "name": "PAPI Horizontal Range",
    "description": "papi horizontal range for PAPI",
    "methods": ["PAPI_HORIZONTAL_RANGE"],
    "default_config": {
        "altitude_offset": 0.0,
        "measurement_density": 10,
    },
}
