"""Pydantic schemas for messaging."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.core.limits import MAX_MESSAGE_BODY_CHARS


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    buyer_id: uuid.UUID
    seller_id: uuid.UUID
    listing_id: uuid.UUID
    offer_id: uuid.UUID | None
    order_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_id: uuid.UUID
    body: str
    is_read: bool
    created_at: datetime


class PaginatedConversations(BaseModel):
    items: list[ConversationOut]
    total: int
    limit: int
    offset: int


class PaginatedMessages(BaseModel):
    items: list[MessageOut]
    total: int
    limit: int
    offset: int


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_MESSAGE_BODY_CHARS)


class ConversationCreate(BaseModel):
    listing_id: uuid.UUID
    recipient_id: uuid.UUID
    body: str = Field(min_length=1, max_length=MAX_MESSAGE_BODY_CHARS)
