class RequestInputError(Exception):
    """An input error that needs a field-specific stable API response."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message
