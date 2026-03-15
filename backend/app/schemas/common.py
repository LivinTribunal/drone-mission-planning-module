from pydantic import BaseModel


class DeleteResponse(BaseModel):
    """shared delete response"""

    deleted: bool
    warnings: list[str] = []
