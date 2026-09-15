"""Offer endpoints: buyer creation/management plus seller response flows.

Canonical-schema notes: ``listing_sale_type`` is persisted per offer and the
composite FK plus ``listing_sale_type = FIXED_PRICE`` check enforce V1 rules
in PostgreSQL; one PENDING offer per buyer/listing is enforced by a partial
unique index (the pre-check returns 409 fast, the index is the backstop, and
creation serializes on the listing row). Amount/buyer/listing are immutable;
only status/responded_at move. Expiry is lazy (no worker): past-due PENDING
rows flip to EXPIRED on any read/action touching them.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.catalog.models import Listing, ListingSaleType, ListingStatus
from app.db.session import get_db_session
from app.identity.dependencies import require_active_user, require_authenticated_user
from app.identity.models import User, UserProfile
from app.notifications.models import NotificationType
from app.notifications.service import notify
from app.trading.dependencies import (
    get_offer_or_404,
    require_offer_party,
    require_offer_seller_or_admin,
)
from app.trading.models import Offer, OfferStatus
from app.trading.schemas import (
    ListingRef,
    OfferCreate,
    OfferOut,
    OfferRespond,
    PaginatedOffers,
    UserRef,
)

router = APIRouter(prefix="/offers", tags=["offers"])
seller_router = APIRouter(prefix="/seller/offers", tags=["seller-offers"])

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100

_RESPOND_ALLOWED = (OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.CANCELLED)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_offer_status(value: str | None) -> OfferStatus | None:
    if value is None:
        return None
    try:
        return OfferStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Use: {', '.join(s.value for s in OfferStatus)}.",
        ) from None


def _expire_if_due(db: Session, offer: Offer) -> bool:
    """Flip a past-due PENDING offer to EXPIRED. Returns True if flipped."""

    if (
        offer.status == OfferStatus.PENDING
        and offer.expires_at is not None
        and offer.expires_at <= _now()
    ):
        offer.status = OfferStatus.EXPIRED
        db.commit()
        db.refresh(offer)
        return True
    return False


def _serialize_many(
    db: Session, offers: list[Offer]
) -> tuple[list[OfferOut], dict[uuid.UUID, Listing], dict[uuid.UUID, str | None]]:
    listing_ids = list({offer.listing_id for offer in offers})
    listings = {
        row.id: row
        for row in db.scalars(
            select(Listing).where(Listing.id.in_(listing_ids))
        ).all()
    }
    user_ids = {offer.buyer_id for offer in offers} | {
        listings[offer.listing_id].seller_id for offer in offers if offer.listing_id in listings
    }
    names: dict[uuid.UUID, str | None] = {}
    if user_ids:
        names = dict(
            db.execute(
                select(UserProfile.user_id, UserProfile.display_name).where(
                    UserProfile.user_id.in_(user_ids)
                )
            ).all()
        )
    items = []
    for offer in offers:
        listing = listings[offer.listing_id]
        items.append(
            OfferOut(
                id=offer.id,
                listing_id=offer.listing_id,
                buyer_id=offer.buyer_id,
                amount_minor=offer.amount_minor,
                currency=offer.currency,
                message=offer.message,
                status=offer.status.value,
                responded_at=offer.responded_at,
                expires_at=offer.expires_at,
                created_at=offer.created_at,
                updated_at=offer.updated_at,
                listing=ListingRef(
                    id=listing.id,
                    title=listing.title,
                    sale_type=listing.sale_type.value,
                    status=listing.status.value,
                ),
                buyer=UserRef(id=offer.buyer_id, display_name=names.get(offer.buyer_id)),
                seller=UserRef(id=listing.seller_id, display_name=names.get(listing.seller_id)),
            )
        )
    return items, listings, names


def _serialize_one(db: Session, offer: Offer) -> OfferOut:
    return _serialize_many(db, [offer])[0][0]


@router.post("", response_model=OfferOut, status_code=status.HTTP_201_CREATED)
def create_offer(
    payload: OfferCreate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> OfferOut:
    """Buyer creates a PENDING offer on an ACTIVE FIXED_PRICE listing."""

    if payload.currency != "INR":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Currency must be INR.",
        )
    if payload.expires_at is not None and payload.expires_at <= _now():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="expires_at must be in the future.",
        )

    listing = db.scalars(
        select(Listing).where(Listing.id == payload.listing_id).with_for_update()
    ).first()
    if listing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    if listing.status != ListingStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Offers are only accepted on ACTIVE listings.",
        )
    if listing.sale_type != ListingSaleType.FIXED_PRICE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Offers are only allowed on FIXED_PRICE listings.",
        )
    if listing.seller_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You cannot make an offer on your own listing.",
        )
    duplicate = db.scalars(
        select(Offer).where(
            Offer.listing_id == listing.id,
            Offer.buyer_id == user.id,
            Offer.status == OfferStatus.PENDING,
        )
    ).first()
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a pending offer on this listing.",
        )

    offer = Offer(
        listing_id=listing.id,
        listing_sale_type=listing.sale_type,
        buyer_id=user.id,
        amount_minor=payload.amount_minor,
        currency=payload.currency,
        message=payload.message,
        status=OfferStatus.PENDING,
        expires_at=payload.expires_at,
    )
    db.add(offer)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have a pending offer on this listing.",
        ) from error
    db.refresh(offer)
    notify(
        db,
        user_id=listing.seller_id,
        actor_id=user.id,
        type=NotificationType.OFFER_RECEIVED,
        title="New offer on your listing",
        body=f"Buyer offered ₹{offer.amount_minor:,} on \"{listing.title}\".",
        link="/offers",
    )
    return _serialize_one(db, offer)


@router.get("/me", response_model=PaginatedOffers)
def my_offers(
    offer_status: str | None = Query(default=None, alias="status"),
    listing_id: uuid.UUID | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> PaginatedOffers:
    """The authenticated buyer's offers, paginated and filterable."""

    status_enum = _parse_offer_status(offer_status)
    filters = [Offer.buyer_id == user.id]
    if status_enum is not None:
        filters.append(Offer.status == status_enum)
    if listing_id is not None:
        filters.append(Offer.listing_id == listing_id)
    total = db.scalar(select(func.count()).select_from(Offer).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Offer)
            .where(*filters)
            .order_by(Offer.created_at.desc(), Offer.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedOffers(
        items=_serialize_many(db, rows)[0], total=total, limit=limit, offset=offset
    )


@router.get("/{offer_id}", response_model=OfferOut)
def get_offer(
    party: tuple[Offer, Listing] = Depends(require_offer_party),
    db: Session = Depends(get_db_session),
) -> OfferOut:
    """Offer detail, visible only to buyer, seller, or ADMIN."""

    offer, _ = party
    _expire_if_due(db, offer)
    return _serialize_one(db, offer)


@router.patch("/{offer_id}", response_model=OfferOut)
def respond_to_offer(
    payload: OfferRespond,
    party: tuple[Offer, Listing] = Depends(require_offer_seller_or_admin),
    db: Session = Depends(get_db_session),
) -> OfferOut:
    """Seller/ADMIN decision on a PENDING offer. Row-locked against races."""

    offer, listing = party
    db.refresh(offer, with_for_update=True)
    if _expire_if_due(db, offer):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Offer has expired."
        )
    try:
        decision = OfferStatus(payload.status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid status. Use: ACCEPTED, REJECTED, CANCELLED.",
        ) from None
    if decision not in _RESPOND_ALLOWED:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid status. Use: ACCEPTED, REJECTED, CANCELLED.",
        ) from None
    if offer.status != OfferStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Offer is already {offer.status.value}; only PENDING offers can be answered.",
        )
    if decision == OfferStatus.ACCEPTED:
        # Accepting an offer takes the listing off the market for this
        # buyer's checkout window: the listing must still be reservable,
        # and every other PENDING offer on the listing is rejected in the
        # same locked transaction so at most one offer can ever be
        # ACCEPTED/checked out per listing.
        if listing.status != ListingStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Listing is {listing.status.value}; offers cannot be accepted.",
            )
        siblings = db.scalars(
            select(Offer).where(
                Offer.listing_id == offer.listing_id,
                Offer.id != offer.id,
                Offer.status == OfferStatus.PENDING,
            ).with_for_update(skip_locked=True)
        ).all()
        now = _now()
        for sibling in siblings:
            sibling.status = OfferStatus.REJECTED
            sibling.responded_at = now
    # Amount/buyer/listing history is immutable: only status/responded_at move.
    offer.status = decision
    offer.responded_at = _now()
    db.commit()
    db.refresh(offer)
    if decision == OfferStatus.ACCEPTED:
        notify(
            db,
            user_id=offer.buyer_id,
            actor_id=listing.seller_id,
            type=NotificationType.OFFER_ACCEPTED,
            title="Your offer was accepted",
            body=f"The seller accepted your offer of ₹{offer.amount_minor:,}.",
            link="/offers",
        )
    return _serialize_one(db, offer)


