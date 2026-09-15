"""Reports API: authenticated users report listings or users.

POST  /reports                   -> create a report
GET   /reports/me                -> my reports (newest first)
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.catalog.models import Listing
from app.db.session import get_db_session
from app.identity.dependencies import require_active_user, require_authenticated_user
from app.identity.models import User
from app.reports.models import Report, ReportStatus, ReportTargetType
from app.reports.schemas import (
    PaginatedReports,
    ReportCreate,
    ReportOut,
)

router = APIRouter(prefix="/reports", tags=["reports"])

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100

_ALLOWED_REASONS = {
    "SPAM",
    "FAKE_LISTING",
    "INAPPROPRIATE_CONTENT",
    "MISLEADING_PRICE",
    "PROHIBITED_ITEM",
    "SCAM",
    "HARASSMENT",
    "FRAUD",
    "OTHER",
}


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    payload: ReportCreate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> ReportOut:
    """Create a report against a listing or user (one per target per reporter)."""

    if payload.target_type not in ("LISTING", "USER"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="target_type must be LISTING or USER.",
        )
    target_type = ReportTargetType(payload.target_type)
    if payload.reason not in _ALLOWED_REASONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid reason. Use one of: {', '.join(sorted(_ALLOWED_REASONS))}.",
        )
    if target_type == ReportTargetType.LISTING:
        if payload.target_listing_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_listing_id is required for LISTING reports.",
            )
        listing = db.get(Listing, payload.target_listing_id)
        if listing is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
            )
        if listing.seller_id == user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot report your own listing.",
            )
        target_listing_id, target_user_id = listing.id, None
    else:
        if payload.target_user_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_user_id is required for USER reports.",
            )
        if payload.target_user_id == user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot report yourself.",
            )
        target = db.get(User, payload.target_user_id)
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found."
            )
        target_listing_id, target_user_id = None, target.id

    existing = None
    if target_type == ReportTargetType.LISTING:
        existing = db.scalars(
            select(Report).where(
                Report.reporter_id == user.id,
                Report.target_type == target_type,
                Report.target_listing_id == target_listing_id,
            )
        ).first()
    else:
        existing = db.scalars(
            select(Report).where(
                Report.reporter_id == user.id,
                Report.target_type == target_type,
                Report.target_user_id == target_user_id,
            )
        ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already reported this target.",
        )

    report = Report(
        reporter_id=user.id,
        target_type=target_type,
        target_listing_id=target_listing_id,
        target_user_id=target_user_id,
        reason=payload.reason,
        details=payload.details,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return ReportOut.model_validate(report)


@router.get("/me", response_model=PaginatedReports)
def my_reports(
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> PaginatedReports:
    """The authenticated user's reports, newest first."""

    total = (
        db.scalar(
            select(func.count()).select_from(Report).where(Report.reporter_id == user.id)
        )
        or 0
    )
    rows = list(
        db.scalars(
            select(Report)
            .where(Report.reporter_id == user.id)
            .order_by(Report.created_at.desc(), Report.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedReports(
        items=[ReportOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )