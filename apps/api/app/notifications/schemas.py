"""Pydantic schemas for notifications."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    actor_id: uuid.UUID | None
    type: str
    title: str
    body: str | None
    link: str | None
    is_read: bool
    created_at: datetime


class PaginatedNotifications(BaseModel):
    items: list[NotificationOut]
    total: int
    limit: int
    offset: int


class UnreadCount(BaseModel):
    count: int
