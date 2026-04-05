import enum


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


class InspectionMethod(str, enum.Enum):
    VERTICAL_PROFILE = "VERTICAL_PROFILE"
    ANGULAR_SWEEP = "ANGULAR_SWEEP"


class SafetyZoneType(str, enum.Enum):
    CTR = "CTR"
    RESTRICTED = "RESTRICTED"
    PROHIBITED = "PROHIBITED"
    TEMPORARY_NO_FLY = "TEMPORARY_NO_FLY"


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
