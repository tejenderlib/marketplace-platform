"""Pydantic schemas for reports."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.limits import MAX_REPORT_DETAILS_CHARS, MAX_REPORT_REASON_CHARS


class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reporter_id: uuid.UUID
    target_type: str
    target_listing_id: uuid.UUID | None
    target_user_id: uuid.UUID | None
    reason: str
    details: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class PaginatedReports(BaseModel):
    items: list[ReportOut]
    total: int
    limit: int
    offset: int


class ReportCreate(BaseModel):
    target_type: str
    target_listing_id: uuid.UUID | None = None
    target_user_id: uuid.UUID | None = None
    reason: str = Field(min_length=1, max_length=MAX_REPORT_REASON_CHARS)
    details: str | None = Field(default=None, max_length=MAX_REPORT_DETAILS_CHARS)


class ReportStatusUpdate(BaseModel):
    status: str
