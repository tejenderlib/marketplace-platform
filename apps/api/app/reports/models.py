"""Reports models: user-submitted reports for listings and users.

Table: reports.

Conventions match project schema:
- SQLAlchemy 2.x mapped_column on shared DeclarativeBase.
- UUID PKs, TIMESTAMPTZ, native ENUMs.
- Reports are status-managed (OPEN -> UNDER_REVIEW -> RESOLVED | DISMISSED).
- One report per (reporter, target_type, target_id) combination.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

Timestamptz = DateTime(timezone=True)


class ReportTargetType(str, enum.Enum):
    LISTING = "LISTING"
    USER = "USER"


class ReportStatus(str, enum.Enum):
    OPEN = "OPEN"
    UNDER_REVIEW = "UNDER_REVIEW"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"


report_target_type_enum = PG_ENUM(
    ReportTargetType, name="report_target_type", create_type=True
)
report_status_enum = PG_ENUM(
    ReportStatus, name="report_status", create_type=True
)


class Report(Base):
    """A user-submitted report against a listing or another user."""

    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint(
            "(target_type = 'LISTING' AND target_listing_id IS NOT NULL AND target_user_id IS NULL) OR "
            "(target_type = 'USER' AND target_listing_id IS NULL AND target_user_id IS NOT NULL)",
            name="ck_reports_target_consistent",
        ),
        UniqueConstraint(
            "reporter_id", "target_type", "target_listing_id",
            name="uq_reports_reporter_listing",
        ),
        UniqueConstraint(
            "reporter_id", "target_type", "target_user_id",
            name="uq_reports_reporter_user",
        ),
        Index("ix_reports_reporter_id", "reporter_id"),
        Index("ix_reports_status", "status"),
        Index("ix_reports_target_listing", "target_listing_id"),
        Index("ix_reports_target_user", "target_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_reports_reporter_id"),
        nullable=False,
    )
    target_type: Mapped[ReportTargetType] = mapped_column(
        report_target_type_enum, nullable=False
    )
    target_listing_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("listings.id", ondelete="CASCADE", name="fk_reports_listing_id"),
        nullable=True,
    )
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE", name="fk_reports_user_id"),
        nullable=True,
    )
    reason: Mapped[str] = mapped_column(String(120), nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ReportStatus] = mapped_column(
        report_status_enum, nullable=False, default=ReportStatus.OPEN, server_default="OPEN"
    )
    created_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        Timestamptz, nullable=False, server_default=func.now(), onupdate=func.now()
    )
