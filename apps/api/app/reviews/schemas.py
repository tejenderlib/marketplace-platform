"""Pydantic schemas for ratings & reviews."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    """Input for a new review. Prices/eligibility are never accepted:
    only the order, a 1-5 rating, and an optional comment.
    """

    model_config = ConfigDict(extra="ignore")

    order_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    reviewer_id: uuid.UUID
    reviewee_id: uuid.UUID
    rating: int
    comment: str | None
    status: str
    removed_at: datetime | None
    created_at: datetime


class PaginatedReviews(BaseModel):
    items: list[ReviewOut]
    total: int
    limit: int
    offset: int


class ReviewSummary(BaseModel):
    """Public-facing reviewee summary: ACTIVE reviews only + aggregate."""

    user_id: uuid.UUID
    total: int
    average_rating: float | None
    limit: int
    offset: int
    items: list[ReviewOut]