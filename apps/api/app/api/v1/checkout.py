"""Fixed-price Buy Now checkout: listing -> order + snapshot, atomically.

Pricing policy: subtotal comes ONLY from the locked listing row
(``fixed_price_minor``); shipping is a server-side flat policy of zero
(free shipping); total = subtotal + shipping. Client totals are never read.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.catalog.models import Listing, ListingSaleType, ListingStatus
from app.core.config import get_settings
from app.db.session import get_db_session
from app.identity.dependencies import require_active_user, require_authenticated_user
from app.identity.models import User
from app.identity.security import normalize_email
from app.notifications.models import NotificationType
from app.notifications.service import notify
from app.orders.models import (
    AddressStatus,
    Order,
    OrderShippingAddress,
    OrderSource,
    OrderStatus,
    UserAddress,
)
from app.orders.schemas import (
    AddressBase,
    AuctionCheckoutRequest,
    CheckoutRequest,
    OfferCheckoutRequest,
    OrderOut,
)
from app.orders.views import (
    record_history,
    release_expired_order,
    serialize_order,
)
from app.trading.models import (
    Auction,
    AuctionResult,
    AuctionResultStatus,
    AuctionStatus,
    Offer,
    OfferStatus,
)

router = APIRouter(prefix="/checkout", tags=["checkout"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Server-side shipping policy: free shipping for this phase.
FLAT_SHIPPING_MINOR = 0


def _checkout_deadline() -> datetime:
    """Payment deadline for a new order (reuses the auction window)."""

    return datetime.now(timezone.utc) + timedelta(
        hours=get_settings().auction_checkout_window_hours
    )


def _release_abandoned_order(db: Session, listing_id: uuid.UUID) -> None:
    """Lazily cancel a past-due PENDING_PAYMENT order on this listing.

    Called with the listing row already locked, so the listing cannot be
    released while another buyer is mid-checkout on it. If the abandoned
    order exists and is expired, cancelling it releases the reservation
    and this buyer proceeds; otherwise the RESERVED guard below rejects.
    """

    abandoned = db.scalars(
        select(Order).where(
            Order.listing_id == listing_id,
            Order.status == OrderStatus.PENDING_PAYMENT,
        )
    ).first()
    if abandoned is not None:
        release_expired_order(db, abandoned)


def _validate_contact_email(value: str) -> str:
    normalized = normalize_email(value)
    if not 3 <= len(normalized) <= 254 or _EMAIL_RE.match(normalized) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid contact email address.",
        )
    return normalized


def _snapshot_from_address(payload: AddressBase, country: str) -> dict:
    if country != "IN":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only Indian addresses (country IN) are supported.",
        )
    return {
        "recipient_name": payload.recipient_name.strip(),
        "line1": payload.line1.strip(),
        "line2": payload.line2,
        "city": payload.city.strip(),
        "region": payload.region,
        "postal_code": payload.postal_code,
        "country": payload.country,
        "phone": payload.phone,
    }


def _resolve_snapshot(
    db: Session, user: User, address_id: uuid.UUID | None, address: AddressBase | None
) -> tuple[dict, uuid.UUID | None]:
    """Resolve address_id (owned) or inline address into a snapshot dict."""

    if address_id is not None:
        saved = db.scalars(
            select(UserAddress).where(
                UserAddress.id == address_id,
                UserAddress.user_id == user.id,
                UserAddress.status == AddressStatus.ACTIVE,
            )
        ).first()
        if saved is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Address not found."
            )
        return {
            "recipient_name": saved.recipient_name,
            "line1": saved.line1,
            "line2": saved.line2,
            "city": saved.city,
            "region": saved.region,
            "postal_code": saved.postal_code,
            "country": saved.country,
            "phone": saved.phone,
        }, saved.id
    if address is not None:
        return _snapshot_from_address(address, address.country), None
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Provide address_id or an inline address.",
    )


@router.post("/fixed-price", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def fixed_price_checkout(
    payload: CheckoutRequest,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> OrderOut:
    """Buy Now: lock listing, price authoritatively, create order + snapshot."""

    contact_email = _validate_contact_email(payload.contact_email)

    listing = db.scalars(
        select(Listing).where(Listing.id == payload.listing_id).with_for_update()
    ).first()
    if listing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    if listing.status != ListingStatus.ACTIVE:
        # A previous buyer may have abandoned an expired checkout; release
        # it (and the reservation) before rejecting, then re-check.
        _release_abandoned_order(db, listing.id)
        db.refresh(listing)
        if listing.status != ListingStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Listing is {listing.status.value} and cannot be purchased.",
            )
    if listing.sale_type != ListingSaleType.FIXED_PRICE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only FIXED_PRICE listings support Buy Now.",
        )
    if listing.seller_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You cannot buy your own listing.",
        )
    if listing.fixed_price_minor is None or listing.currency != "INR":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Listing price is not purchasable.",
        )

    if payload.address_id is not None:
        snapshot, source_address_id = _resolve_snapshot(
            db, user, payload.address_id, None
        )
    elif payload.address is not None:
        snapshot, source_address_id = _resolve_snapshot(
            db, user, None, payload.address
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide address_id or an inline address.",
        )

    subtotal = listing.fixed_price_minor
    shipping = FLAT_SHIPPING_MINOR
    order = Order(
        listing_id=listing.id,
        buyer_id=user.id,
        seller_id=listing.seller_id,
        source=OrderSource.FIXED_PRICE,
        accepted_offer_id=None,
        auction_result_id=None,
        listing_title_snapshot=listing.title,
        contact_email_normalized=contact_email,
        currency="INR",
        subtotal_minor=subtotal,
        shipping_minor=shipping,
        total_minor=subtotal + shipping,
        status=OrderStatus.PENDING_PAYMENT,
        checkout_expires_at=_checkout_deadline(),
    )
    db.add(order)
    db.flush()
    db.add(
        OrderShippingAddress(
            order_id=order.id, source_address_id=source_address_id, **snapshot
        )
    )
    record_history(db, order, None, OrderStatus.PENDING_PAYMENT, user.id, "Checkout created.")
    listing.status = ListingStatus.RESERVED
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Listing was just purchased by another buyer.",
        ) from error
    db.refresh(order)
    notify(
        db,
        user_id=listing.seller_id,
        actor_id=user.id,
        type=NotificationType.ORDER_PLACED,
        title="New order for your listing",
        body=f"\"{listing.title}\" was just ordered for ₹{order.total_minor:,}.",
        link="/orders",
    )
    return serialize_order(db, order)


@router.post("/offer", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def accepted_offer_checkout(
    payload: OfferCheckoutRequest,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> OrderOut:
    """Accepted-offer checkout: lock offer + listing, create exactly one ACCEPTED_OFFER order."""

    contact_email = _validate_contact_email(payload.contact_email)

    offer = db.scalars(
        select(Offer).where(Offer.id == payload.offer_id).with_for_update()
    ).first()
    if offer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found."
        )
    existing = db.scalars(
        select(Order).where(Order.accepted_offer_id == offer.id)
    ).first()
    if existing is not None:
        if existing.buyer_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the offer buyer may access this order.",
            )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=serialize_order(db, existing).model_dump(mode="json"),
        )
    if offer.status != OfferStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Offer is {offer.status.value}; only ACCEPTED offers can be checked out.",
        )
    if offer.buyer_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the offer buyer may checkout this offer.",
        )
    if offer.currency != "INR":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Offer currency is not purchasable.",
        )
    listing = db.scalars(
        select(Listing).where(Listing.id == offer.listing_id).with_for_update()
    ).first()
    if listing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    if listing.status != ListingStatus.ACTIVE:
        _release_abandoned_order(db, listing.id)
        db.refresh(listing)
        if listing.status != ListingStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Listing is {listing.status.value} and cannot be purchased.",
            )
    if listing.sale_type != ListingSaleType.FIXED_PRICE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only FIXED_PRICE listings support offer checkout.",
        )
    if listing.seller_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You cannot buy your own listing.",
        )
    if listing.fixed_price_minor is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Listing price is not purchasable.",
        )

    snapshot, source_address_id = _resolve_snapshot(
        db, user, payload.address_id, payload.address
    )
    subtotal = offer.amount_minor
    shipping = FLAT_SHIPPING_MINOR
    order = Order(
        listing_id=listing.id,
        buyer_id=user.id,
        seller_id=listing.seller_id,
        source=OrderSource.ACCEPTED_OFFER,
        accepted_offer_id=offer.id,
        auction_result_id=None,
        listing_title_snapshot=listing.title,
        contact_email_normalized=contact_email,
        currency="INR",
        subtotal_minor=subtotal,
        shipping_minor=shipping,
        total_minor=subtotal + shipping,
        status=OrderStatus.PENDING_PAYMENT,
        checkout_expires_at=_checkout_deadline(),
    )
    db.add(order)
    db.flush()
    db.add(
        OrderShippingAddress(
            order_id=order.id, source_address_id=source_address_id, **snapshot
        )
    )
    record_history(db, order, None, OrderStatus.PENDING_PAYMENT, user.id, "Accepted-offer checkout.")
    listing.status = ListingStatus.RESERVED
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        existing = db.scalars(
            select(Order).where(Order.accepted_offer_id == offer.id)
        ).first()
        if existing is not None:
            if existing.buyer_id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the offer buyer may access this order.",
                ) from error
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=serialize_order(db, existing).model_dump(mode="json"),
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Checkout conflicts with an existing record.",
        ) from error
    db.refresh(order)
    return serialize_order(db, order)


@router.post("/auction", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def auction_winner_checkout(
    payload: AuctionCheckoutRequest,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> OrderOut:
    """Winner claims an AWAITING_CHECKOUT result: exactly one AUCTION_WIN order."""

    from datetime import datetime, timezone

    contact_email = _validate_contact_email(payload.contact_email)

    result = db.scalars(
        select(AuctionResult).where(AuctionResult.id == payload.auction_result_id).with_for_update()
    ).first()
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Auction result not found."
        )
    # Idempotent retry: an order already exists for this result.
    existing = db.scalars(
        select(Order).where(Order.auction_result_id == result.id)
    ).first()
    if existing is not None:
        if existing.buyer_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the winning buyer may access this order.",
            )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=serialize_order(db, existing).model_dump(mode="json"),
        )

    if result.status != AuctionResultStatus.AWAITING_CHECKOUT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Result is {result.status.value} and cannot be checked out.",
        )
    if result.winner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the winning buyer may checkout this auction.",
        )
    now = datetime.now(timezone.utc)
    if result.checkout_expires_at is not None and result.checkout_expires_at <= now:
        result.status = AuctionResultStatus.PAYMENT_EXPIRED
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Checkout window has expired.",
        )
    auction = db.get(Auction, result.auction_id)
    if auction is None or auction.status != AuctionStatus.ENDED:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Auction is not in a check-outable state.",
        )
    if (
        result.winning_bid_id is None
        or result.final_price_minor is None
        or result.currency != "INR"
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Auction result has no valid winning price.",
        )
    listing = db.scalars(
        select(Listing).where(Listing.id == auction.listing_id).with_for_update()
    ).first()
    if listing is None:  # pragma: no cover - defensive; FK prevents this
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    if listing.status != ListingStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Listing is {listing.status.value} and cannot be purchased.",
        )
    if listing.seller_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="You cannot buy your own listing.",
        )

    snapshot, source_address_id = _resolve_snapshot(
        db, user, payload.address_id, payload.address
    )
    subtotal = result.final_price_minor
    shipping = FLAT_SHIPPING_MINOR
    order = Order(
        listing_id=listing.id,
        buyer_id=user.id,
        seller_id=listing.seller_id,
        source=OrderSource.AUCTION_WIN,
        accepted_offer_id=None,
        auction_result_id=result.id,
        listing_title_snapshot=listing.title,
        contact_email_normalized=contact_email,
        currency="INR",
        subtotal_minor=subtotal,
        shipping_minor=shipping,
        total_minor=subtotal + shipping,
        status=OrderStatus.PENDING_PAYMENT,
        # Same payment deadline policy as the other checkout sources: the
        # winner must pay within the checkout window of claiming the item.
        checkout_expires_at=_checkout_deadline(),
    )
    db.add(order)
    db.flush()
    db.add(
        OrderShippingAddress(
            order_id=order.id, source_address_id=source_address_id, **snapshot
        )
    )
    record_history(db, order, None, OrderStatus.PENDING_PAYMENT, user.id, "Auction winner checkout.")
    result.status = AuctionResultStatus.ORDER_CREATED
    listing.status = ListingStatus.RESERVED
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        existing = db.scalars(
            select(Order).where(Order.auction_result_id == result.id)
        ).first()
        if existing is not None:
            if existing.buyer_id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only the winning buyer may access this order.",
                ) from error
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=serialize_order(db, existing).model_dump(mode="json"),
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Checkout conflicts with an existing record.",
        ) from error
    db.refresh(order)
    return serialize_order(db, order)
