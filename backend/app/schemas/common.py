from typing import Literal

from pydantic import BaseModel

# white balance presets
WhiteBalanceStr = Literal["DAYLIGHT", "CLOUDY", "TUNGSTEN", "MANUAL_4000K"]
# focus mode values
FocusModeStr = Literal["MANUAL", "AUTO_CENTER", "AUTO_AREA"]
# focus distance mode: AUTO lets the camera autofocus; INFINITY locks focus at infinity
FocusDistanceModeStr = Literal["AUTO", "INFINITY"]


class DeleteResponse(BaseModel):
    """shared delete response"""

    deleted: bool
    warnings: list[str] = []


class ListMeta(BaseModel):
    """shared list metadata"""

    total: int
    limit: int | None = None
    offset: int | None = None
