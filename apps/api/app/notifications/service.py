"""Notification creation helper: fire-and-forget DB inserts after business commits.

Usage in endpoint modules::

    from app.notifications.service import notify

    notify(db, user_id=seller_id, actor_id=buyer_id,
           type=NotificationType.OFFER_RECEIVED,
           title="New offer on your listing",
           body=f"Buyer offered ₹{amount:,}", link="#/offers")

The caller must have already committed the business transaction. This helper
creates and commits the notification row in the same session, then pushes a
real-time copy to the recipient's live WebSocket connection (if any).
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.notifications.models import Notification, NotificationType
from app.ws.manager import manager


def notify(
    db: Session,
    *,
    user_id: uuid.UUID,
    actor_id: uuid.UUID | None = None,
    type: NotificationType,
    title: str,
    body: str | None = None,
    link: str | None = None,
) -> Notification:
    """Create a notification row. Commits immediately and WS-pushes."""

    notification = Notification(
        user_id=user_id,
        actor_id=actor_id,
        type=type,
        title=title,
        body=body,
        link=link,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    manager.push_to_user(
        user_id,
        {
            "event": "notification",
            "data": {
                "id": str(notification.id),
                "user_id": str(notification.user_id),
                "actor_id": str(notification.actor_id) if notification.actor_id else None,
                "type": notification.type.value,
                "title": notification.title,
                "body": notification.body,
                "link": notification.link,
                "is_read": notification.is_read,
                "created_at": notification.created_at.isoformat(),
            },
        },
    )
    return notification