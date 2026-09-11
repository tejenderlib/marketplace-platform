"""Reusable offer authorization helpers (buyer/seller/ADMIN parties)."""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog.models import Listing
from app.db.session import get_db_session
from app.identity.dependencies import require_authenticated_user
from app.identity.models import User
from app.trading.models import Offer


def get_offer_or_404(offer_id: uuid.UUID, db: Session = Depends(get_db_session)) -> Offer:
    """Fetch an offer or raise 404. Reusable across offer endpoints."""

    offer = db.get(Offer, offer_id)
    if offer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found."
        )
    return offer


def get_offer_listing(db: Session, offer: Offer) -> Listing:
    """Resolve the listing behind an offer (FK RESTRICT keeps it present)."""

    listing = db.get(Listing, offer.listing_id)
    if listing is None:  # pragma: no cover - defensive; FK prevents this
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    return listing


def require_offer_party(
    offer: Offer = Depends(get_offer_or_404),
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> tuple[Offer, Listing]:
    """Allow the buyer, the listing seller, or ADMIN (detail views)."""

    from app.catalog.dependencies import is_admin

    listing = get_offer_listing(db, offer)
    if (
        user.id != offer.buyer_id
        and user.id != listing.seller_id
        and not is_admin(db, user)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the buyer, the seller, or an admin may view this offer.",
        )
    return offer, listing


def require_offer_seller_or_admin(
    offer: Offer = Depends(get_offer_or_404),
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> tuple[Offer, Listing]:
    """Allow the listing seller or ADMIN (respond path)."""

    from app.catalog.dependencies import is_admin

    listing = get_offer_listing(db, offer)
    if user.id != listing.seller_id and not is_admin(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the listing seller or an admin may respond to this offer.",
        )
    return offer, listing
