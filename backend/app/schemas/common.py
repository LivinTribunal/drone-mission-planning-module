from typing import Literal

from pydantic import BaseModel

# white balance presets
WhiteBalanceStr = Literal["DAYLIGHT", "CLOUDY", "TUNGSTEN", "MANUAL_4000K"]
# focus mode: AUTO lets the camera autofocus; INFINITY locks focus at infinity
FocusModeStr = Literal["AUTO", "INFINITY"]


class DeleteResponse(BaseModel):
    """shared delete response"""

    deleted: bool
    warnings: list[str] = []


class ListMeta(BaseModel):
    """shared list metadata"""

    total: int
    limit: int | None = None
    offset: int | None = None