@router.post("/{offer_id}/withdraw", response_model=OfferOut)
def withdraw_offer(
    offer: Offer = Depends(get_offer_or_404),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> OfferOut:
    """Buyer withdraws their own PENDING offer."""

    if offer.buyer_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the buyer who created the offer may withdraw it.",
        )
    db.refresh(offer, with_for_update=True)
    if _expire_if_due(db, offer):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Offer has expired."
        )
    if offer.status != OfferStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Offer is {offer.status.value}; only PENDING offers can be withdrawn.",
        )
    offer.status = OfferStatus.WITHDRAWN
    offer.responded_at = _now()
    db.commit()
    db.refresh(offer)
    return _serialize_one(db, offer)


@seller_router.get("", response_model=PaginatedOffers)
def seller_offers(
    offer_status: str | None = Query(default=None, alias="status"),
    listing_id: uuid.UUID | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> PaginatedOffers:
    """Offers received on the authenticated seller's own listings only."""

    status_enum = _parse_offer_status(offer_status)
    filters = [Listing.seller_id == user.id]
    if listing_id is not None:
        filters.append(Offer.listing_id == listing_id)
    if status_enum is not None:
        filters.append(Offer.status == status_enum)
    base = select(Offer).join(Listing, Listing.id == Offer.listing_id).where(*filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = list(
        db.scalars(
            base.order_by(Offer.created_at.desc(), Offer.id.desc()).limit(limit).offset(offset)
        ).all()
    )
    return PaginatedOffers(
        items=_serialize_many(db, rows)[0], total=total, limit=limit, offset=offset
    )
