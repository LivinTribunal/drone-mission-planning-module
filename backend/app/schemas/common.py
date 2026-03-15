from pydantic import BaseModel


class DeleteResponse(BaseModel):
    """shared delete response"""

    deleted: bool
    warnings: list[str] = []


class ListMeta(BaseModel):
    """shared list metadata"""

    total: int
    limit: int | None = None
    offset: int | None = None
