AIRPORT_PAYLOAD = {
    "icao_code": "LKPR",
    "name": "Prague Airport",
    "elevation": 380.0,
    "location": {"type": "Point", "coordinates": [14.26, 50.10, 380.0]},
}

SURFACE_PAYLOAD = {
    "identifier": "06/24",
    "surface_type": "RUNWAY",
    "geometry": {
        "type": "LineString",
        "coordinates": [[14.24, 50.10, 380], [14.27, 50.09, 380]],
    },
    "heading": 243.0,
    "length": 3715.0,
    "width": 45.0,
}

OBSTACLE_PAYLOAD = {
    "name": "Tower",
    "position": {"type": "Point", "coordinates": [14.262, 50.101, 380]},
    "height": 40.0,
    "radius": 15.0,
    "geometry": {
        "type": "Polygon",
        "coordinates": [
            [
                [14.261, 50.100, 380],
                [14.263, 50.100, 380],
                [14.263, 50.102, 380],
                [14.261, 50.102, 380],
                [14.261, 50.100, 380],
            ]
        ],
    },
    "type": "TOWER",
}

SAFETY_ZONE_PAYLOAD = {
    "name": "Prague CTR",
    "type": "CTR",
    "geometry": {
        "type": "Polygon",
        "coordinates": [
            [
                [14.18, 50.05, 0],
                [14.34, 50.05, 0],
                [14.34, 50.15, 0],
                [14.18, 50.15, 0],
                [14.18, 50.05, 0],
            ]
        ],
    },
    "altitude_floor": 0.0,
    "altitude_ceiling": 2500.0,
}

AGL_PAYLOAD = {
    "agl_type": "PAPI",
    "name": "PAPI RWY 24",
    "position": {"type": "Point", "coordinates": [14.274, 50.097, 380]},
    "side": "LEFT",
    "glide_slope_angle": 3.0,
}

LHA_PAYLOAD = {
    "unit_number": 1,
    "setting_angle": 3.0,
    "lamp_type": "HALOGEN",
    "position": {"type": "Point", "coordinates": [14.2743, 50.0978, 380]},
}

AIRPORT_UPDATE_PAYLOAD = {"name": "Vaclav Havel"}

THROWAWAY_AIRPORT_PAYLOAD = {
    "icao_code": "LKTB",
    "name": "Brno Airport",
    "elevation": 241.0,
    "location": {"type": "Point", "coordinates": [16.69, 49.15, 241.0]},
}
