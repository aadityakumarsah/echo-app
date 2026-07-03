from __future__ import annotations

from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class ErrorDetail(BaseModel):
    field: Optional[str] = None
    code: str
    detail: str


class Pagination(BaseModel):
    next_cursor: Optional[str] = None
    prev_cursor: Optional[str] = None
    has_next: bool
    has_prev: bool
    limit: int


class PaginatedData(BaseModel, Generic[T]):
    items: List[T]
    pagination: Pagination


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    message: str
    data: Optional[T] = None
    errors: Optional[List[ErrorDetail]] = None


# ── helpers ────────────────────────────────────────────────────────────────────

def ok(message: str, data: T) -> ApiResponse[T]:
    return ApiResponse(success=True, message=message, data=data, errors=None)


def fail(
    message: str,
    errors: Optional[List[ErrorDetail]] = None,
) -> ApiResponse:
    return ApiResponse(success=False, message=message, data=None, errors=errors)


def field_error(field: str, code: str, detail: str) -> ErrorDetail:
    return ErrorDetail(field=field, code=code, detail=detail)
