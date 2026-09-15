"""Support API: authenticated users create tickets and chat with support.

POST  /support/tickets                          -> create a ticket
GET  /support/tickets                          -> my tickets (newest first)
GET  /support/tickets/{ticket_id}              -> ticket detail + messages
POST  /support/tickets/{ticket_id}/messages     -> reply to your own ticket

Duplicate suppression: an identical reply from the same author within a
short window returns the earlier row instead of creating a duplicate.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.limits import DUPLICATE_MESSAGE_WINDOW_SECONDS
from app.db.session import get_db_session
from app.identity.dependencies import require_active_user, require_authenticated_user
from app.identity.models import User
from app.support.models import SupportTicket, SupportTicketMessage
from app.support.schemas import (
    PaginatedSupportTickets,
    SupportMessageCreate,
    SupportTicketCreate,
    SupportTicketMessageOut,
    SupportTicketOut,
)

router = APIRouter(prefix="/support", tags=["support"])

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100


def _recent_duplicate_reply(
    db: Session, ticket_id: uuid.UUID, author_id: uuid.UUID, body: str
) -> SupportTicketMessage | None:
    since = datetime.now(timezone.utc) - timedelta(
        seconds=DUPLICATE_MESSAGE_WINDOW_SECONDS
    )
    return db.scalars(
        select(SupportTicketMessage)
        .where(
            SupportTicketMessage.ticket_id == ticket_id,
            SupportTicketMessage.author_id == author_id,
            SupportTicketMessage.body == body,
            SupportTicketMessage.created_at >= since,
        )
        .order_by(SupportTicketMessage.created_at.desc())
        .limit(1)
    ).first()


def _get_ticket_or_404(ticket_id: uuid.UUID, db: Session) -> SupportTicket:
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )
    return ticket


def _check_owner(ticket: SupportTicket, user: User) -> None:
    if ticket.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only view your own tickets.",
        )


@router.post("/tickets", response_model=SupportTicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: SupportTicketCreate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> SupportTicketOut:
    """Create a new support ticket for the authenticated user."""

    if not payload.subject.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Subject cannot be empty.",
        )
    if not payload.description.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Description cannot be empty.",
        )
    ticket = SupportTicket(
        user_id=user.id,
        subject=payload.subject.strip(),
        description=payload.description.strip(),
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return SupportTicketOut.model_validate(ticket)


@router.get("/tickets", response_model=PaginatedSupportTickets)
def my_tickets(
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> PaginatedSupportTickets:
    """The authenticated user's tickets, newest first."""

    total = (
        db.scalar(
            select(func.count())
            .select_from(SupportTicket)
            .where(SupportTicket.user_id == user.id)
        )
        or 0
    )
    rows = list(
        db.scalars(
            select(SupportTicket)
            .where(SupportTicket.user_id == user.id)
            .order_by(SupportTicket.created_at.desc(), SupportTicket.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedSupportTickets(
        items=[SupportTicketOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/tickets/{ticket_id}", response_model=SupportTicketOut)
def ticket_detail(
    ticket_id: uuid.UUID,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> SupportTicketOut:
    """Single ticket (owner only)."""

    ticket = _get_ticket_or_404(ticket_id, db)
    _check_owner(ticket, user)
    return SupportTicketOut.model_validate(ticket)


@router.get("/tickets/{ticket_id}/messages", response_model=list[SupportTicketMessageOut])
def ticket_messages(
    ticket_id: uuid.UUID,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> list[SupportTicketMessageOut]:
    """Thread messages for the authenticated user's ticket."""

    ticket = _get_ticket_or_404(ticket_id, db)
    _check_owner(ticket, user)
    rows = list(
        db.scalars(
            select(SupportTicketMessage)
            .where(SupportTicketMessage.ticket_id == ticket.id)
            .order_by(SupportTicketMessage.created_at.asc(), SupportTicketMessage.id.asc())
        ).all()
    )
    return [SupportTicketMessageOut.model_validate(row) for row in rows]


@router.post(
    "/tickets/{ticket_id}/messages",
    response_model=SupportTicketMessageOut,
    status_code=status.HTTP_201_CREATED,
)
def reply_ticket(
    ticket_id: uuid.UUID,
    payload: SupportMessageCreate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> SupportTicketMessageOut:
    """Reply to a ticket you own; reopens a WAITING_FOR_CUSTOMER ticket."""

    ticket = _get_ticket_or_404(ticket_id, db)
    _check_owner(ticket, user)
    if not payload.body.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message body cannot be empty.",
        )
    if ticket.status in ("RESOLVED", "CLOSED"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Closed tickets cannot receive replies.",
        )
    body = payload.body.strip()
    duplicate = _recent_duplicate_reply(db, ticket.id, user.id, body)
    if duplicate is not None:
        db.rollback()
        return SupportTicketMessageOut.model_validate(duplicate)
    message = SupportTicketMessage(
        ticket_id=ticket.id,
        author_id=user.id,
        body=body,
    )
    if ticket.status == "WAITING_FOR_CUSTOMER":
        ticket.status = "IN_PROGRESS"
    db.add(message)
    db.commit()
    db.refresh(message)
    return SupportTicketMessageOut.model_validate(message)