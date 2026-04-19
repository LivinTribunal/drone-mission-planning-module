import enum


class UserRole(str, enum.Enum):
    """user access level."""

    OPERATOR = "OPERATOR"
    COORDINATOR = "COORDINATOR"
    SUPER_ADMIN = "SUPER_ADMIN"


class MissionStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PLANNED = "PLANNED"
    VALIDATED = "VALIDATED"
    EXPORTED = "EXPORTED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class WaypointType(str, enum.Enum):
    TAKEOFF = "TAKEOFF"
    TRANSIT = "TRANSIT"
    MEASUREMENT = "MEASUREMENT"
    HOVER = "HOVER"
    LANDING = "LANDING"


class CameraAction(str, enum.Enum):
    NONE = "NONE"
    PHOTO_CAPTURE = "PHOTO_CAPTURE"
    RECORDING_START = "RECORDING_START"
    RECORDING = "RECORDING"
    RECORDING_STOP = "RECORDING_STOP"


class ExportFormat(str, enum.Enum):
    MAVLINK = "MAVLINK"
    KML = "KML"
    KMZ = "KMZ"
    JSON = "JSON"
    UGCS = "UGCS"
    WPML = "WPML"
    CSV = "CSV"
    GPX = "GPX"
    LITCHI = "LITCHI"
    DRONEDEPLOY = "DRONEDEPLOY"


class InspectionMethod(str, enum.Enum):
    VERTICAL_PROFILE = "VERTICAL_PROFILE"
    ANGULAR_SWEEP = "ANGULAR_SWEEP"
    FLY_OVER = "FLY_OVER"
    PARALLEL_SIDE_SWEEP = "PARALLEL_SIDE_SWEEP"
    HOVER_POINT_LOCK = "HOVER_POINT_LOCK"


# method <-> AGL type compatibility per ZEPHYR spec
METHOD_AGL_COMPAT: dict[InspectionMethod, set[str]] = {
    InspectionMethod.VERTICAL_PROFILE: {"PAPI"},
    InspectionMethod.ANGULAR_SWEEP: {"PAPI"},
    InspectionMethod.FLY_OVER: {"RUNWAY_EDGE_LIGHTS"},
    InspectionMethod.PARALLEL_SIDE_SWEEP: {"RUNWAY_EDGE_LIGHTS"},
}


def is_method_compatible_with_agl(method: str, agl_type: str) -> bool:
    """check whether an inspection method is compatible with an AGL type."""
    try:
        m = InspectionMethod(method)
    except ValueError:
        return False
    return agl_type in METHOD_AGL_COMPAT.get(m, set())


class SafetyZoneType(str, enum.Enum):
    CTR = "CTR"
    RESTRICTED = "RESTRICTED"
    PROHIBITED = "PROHIBITED"
    TEMPORARY_NO_FLY = "TEMPORARY_NO_FLY"
    AIRPORT_BOUNDARY = "AIRPORT_BOUNDARY"


class ObstacleType(str, enum.Enum):
    BUILDING = "BUILDING"
    TOWER = "TOWER"
    ANTENNA = "ANTENNA"
    VEGETATION = "VEGETATION"
    OTHER = "OTHER"


class LampType(str, enum.Enum):
    HALOGEN = "HALOGEN"
    LED = "LED"


class PAPISide(str, enum.Enum):
    LEFT = "LEFT"
    RIGHT = "RIGHT"


class ConstraintType(str, enum.Enum):
    ALTITUDE = "ALTITUDE"
    SPEED = "SPEED"
    GEOFENCE = "GEOFENCE"
    RUNWAY_BUFFER = "RUNWAY_BUFFER"
    BATTERY = "BATTERY"


class SurfaceType(str, enum.Enum):
    RUNWAY = "RUNWAY"
    TAXIWAY = "TAXIWAY"


class FlightPlanScope(str, enum.Enum):
    """controls which waypoint types are included in the generated flight plan."""

    FULL = "FULL"
    NO_TAKEOFF_LANDING = "NO_TAKEOFF_LANDING"
    MEASUREMENTS_ONLY = "MEASUREMENTS_ONLY"


class AuditAction(str, enum.Enum):
    """action types for audit log entries."""

    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    STATUS_CHANGE = "STATUS_CHANGE"
    EXPORT = "EXPORT"
    VALIDATE = "VALIDATE"
    GENERATE_TRAJECTORY = "GENERATE_TRAJECTORY"
    INVITE_USER = "INVITE_USER"
    DEACTIVATE_USER = "DEACTIVATE_USER"
    ASSIGN_AIRPORT = "ASSIGN_AIRPORT"
    SYSTEM_SETTING_CHANGE = "SYSTEM_SETTING_CHANGE"


class ComputationStatus(str, enum.Enum):
    """trajectory computation lifecycle status."""

    IDLE = "IDLE"
    COMPUTING = "COMPUTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
