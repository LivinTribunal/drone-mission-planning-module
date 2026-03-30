"""domain exceptions for service layer"""


class DomainError(Exception):
    """base exception for domain/business errors"""

    def __init__(self, message: str, status_code: int = 400, extra: dict | None = None):
        """create domain error with message and suggested http status"""
        self.message = message
        self.status_code = status_code
        self.extra = extra
        super().__init__(message)


class NotFoundError(DomainError):
    """entity not found"""

    def __init__(self, message: str = "not found"):
        """create not found error"""
        super().__init__(message, status_code=404)


class ConflictError(DomainError):
    """operation conflicts with existing state"""

    def __init__(self, message: str = "conflict"):
        """create conflict error"""
        super().__init__(message, status_code=409)


class TrajectoryGenerationError(DomainError):
    """trajectory generation failed due to constraint violations or missing data"""

    def __init__(self, message: str, violations: list[dict] | None = None):
        """create trajectory generation error with optional violation details"""
        self.violations = violations
        super().__init__(message, status_code=400)
