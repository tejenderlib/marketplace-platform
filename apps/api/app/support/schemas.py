"""Pydantic schemas for support tickets."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.limits import (
    MAX_MESSAGE_BODY_CHARS,
    MAX_SUPPORT_DESCRIPTION_CHARS,
    MAX_SUPPORT_SUBJECT_CHARS,
)


class SupportTicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    subject: str
    description: str
    status: str
    priority: str
    created_at: datetime
    updated_at: datetime


class SupportTicketMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ticket_id: uuid.UUID
    author_id: uuid.UUID | None
    body: str
    created_at: datetime


class PaginatedSupportTickets(BaseModel):
    items: list[SupportTicketOut]
    total: int
    limit: int
    offset: int


class PaginatedSupportMessages(BaseModel):
    items: list[SupportTicketMessageOut]
    total: int
    limit: int
    offset: int


class SupportTicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=MAX_SUPPORT_SUBJECT_CHARS)
    description: str = Field(min_length=1, max_length=MAX_SUPPORT_DESCRIPTION_CHARS)


class SupportTicketUpdate(BaseModel):
    status: str | None = None
    priority: str | None = None


class SupportMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_MESSAGE_BODY_CHARS)
