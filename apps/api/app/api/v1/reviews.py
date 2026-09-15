"""Ratings & reviews API: authenticated create/read.

POST /reviews                     -> create a review for a completed order.
GET  /reviews/my                  -> reviews I wrote (ACTIVE + REMOVED history).
GET  /reviews/reviewee/{user_id}  -> ACTIVE reviews about a user + aggregate.

Eligibility is enforced server-side only: the reviewer must be the order's
buyer or seller, the order must be DELIVERED (the single terminal completed
state), and one review per reviewer per order. Admins moderate removals via
/exists admin router (soft REMOVED transition + moderation_actions audit).
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.identity.dependencies import require_active_user, require_authenticated_user
from app.identity.models import User, UserStatus
from app.notifications.models import NotificationType
from app.notifications.service import notify
from app.orders.models import Order, OrderStatus
from app.reviews.models import Review, ReviewStatus
from app.reviews.schemas import (
    PaginatedReviews,
    ReviewCreate,
    ReviewOut,
    ReviewSummary,
)

router = APIRouter(prefix="/reviews", tags=["reviews"])

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100

# DELIVERED is the terminal completed order state; nothing else qualifies.
ELIGIBLE_ORDER_STATUSES = (OrderStatus.DELIVERED,)


@router.post("", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
def create_review(
    payload: ReviewCreate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> ReviewOut:
    """Write a review for an order I was part of, once its order is DELIVERED."""

    # Locking the order serializes reviews per order: exactly one review per
    # reviewer is also enforced by uq_reviews_order_reviewer as backstop.
    order = db.scalars(
        select(Order).where(Order.id == payload.order_id).with_for_update()
    ).first()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    if order.status not in ELIGIBLE_ORDER_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Order is {order.status.value}; reviews require "
                f"{'/'.join(s.value for s in ELIGIBLE_ORDER_STATUSES)} orders."
            ),
        )
    if user.id == order.buyer_id:
        reviewee_id = order.seller_id
    elif user.id == order.seller_id:
        reviewee_id = order.buyer_id
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the buyer or seller on the order may review it.",
        )
    existing = db.scalars(
        select(Review).where(
            Review.order_id == order.id, Review.reviewer_id == user.id
        )
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You have already reviewed this order.",
        )

    comment = payload.comment.strip() if payload.comment else None
    review = Review(
        order_id=order.id,
        reviewer_id=user.id,
        reviewee_id=reviewee_id,
        rating=payload.rating,
        comment=comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    notify(
        db,
        user_id=review.reviewee_id,
        actor_id=user.id,
        type=NotificationType.REVIEW_RECEIVED,
        title="You received a rating",
        body=f"Someone rated you {review.rating}/5 for a completed order.",
        link="/profile",
    )
    return ReviewOut.model_validate(review)


@router.get("/my", response_model=PaginatedReviews)
def my_reviews(
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> PaginatedReviews:
    """Reviews I wrote. Includes REMOVED ones so my history is preserved."""

    total = db.scalar(
        select(func.count())
        .select_from(Review)
        .where(Review.reviewer_id == user.id)
    ) or 0
    rows = list(
        db.scalars(
            select(Review)
            .where(Review.reviewer_id == user.id)
            .order_by(Review.created_at.desc(), Review.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedReviews(
        items=[ReviewOut.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/reviewee/{user_id}", response_model=ReviewSummary)
def reviewee_reviews(
    user_id: uuid.UUID,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> ReviewSummary:
    """ACTIVE reviews written about a user, newest first, with aggregate."""

    target = db.scalars(select(User).where(User.id == user_id)).first()
    if target is None or target.status in (UserStatus.SUSPENDED, UserStatus.DELETED):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found."
        )

    active = [
        Review.reviewee_id == user_id,
        Review.status == ReviewStatus.ACTIVE,
    ]
    total = db.scalar(select(func.count()).select_from(Review).where(*active)) or 0
    rows = list(
        db.scalars(
            select(Review)
            .where(*active)
            .order_by(Review.created_at.desc(), Review.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    average = db.scalar(select(func.avg(Review.rating)).where(*active))
    average_rating = round(float(average), 2) if average is not None else None
    return ReviewSummary(
        user_id=user_id,
        total=total,
        average_rating=average_rating,
        limit=limit,
        offset=offset,
        items=[ReviewOut.model_validate(r) for r in rows],
    )