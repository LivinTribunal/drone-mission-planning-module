TEMPLATE_UPDATE_PAYLOAD = {
    "name": "Updated Sweep",
    "methods": ["HORIZONTAL_RANGE", "VERTICAL_PROFILE"],
}

THROWAWAY_TEMPLATE_PAYLOAD = {"name": "Temp Template", "methods": []}

TEMPLATE_PAYLOAD = {
    "name": "Horizontal Range",
    "description": "horizontal range for PAPI",
    "methods": ["HORIZONTAL_RANGE"],
    "default_config": {
        "altitude_offset": 0.0,
        "measurement_density": 10,
    },
}
