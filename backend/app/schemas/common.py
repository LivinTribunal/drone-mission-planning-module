from typing import Literal

from pydantic import BaseModel

# white balance presets
WhiteBalanceStr = Literal["DAYLIGHT", "CLOUDY", "TUNGSTEN", "MANUAL_4000K"]
# focus mode values
FocusModeStr = Literal["MANUAL", "AUTO_CENTER", "AUTO_AREA"]


class DeleteResponse(BaseModel):
    """shared delete response"""

    deleted: bool
    warnings: list[str] = []


class ListMeta(BaseModel):
    """shared list metadata"""

    total: int
    limit: int | None = None
    offset: int | None = None
