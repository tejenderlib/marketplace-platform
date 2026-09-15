"""Messaging API: direct buyer-seller conversations with thread replies.

GET   /messages/conversations                  -> my conversations (newest first)
POST  /messages/conversations                  -> start a conversation + first message
GET   /messages/conversations/{conversation_id}-> messages in one thread (marks other party's msgs read)
POST  /messages/conversations/{conversation_id}/messages -> send a reply

Duplicate suppression: an identical body from the same sender in the
same conversation inside a short window returns the earlier row (200)
instead of creating a duplicate — accidental double-clicks/retries do
not produce doubled messages. Different content always creates a new
row.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.catalog.models import Listing
from app.core.limits import DUPLICATE_MESSAGE_WINDOW_SECONDS
from app.db.session import get_db_session
from app.identity.dependencies import require_active_user, require_authenticated_user
from app.identity.models import User
from app.messaging.models import Conversation, Message
from app.messaging.schemas import (
    ConversationCreate,
    ConversationOut,
    MessageCreate,
    MessageOut,
    PaginatedConversations,
    PaginatedMessages,
)

router = APIRouter(prefix="/messages", tags=["messages"])

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100


def _is_participant(conversation: Conversation, user: User) -> bool:
    return user.id in (conversation.buyer_id, conversation.seller_id)


def _recent_duplicate(
    db: Session, conversation_id: uuid.UUID, sender_id: uuid.UUID, body: str
) -> Message | None:
    """Same sender + same body in this conversation within the window."""

    since = datetime.now(timezone.utc) - timedelta(
        seconds=DUPLICATE_MESSAGE_WINDOW_SECONDS
    )
    return db.scalars(
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.sender_id == sender_id,
            Message.body == body,
            Message.created_at >= since,
        )
        .order_by(Message.created_at.desc())
        .limit(1)
    ).first()


@router.get("/conversations", response_model=PaginatedConversations)
def list_conversations(
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> PaginatedConversations:
    """The authenticated user's conversations, most recently active first."""

    filters = [
        (Conversation.buyer_id == user.id) | (Conversation.seller_id == user.id)
    ]
    total = db.scalar(select(func.count()).select_from(Conversation).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Conversation)
            .where(*filters)
            .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedConversations(
        items=[ConversationOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/conversations", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def start_conversation(
    payload: ConversationCreate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> MessageOut:
    """Start a conversation with a listing's counterparty and send the first message."""

    if user.id == payload.recipient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot start a conversation with yourself.",
        )
    listing = db.get(Listing, payload.listing_id)
    if listing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    recipient = db.get(User, payload.recipient_id)
    if recipient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found."
        )

    seller_id = listing.seller_id
    buyer_id = (
        payload.recipient_id if user.id == seller_id else user.id
    )

    existing = db.scalars(
        select(Conversation).where(
            Conversation.buyer_id == buyer_id,
            Conversation.seller_id == seller_id,
            Conversation.listing_id == listing.id,
        )
    ).first()
    conversation = existing
    if conversation is None:
        conversation = Conversation(
            buyer_id=buyer_id,
            seller_id=seller_id,
            listing_id=listing.id,
        )
        db.add(conversation)
    else:
        duplicate = _recent_duplicate(db, conversation.id, user.id, payload.body.strip())
        if duplicate is not None:
            db.rollback()
            return MessageOut.model_validate(duplicate)
        conversation.updated_at = func.now()

    message = Message(
        conversation=conversation,
        sender_id=user.id,
        body=payload.body,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return MessageOut.model_validate(message)


@router.get("/conversations/{conversation_id}", response_model=PaginatedMessages)
def conversation_messages(
    conversation_id: uuid.UUID,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> PaginatedMessages:
    """Messages in a conversation; marks the other party's messages read."""

    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found."
        )
    if not _is_participant(conversation, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only view your own conversations.",
        )

    db.execute(
        update(Message)
        .where(
            Message.conversation_id == conversation.id,
            Message.sender_id != user.id,
            Message.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    db.commit()

    total = (
        db.scalar(
            select(func.count())
            .select_from(Message)
            .where(Message.conversation_id == conversation.id)
        )
        or 0
    )
    rows = list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.asc(), Message.id.asc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedMessages(
        items=[MessageOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    conversation_id: uuid.UUID,
    payload: MessageCreate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> MessageOut:
    """Send a reply within a conversation you participate in."""

    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found."
        )
    if not _is_participant(conversation, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only message within your own conversations.",
        )
    if not payload.body.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message body cannot be empty.",
        )
    body = payload.body.strip()
    duplicate = _recent_duplicate(db, conversation.id, user.id, body)
    if duplicate is not None:
        db.rollback()
        return MessageOut.model_validate(duplicate)
    message = Message(
        conversation_id=conversation.id,
        sender_id=user.id,
        body=body,
    )
    conversation.updated_at = func.now()
    db.add(message)
    db.commit()
    db.refresh(message)
    return MessageOut.model_validate(message)