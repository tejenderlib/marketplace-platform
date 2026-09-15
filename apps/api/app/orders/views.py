"""Shared order serialization + history helpers (no route logic)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog.models import Listing, ListingStatus
from app.identity.models import UserProfile
from app.orders.models import (
    Order,
    OrderShippingAddress,
    OrderStatus,
    OrderStatusHistory,
    Payment,
)
from app.orders.schemas import (
    HistoryOut,
    OrderListingRef,
    OrderOut,
    OrderPartyRef,
    PaymentOut,
    ShippingSnapshotOut,
)
from app.trading.models import AuctionResult, AuctionResultStatus


def display_names(db: Session, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str | None]:
    if not user_ids:
        return {}
    return dict(
        db.execute(
            select(UserProfile.user_id, UserProfile.display_name).where(
                UserProfile.user_id.in_(user_ids)
            )
        ).all()
    )


def record_history(
    db: Session,
    order: Order,
    from_status: OrderStatus | None,
    to_status: OrderStatus,
    changed_by: uuid.UUID | None,
    note: str | None,
) -> None:
    """Append an immutable history row (never update existing rows)."""

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=from_status,
            to_status=to_status,
            changed_by_user_id=changed_by,
            note=note,
        )
    )


def _restore_listing(db: Session, order: Order) -> None:
    """Release the order's listing reservation (RESERVED -> ACTIVE).

    Only a RESERVED listing is restored: any other status means the
    listing moved on (SOLD, removed by moderation, re-listed) and must
    not be overwritten.
    """

    listing = db.get(Listing, order.listing_id)
    if listing is not None and listing.status == ListingStatus.RESERVED:
        listing.status = ListingStatus.ACTIVE


_UNPAID_STATUSES = (OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_FAILED)


def release_expired_order(db: Session, order: Order) -> bool:
    """Lazily cancel an abandoned unpaid order past its checkout window.

    Pattern matches offer/auction-result lazy expiry: no scheduler; the
    flip happens whenever a read or action touches the order. Safe to
    call without a row lock on read paths (the state transition itself
    re-verifies under lock in mutating paths). Returns True if flipped.
    """

    if (
        order.status not in _UNPAID_STATUSES
        or order.checkout_expires_at is None
        or order.checkout_expires_at > datetime.now(timezone.utc)
    ):
        return False
    # Re-check under row lock so a concurrent payment/cancel wins cleanly.
    locked = db.scalars(
        select(Order).where(Order.id == order.id).with_for_update()
    ).first()
    if locked is None or locked.status not in _UNPAID_STATUSES:
        return False
    cancel_order(
        db,
        locked,
        changed_by=None,
        note="Checkout window expired; order cancelled and listing released.",
        expired=True,
    )
    db.commit()
    db.refresh(order)
    return True


def cancel_order(
    db: Session,
    order: Order,
    changed_by: uuid.UUID | None,
    note: str,
    expired: bool = False,
) -> None:
    """Shared buyer-cancel/abandon transition. Caller holds the row lock
    and has already verified PENDING_PAYMENT; caller commits."""

    from_status = order.status
    order.status = OrderStatus.CANCELLED
    order.cancelled_at = datetime.now(timezone.utc)
    _restore_listing(db, order)
    if order.source.value == "AUCTION_WIN" and order.auction_result_id is not None:
        # Same terminal result state the checkout-window expiry uses.
        result = db.get(AuctionResult, order.auction_result_id)
        if result is not None and result.status == AuctionResultStatus.ORDER_CREATED:
            result.status = AuctionResultStatus.PAYMENT_EXPIRED
    record_history(db, order, from_status, OrderStatus.CANCELLED, changed_by, note)


def serialize_order(db: Session, order: Order) -> OrderOut:
    listing = db.get(Listing, order.listing_id)
    assert listing is not None
    names = display_names(db, {order.buyer_id, order.seller_id})
    snapshot = db.scalars(
        select(OrderShippingAddress).where(OrderShippingAddress.order_id == order.id)
    ).first()
    payments = list(
        db.scalars(
            select(Payment)
            .where(Payment.order_id == order.id)
            .order_by(Payment.initiated_at.asc(), Payment.id.asc())
        ).all()
    )
    history = list(
        db.scalars(
            select(OrderStatusHistory)
            .where(OrderStatusHistory.order_id == order.id)
            .order_by(OrderStatusHistory.created_at.asc(), OrderStatusHistory.id.asc())
        ).all()
    )
    return OrderOut(
        id=order.id,
        listing_id=order.listing_id,
        buyer_id=order.buyer_id,
        seller_id=order.seller_id,
        source=order.source.value,
        accepted_offer_id=order.accepted_offer_id,
        auction_result_id=order.auction_result_id,
        listing_title_snapshot=order.listing_title_snapshot,
        contact_email_normalized=order.contact_email_normalized,
        currency=order.currency,
        subtotal_minor=order.subtotal_minor,
        shipping_minor=order.shipping_minor,
        total_minor=order.total_minor,
        status=order.status.value,
        checkout_expires_at=order.checkout_expires_at,
        paid_at=order.paid_at,
        cancelled_at=order.cancelled_at,
        created_at=order.created_at,
        updated_at=order.updated_at,
        listing=OrderListingRef(
            id=listing.id,
            title=listing.title,
            sale_type=listing.sale_type.value,
            status=listing.status.value,
        ),
        buyer=OrderPartyRef(id=order.buyer_id, display_name=names.get(order.buyer_id)),
        seller=OrderPartyRef(id=order.seller_id, display_name=names.get(order.seller_id)),
        shipping_snapshot=ShippingSnapshotOut.model_validate(snapshot) if snapshot else None,
        payments=[PaymentOut.model_validate(p) for p in payments],
        history=[HistoryOut.model_validate(h) for h in history],
    )


def orders_with_listings(db: Session, orders: list[Order]) -> list[Order]:
    """Eager-load listing rows for a batch (avoids N+1 in list views)."""

    ids = list({order.listing_id for order in orders})
    if ids:
        db.scalars(select(Listing).where(Listing.id.in_(ids))).all()
    return orders


def serialize_many(db: Session, orders: list[Order]) -> list[OrderOut]:
    orders_with_listings(db, orders)
    return [serialize_order(db, order) for order in orders]
