TEMPLATE_UPDATE_PAYLOAD = {
    "name": "Updated Sweep",
    "methods": ["ANGULAR_SWEEP", "VERTICAL_PROFILE"],
}

THROWAWAY_TEMPLATE_PAYLOAD = {"name": "Temp Template", "methods": []}

TEMPLATE_PAYLOAD = {
    "name": "PAPI Angular Sweep",
    "description": "angular sweep for PAPI",
    "methods": ["ANGULAR_SWEEP"],
    "default_config": {
        "altitude_offset": 0.0,
        "speed_override": 5.0,
        "measurement_density": 10,
    },
}
