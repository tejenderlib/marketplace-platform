"""Support ticket models: user-submitted support requests with threaded replies.

Tables: support_tickets, support_ticket_messages.

Conventions match project schema:
- SQLAlchemy 2.x mapped_column on shared DeclarativeBase.
- UUID PKs, TIMESTAMPTZ, native ENUMs.
- Status-managed: OPEN -> IN_PROGRESS -> WAITING_FOR_CUSTOMER -> RESOLVED | CLOSED.
- Messages are immutable after insert.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

Timestamptz = DateTime(timezone=True)


class SupportTicketStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_FOR_CUSTOMER = "WAITING_FOR_CUSTOMER"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class SupportTicketPriority(str, enum.Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    URGENT = "URGENT"


support_ticket_status_enum = PG_ENUM(
    SupportTicketStatus, name="support_ticket_status", create_type=True
)
support_ticket_priority_enum = PG_ENUM(
    SupportTicketPriority, name="support_ticket_priority", create_type=True
)


class SupportTicket(Base):
    """A support request submitted by a user."""

    __tablename__ = "support_tickets"
    __table_args__ = (
        Index("ix_support_tickets_user_id", "user_id"),
        Index("ix_support_tickets_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_support_tickets_user_id"),
        nullable=False,
    )
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[SupportTicketStatus] = mapped_column(
        support_ticket_status_enum,
        nullable=False, default=SupportTicketStatus.OPEN, server_default="OPEN",
    )
    priority: Mapped[SupportTicketPriority] = mapped_column(
        support_ticket_priority_enum,
        nullable=False, default=SupportTicketPriority.NORMAL, server_default="NORMAL",
    )
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    messages: Mapped[list[SupportTicketMessage]] = relationship(
        back_populates="ticket",
        order_by="SupportTicketMessage.created_at",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class SupportTicketMessage(Base):
    """A single message within a support ticket thread."""

    __tablename__ = "support_ticket_messages"
    __table_args__ = (
        Index("ix_support_ticket_messages_ticket_created", "ticket_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE", name="fk_stm_ticket_id"),
        nullable=False,
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL", name="fk_stm_author_id"),
        nullable=True,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )

    ticket: Mapped[SupportTicket] = relationship(back_populates="messages")
