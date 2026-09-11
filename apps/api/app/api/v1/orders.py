"""Order reads plus dummy-payment processing (buyer-driven, atomic)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.catalog.models import Listing, ListingStatus
from app.db.session import get_db_session
from app.identity.dependencies import require_authenticated_user
from app.identity.models import User
from app.orders.models import Order, OrderSource, OrderStatus, Payment, PaymentProvider, PaymentStatus
from app.orders.provider import get_provider
from app.trading.models import Auction, AuctionResult, AuctionResultStatus, AuctionStatus, Bid
from app.orders.schemas import OrderOut, OrderPaymentResponse, PaginatedOrders, PaymentOut, PaymentRequest
from app.orders.views import record_history, serialize_many, serialize_order

router = APIRouter(tags=["orders"])

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100


def _get_order_or_404(order_id: uuid.UUID, db: Session) -> Order:
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    return order


def _check_order_visibility(order: Order, user: User, db: Session) -> None:
    """Buyer, seller, or ADMIN may read; unrelated users get 403."""

    from app.catalog.dependencies import is_admin

    if user.id in (order.buyer_id, order.seller_id) or is_admin(db, user):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You may only view your own orders.",
    )


def _settle_auction_order(
    db: Session, order: Order
) -> tuple[AuctionResult, Auction]:
    """Verify AUCTION_WIN consistency under lock; returns (result, auction).

    Rejects any mismatch between order / result / auction / listing /
    winner / totals so success can never settle the wrong auction.
    """

    result = db.scalars(
        select(AuctionResult).where(AuctionResult.id == order.auction_result_id).with_for_update()
    ).first()
    if result is None or order.auction_result_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order has no auction result to settle.",
        )
    auction = db.scalars(
        select(Auction).where(Auction.id == result.auction_id).with_for_update()
    ).first()
    listing = db.get(Listing, order.listing_id)
    bid = db.get(Bid, result.winning_bid_id) if result.winning_bid_id else None
    consistent = (
        auction is not None
        and listing is not None
        and auction.listing_id == order.listing_id
        and order.buyer_id == result.winner_id
        and order.seller_id == listing.seller_id
        and order.total_minor == result.final_price_minor
        and order.currency == result.currency
        and bid is not None
        and bid.auction_id == auction.id
        and bid.bidder_id == result.winner_id
    )
    if not consistent:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order, result, auction, and winner are inconsistent; refusing to settle.",
        )
    assert auction is not None
    return result, auction


def _parse_order_status(value: str | None) -> OrderStatus | None:
    if value is None:
        return None
    try:
        return OrderStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Use: {', '.join(s.value for s in OrderStatus)}.",
        ) from None


@router.get("/orders/me", response_model=PaginatedOrders)
def my_orders(
    order_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> PaginatedOrders:
    """The authenticated buyer's orders, newest first."""

    status_enum = _parse_order_status(order_status)
    filters = [Order.buyer_id == user.id]
    if status_enum is not None:
        filters.append(Order.status == status_enum)
    total = db.scalar(select(func.count()).select_from(Order).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Order)
            .where(*filters)
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedOrders(
        items=serialize_many(db, rows), total=total, limit=limit, offset=offset
    )


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(
    order_id: uuid.UUID,
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> OrderOut:
    """Order detail for buyer, seller, or ADMIN."""

    order = _get_order_or_404(order_id, db)
    _check_order_visibility(order, user, db)
    return serialize_order(db, order)


@router.get("/seller/orders", response_model=PaginatedOrders)
def seller_orders(
    order_status: str | None = Query(default=None, alias="status"),
    listing_id: uuid.UUID | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> PaginatedOrders:
    """Orders for the authenticated seller's listings only."""

    status_enum = _parse_order_status(order_status)
    filters = [Order.seller_id == user.id]
    if status_enum is not None:
        filters.append(Order.status == status_enum)
    if listing_id is not None:
        filters.append(Order.listing_id == listing_id)
    total = db.scalar(select(func.count()).select_from(Order).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Order)
            .where(*filters)
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedOrders(
        items=serialize_many(db, rows), total=total, limit=limit, offset=offset
    )


@router.post("/orders/{order_id}/payment", response_model=OrderPaymentResponse)
def pay_order(
    order_id: uuid.UUID,
    payload: PaymentRequest,
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> OrderPaymentResponse:
    """Buyer pays: idempotent dummy processing with atomic state transitions."""

    order = db.scalars(
        select(Order).where(Order.id == order_id).with_for_update()
    ).first()
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    if order.buyer_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the buyer owning the order may pay for it.",
        )

    # Idempotency first: the same key returns its payment without reprocessing.
    existing_keyed = db.scalars(
        select(Payment).where(Payment.idempotency_key == payload.idempotency_key)
    ).first()
    if existing_keyed is not None:
        if existing_keyed.order_id != order.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency key was already used for a different order.",
            )
        return OrderPaymentResponse(
            payment=PaymentOut.model_validate(existing_keyed),
            order=serialize_order(db, order),
        )
    if db.scalars(
        select(Payment).where(
            Payment.order_id == order.id, Payment.status == PaymentStatus.SUCCEEDED
        )
    ).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order already has a successful payment.",
        )

    if order.status == OrderStatus.PAYMENT_FAILED:
        # Retry re-arms the order; the listing must be reservable again.
        listing_for_retry = db.get(Listing, order.listing_id)
        if listing_for_retry is None or listing_for_retry.status not in (
            ListingStatus.ACTIVE, ListingStatus.RESERVED,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Listing is no longer available for retry.",
            )
        listing_for_retry.status = ListingStatus.RESERVED
        record_history(
            db, order, OrderStatus.PAYMENT_FAILED, OrderStatus.PENDING_PAYMENT,
            user.id, "Payment retry started.",
        )
        order.status = OrderStatus.PENDING_PAYMENT
    elif order.status != OrderStatus.PENDING_PAYMENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Order is {order.status.value} and cannot be paid.",
        )

    payment = Payment(
        order_id=order.id,
        provider=PaymentProvider.DUMMY,
        idempotency_key=payload.idempotency_key,
        amount_minor=order.total_minor,
        currency=order.currency,
        status=PaymentStatus.CREATED,
        simulated_outcome=payload.simulate,
    )
    db.add(payment)
    db.flush()
    payment.status = PaymentStatus.PENDING

    auction_result = None
    auction = None
    if order.source == OrderSource.AUCTION_WIN:
        # Lock + verify consistency BEFORE money moves; reused on both outcomes.
        auction_result, auction = _settle_auction_order(db, order)
        if auction_result.status != AuctionResultStatus.ORDER_CREATED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Result is {auction_result.status.value} and cannot be paid.",
            )

    result = get_provider(PaymentProvider.DUMMY).process(
        amount_minor=order.total_minor,
        currency=order.currency,
        simulate=payload.simulate,
    )
    now = datetime.now(timezone.utc)
    listing = db.get(Listing, order.listing_id)
    assert listing is not None
    if result.ok:
        payment.status = PaymentStatus.SUCCEEDED
        payment.provider_reference = result.provider_reference
        payment.processed_at = now
        payment.provider_metadata = result.metadata
        order.status = OrderStatus.PAID
        order.paid_at = now
        listing.status = ListingStatus.SOLD
        if auction_result is not None and auction is not None:
            # Atomic settlement: result + auction move with payment success.
            auction_result.status = AuctionResultStatus.PAYMENT_COMPLETED
            auction.status = AuctionStatus.SETTLED
            auction.settled_at = now
        record_history(db, order, OrderStatus.PENDING_PAYMENT, OrderStatus.PAID,
                       user.id, "Dummy payment succeeded.")
    else:
        payment.status = PaymentStatus.FAILED
        payment.provider_reference = result.provider_reference
        payment.processed_at = now
        payment.failure_code = result.failure_code
        payment.failure_message = result.failure_message
        payment.provider_metadata = result.metadata
        order.status = OrderStatus.PAYMENT_FAILED
        # Release the reservation so the listing stays purchasable.
        # AUCTION_WIN orders keep result ORDER_CREATED and auction ENDED.
        if listing.status == ListingStatus.RESERVED:
            listing.status = ListingStatus.ACTIVE
        record_history(db, order, OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_FAILED,
                       user.id, "Dummy payment failed.")
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment conflicts with an existing record.",
        ) from error
    db.refresh(payment)
    db.refresh(order)
    return OrderPaymentResponse(
        payment=PaymentOut.model_validate(payment), order=serialize_order(db, order)
    )
