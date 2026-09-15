"""Notifications API: authenticated read/update for in-app bell.

GET  /notifications              -> paginated notifications (newest first)
GET  /notifications/unread-count -> { count: N }
PATCH /notifications/{id}/read   -> mark one as read
POST /notifications/mark-read    -> mark all my as read
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.identity.dependencies import require_active_user, require_authenticated_user
from app.identity.models import User
from app.notifications.models import Notification
from app.notifications.schemas import (
    NotificationOut,
    PaginatedNotifications,
    UnreadCount,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100


@router.get("", response_model=PaginatedNotifications)
def list_notifications(
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> PaginatedNotifications:
    """My notifications, newest first. Full history preserved."""

    total = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id)
    ) or 0
    rows = list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedNotifications(
        items=[NotificationOut.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> UnreadCount:
    """Count of unread notifications for the bell badge."""

    count = db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.is_read == False)  # noqa: E712
    ) or 0
    return UnreadCount(count=count)


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: uuid.UUID,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> NotificationOut:
    """Mark a single notification as read. Only own notifications allowed."""

    notif = db.get(Notification, notification_id)
    if notif is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        )
    if notif.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your notification.",
        )
    if not notif.is_read:
        notif.is_read = True
        db.commit()
        db.refresh(notif)
    return NotificationOut.model_validate(notif)


@router.post("/mark-read", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> None:
    """Mark all my unread notifications as read (bulk)."""

    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read == False)  # noqa: E712
        .values(is_read=True)
    )
    db.commit()
