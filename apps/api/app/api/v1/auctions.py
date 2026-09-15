"""Auction + bid endpoints with an authoritative, concurrency-safe lifecycle.

Design notes:
- PostgreSQL holds all auction state; the API never caches it in memory.
- Bids run in one transaction: lock auction FOR UPDATE, re-read, validate,
  idempotency-check, insert immutable bid, flip prior WINNING to OUTBID,
  update current_* pointers + bid_count, commit atomically.
- Idempotency key is (auction_id, bidder_id, request_id): retries return the
  existing bid instead of inserting a duplicate.
- Closing is a deterministic service (close_auction) usable by endpoints now
  and a scheduler later; it is idempotent via the one-result-per-auction rule.
- Lifecycle: DRAFT -> SCHEDULED -> LIVE -> ENDED (+SETTLED/CANCELLED exist
  canonically but are owned by future phases). No ENDED forcing before ends_at.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.catalog.dependencies import is_admin
from app.catalog.models import Listing, ListingSaleType
from app.core.config import get_settings
from app.db.session import get_db_session
from app.identity.dependencies import require_active_user, require_authenticated_user
from app.identity.models import User, UserProfile
from app.identity.security import decode_access_token
from app.notifications.models import NotificationType
from app.notifications.service import notify
from app.trading.models import (
    Auction,
    AuctionResult,
    AuctionResultStatus,
    AuctionStatus,
    Bid,
    BidStatus,
)
from app.trading.schemas import (
    AuctionCreate,
    AuctionOut,
    AuctionResultOut,
    AuctionWinnerRef,
    BidCreate,
    BidOut,
    ListingRef,
    PaginatedAuctions,
    PaginatedBids,
    UserRef,
)

router = APIRouter(prefix="/auctions", tags=["auctions"])

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100

optional_bearer = HTTPBearer(auto_error=False)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_auction_status(value: str | None) -> AuctionStatus | None:
    if value is None:
        return None
    try:
        return AuctionStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Use: {', '.join(s.value for s in AuctionStatus)}.",
        ) from None


def _bidder_names(db: Session, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str | None]:
    if not user_ids:
        return {}
    return dict(
        db.execute(
            select(UserProfile.user_id, UserProfile.display_name).where(
                UserProfile.user_id.in_(user_ids)
            )
        ).all()
    )


def _optional_viewer(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_bearer),
    db: Session = Depends(get_db_session),
) -> User | None:
    """Best-effort viewer resolution for public endpoints (never raises)."""

    if credentials is None or not credentials.credentials:
        return None
    try:
        user = db.get(User, decode_access_token(credentials.credentials))
    except Exception:
        return None
    return user


def _get_auction_or_404(auction_id: uuid.UUID, db: Session) -> Auction:
    auction = db.get(Auction, auction_id)
    if auction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Auction not found."
        )
    return auction


def _require_auction_seller_or_admin(
    auction: Auction, user: User, db: Session
) -> Listing:
    listing = db.get(Listing, auction.listing_id)
    if listing is None:  # pragma: no cover - defensive; FK prevents this
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    if listing.seller_id != user.id and not is_admin(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the auction seller or an admin may perform this action.",
        )
    return listing


def _serialize_auction(
    db: Session, auction: Auction, viewer: User | None = None
) -> AuctionOut:
    listing = db.get(Listing, auction.listing_id)
    assert listing is not None
    names = _bidder_names(
        db, {listing.seller_id} | ({auction.current_winner_id} if auction.current_winner_id else set())
    )
    privileged = (
        viewer is not None
        and (
            viewer.id == listing.seller_id
            or viewer.id == auction.current_winner_id
            or is_admin(db, viewer)
        )
    )
    winner = None
    if privileged and auction.current_winner_id is not None:
        winner = AuctionWinnerRef(
            id=auction.current_winner_id, display_name=names.get(auction.current_winner_id)
        )
    return AuctionOut(
        id=auction.id,
        listing_id=auction.listing_id,
        status=auction.status.value,
        starting_bid_minor=auction.starting_bid_minor,
        minimum_increment_minor=auction.minimum_increment_minor,
        reserve_minor=auction.reserve_minor,
        current_bid_minor=auction.current_bid_minor,
        current_winning_bid_id=auction.current_winning_bid_id,
        current_winner_id=auction.current_winner_id if privileged else None,
        winner=winner,
        bid_count=auction.bid_count,
        starts_at=auction.starts_at,
        ends_at=auction.ends_at,
        settled_at=auction.settled_at,
        created_at=auction.created_at,
        updated_at=auction.updated_at,
        listing=ListingRef(
            id=listing.id,
            title=listing.title,
            sale_type=listing.sale_type.value,
            status=listing.status.value,
        ),
    )


def _serialize_bid(db: Session, bid: Bid, names: dict[uuid.UUID, str | None]) -> BidOut:
    return BidOut(
        id=bid.id,
        auction_id=bid.auction_id,
        bidder_id=bid.bidder_id,
        bidder=UserRef(id=bid.bidder_id, display_name=names.get(bid.bidder_id)),
        amount_minor=bid.amount_minor,
        currency=bid.currency,
        status=bid.status.value,
        created_at=bid.created_at,
    )


@router.post("", response_model=AuctionOut, status_code=status.HTTP_201_CREATED)
def create_auction(
    payload: AuctionCreate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> AuctionOut:
    """Seller creates a DRAFT auction for their own AUCTION listing."""

    if payload.currency != "INR":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Currency must be INR.",
        )
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ends_at must be after starts_at.",
        )
    listing = db.get(Listing, payload.listing_id)
    if listing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    if listing.sale_type != ListingSaleType.AUCTION:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Auctions can only be created for AUCTION listings.",
        )
    if listing.seller_id != user.id and not is_admin(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the listing seller or an admin may create its auction.",
        )
    existing = db.scalars(
        select(Auction).where(Auction.listing_id == listing.id)
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An auction already exists for this listing.",
        )
    auction = Auction(
        listing_id=listing.id,
        status=AuctionStatus.DRAFT,
        starting_bid_minor=payload.starting_bid_minor,
        minimum_increment_minor=payload.minimum_increment_minor,
        reserve_minor=payload.reserve_minor,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    db.add(auction)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An auction already exists for this listing.",
        ) from error
    db.refresh(auction)
    return _serialize_auction(db, auction, user)


@router.get("", response_model=PaginatedAuctions)
def list_auctions(
    auction_status: str | None = Query(default=None, alias="status"),
    phase: str | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_session),
) -> PaginatedAuctions:
    """Public discovery with status/phase filters, ending soonest first."""

    status_enum = _parse_auction_status(auction_status)
    filters = []
    if status_enum is not None:
        filters.append(Auction.status == status_enum)
    if phase is not None:
        now = _now()
        if phase == "upcoming":
            filters.append(Auction.status.in_([AuctionStatus.DRAFT, AuctionStatus.SCHEDULED]))
            filters.append(Auction.starts_at > now)
        elif phase == "live":
            filters.append(Auction.status == AuctionStatus.LIVE)
        elif phase == "ended":
            filters.append(
                Auction.status.in_(
                    [AuctionStatus.ENDED, AuctionStatus.SETTLED, AuctionStatus.CANCELLED]
                )
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid phase. Use: upcoming, live, ended.",
            )
    total = db.scalar(select(func.count()).select_from(Auction).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Auction)
            .where(*filters)
            .order_by(Auction.ends_at.asc(), Auction.id.asc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    listing_ids = list({row.listing_id for row in rows})
    listings = {
        row.id: row
        for row in db.scalars(
            select(Listing).where(Listing.id.in_(listing_ids))
        ).all()
    } if listing_ids else {}
    seller_ids = {row.seller_id for row in listings.values()}
    winner_ids = {row.current_winner_id for row in rows if row.current_winner_id}
    names = _bidder_names(db, seller_ids | winner_ids)
    items = []
    for row in rows:
        listing = listings[row.listing_id]
        items.append(
            AuctionOut(
                id=row.id,
                listing_id=row.listing_id,
                status=row.status.value,
                starting_bid_minor=row.starting_bid_minor,
                minimum_increment_minor=row.minimum_increment_minor,
                reserve_minor=row.reserve_minor,
                current_bid_minor=row.current_bid_minor,
                current_winning_bid_id=row.current_winning_bid_id,
                current_winner_id=None,
                winner=None,
                bid_count=row.bid_count,
                starts_at=row.starts_at,
                ends_at=row.ends_at,
                created_at=row.created_at,
                updated_at=row.updated_at,
                listing=ListingRef(
                    id=listing.id,
                    title=listing.title,
                    sale_type=listing.sale_type.value,
                    status=listing.status.value,
                ),
            )
        )
    return PaginatedAuctions(items=items, total=total, limit=limit, offset=offset)


@router.get("/{auction_id}", response_model=AuctionOut)
def get_auction(
    auction_id: uuid.UUID,
    viewer: User | None = Depends(_optional_viewer),
    db: Session = Depends(get_db_session),
) -> AuctionOut:
    """Public auction detail; winner identity only for seller/winner/admin."""

    return _serialize_auction(db, _get_auction_or_404(auction_id, db), viewer)


@router.get("/{auction_id}/bids", response_model=PaginatedBids)
def list_bids(
    auction_id: uuid.UUID,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_session),
) -> PaginatedBids:
    """Public immutable bid history, newest first."""

    auction = _get_auction_or_404(auction_id, db)
    filters = [Bid.auction_id == auction.id]
    total = db.scalar(select(func.count()).select_from(Bid).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Bid)
            .where(*filters)
            .order_by(Bid.created_at.desc(), Bid.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    names = _bidder_names(db, {row.bidder_id for row in rows})
    return PaginatedBids(
        items=[_serialize_bid(db, row, names) for row in rows],
        total=total,
        bid_count=auction.bid_count,
        limit=limit,
        offset=offset,
    )


@router.post("/{auction_id}/bids", response_model=BidOut, status_code=status.HTTP_201_CREATED)
def place_bid(
    auction_id: uuid.UUID,
    payload: BidCreate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> BidOut:
    """Authoritative bid placement: one locked transaction, idempotent by request_id."""

    if payload.currency != "INR":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Currency must be INR.",
        )
    auction = db.scalars(
        select(Auction).where(Auction.id == auction_id).with_for_update()
    ).first()
    if auction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Auction not found."
        )
    # Idempotent retry: same (auction, bidder, request_id) returns the existing row.
    existing = db.scalars(
        select(Bid).where(
            Bid.auction_id == auction.id,
            Bid.bidder_id == user.id,
            Bid.request_id == payload.request_id,
        )
    ).first()
    if existing is not None:
        # Idempotent retry: same row back with 200 (not a new 201).
        names = _bidder_names(db, {user.id})
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=_serialize_bid(db, existing, names).model_dump(mode="json"),
        )

    listing = db.get(Listing, auction.listing_id)
    if listing is None:  # pragma: no cover - defensive; FK prevents this
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    if listing.seller_id == user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The seller cannot bid on their own auction.",
        )
    now = _now()
    # Anti-churn cap: a single bidder cannot flood one auction with
    # unbounded bids (configurable, default 200 per user per auction).
    my_bid_count = db.scalar(
        select(func.count()).select_from(Bid).where(
            Bid.auction_id == auction.id, Bid.bidder_id == user.id
        )
    )
    if (my_bid_count or 0) >= get_settings().max_bids_per_user_per_auction:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Bid limit reached for this auction.",
        )
    if auction.status != AuctionStatus.LIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Auction is {auction.status.value}; bids require a LIVE auction.",
        )
    if not (auction.starts_at <= now < auction.ends_at):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bids are only accepted inside the auction window.",
        )
    floor = (
        auction.starting_bid_minor
        if auction.current_bid_minor is None
        else auction.current_bid_minor + auction.minimum_increment_minor
    )
    if payload.amount_minor < floor:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bid of {payload.amount_minor} is below the minimum accepted bid of {floor}.",
        )

    bid = Bid(
        auction_id=auction.id,
        bidder_id=user.id,
        amount_minor=payload.amount_minor,
        currency=payload.currency,
        status=BidStatus.WINNING,
        request_id=payload.request_id,
    )
    db.add(bid)
    db.flush()
    # Exactly one WINNING bid may exist: demote any prior winner.
    previous_winner_id = auction.current_winner_id
    db.execute(
        Bid.__table__.update()
        .where(Bid.auction_id == auction.id, Bid.id != bid.id, Bid.status == BidStatus.WINNING)
        .values(status=BidStatus.OUTBID)
    )
    auction.current_bid_minor = bid.amount_minor
    auction.current_bid_id = bid.id
    auction.current_winning_bid_id = bid.id
    auction.current_winner_id = user.id
    auction.bid_count = (auction.bid_count or 0) + 1
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bid conflicts with an existing row; retry with a new request_id.",
        ) from error
    db.refresh(bid)
    if previous_winner_id is not None and previous_winner_id != user.id:
        notify(
            db,
            user_id=previous_winner_id,
            actor_id=user.id,
            type=NotificationType.OUTBID,
            title="You have been outbid",
            body=f"Someone bid ₹{payload.amount_minor:,} on an auction you were leading for \"{listing.title}\".",
            link="/auctions",
        )
    return _serialize_bid(db, bid, {user.id: None} | _bidder_names(db, {user.id}))


@router.post("/{auction_id}/schedule", response_model=AuctionOut)
def schedule_auction(
    auction_id: uuid.UUID,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> AuctionOut:
    """Seller/ADMIN moves DRAFT -> SCHEDULED."""

    auction = _get_auction_or_404(auction_id, db)
    _require_auction_seller_or_admin(auction, user, db)
    if auction.status != AuctionStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Auction is {auction.status.value}; only DRAFT auctions can be scheduled.",
        )
    auction.status = AuctionStatus.SCHEDULED
    db.commit()
    db.refresh(auction)
    return _serialize_auction(db, auction, user)


@router.post("/{auction_id}/start", response_model=AuctionOut)
def start_auction(
    auction_id: uuid.UUID,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> AuctionOut:
    """Seller/ADMIN moves SCHEDULED -> LIVE once starts_at is reached."""

    auction = _get_auction_or_404(auction_id, db)
    _require_auction_seller_or_admin(auction, user, db)
    if auction.status != AuctionStatus.SCHEDULED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Auction is {auction.status.value}; only SCHEDULED auctions can start.",
        )
    now = _now()
    if now < auction.starts_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Auction cannot start before starts_at.",
        )
    if now >= auction.ends_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Auction window has already passed.",
        )
    auction.status = AuctionStatus.LIVE
    db.commit()
    db.refresh(auction)
    return _serialize_auction(db, auction, user)


def close_auction(db: Session, auction_id: uuid.UUID) -> tuple[Auction, AuctionResult, bool]:
    """Authoritative close, safe for endpoints now and a scheduler later.

    Locks the auction row, requires LIVE + elapsed ends_at, writes exactly
    one result row. The top bid wins only when it meets the reserve
    (reserve_minor NULL means unrestricted; >= reserve wins, ties included):
    a below-reserve top bid leaves no winner — the result is NO_BIDS, no
    bid flips to WON, and no checkout state is created. Returns
    (auction, result, created). Retries return the existing result.
    """

    auction = db.scalars(
        select(Auction).where(Auction.id == auction_id).with_for_update()
    ).first()
    if auction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Auction not found."
        )
    existing = db.scalars(
        select(AuctionResult).where(AuctionResult.auction_id == auction.id)
    ).first()
    if existing is not None:
        return auction, existing, False
    if auction.status != AuctionStatus.LIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Auction is {auction.status.value}; only LIVE auctions can close.",
        )
    if _now() < auction.ends_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Auction cannot end before ends_at.",
        )
    top = db.scalars(
        select(Bid)
        .where(
            Bid.auction_id == auction.id,
            Bid.status.in_([BidStatus.WINNING, BidStatus.OUTBID]),
        )
        .order_by(Bid.amount_minor.desc(), Bid.created_at.asc(), Bid.id.asc())
    ).first()
    had_bids = top is not None
    now = _now()
    # Reserve-price enforcement: a bid at or above the reserve wins; the
    # highest bid alone is not enough when it is below the reserve.
    meets_reserve = (
        top is not None
        and (auction.reserve_minor is None or top.amount_minor >= auction.reserve_minor)
    )
    if not meets_reserve:
        # Same terminal path as no bids: canonical "no winner" result with
        # no winning_bid_id/winner_id and no AWAITING_CHECKOUT/checkout flow.
        top = None
    if top is None:
        result = AuctionResult(auction_id=auction.id, status=AuctionResultStatus.NO_BIDS)
    else:
        top.status = BidStatus.WON
        window = get_settings().auction_checkout_window_hours
        result = AuctionResult(
            auction_id=auction.id,
            status=AuctionResultStatus.AWAITING_CHECKOUT,
            winning_bid_id=top.id,
            winner_id=top.bidder_id,
            final_price_minor=top.amount_minor,
            currency="INR",
            decided_at=now,
            checkout_expires_at=now + timedelta(hours=window),
        )
    auction.status = AuctionStatus.ENDED
    db.add(result)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        existing = db.scalars(
            select(AuctionResult).where(AuctionResult.auction_id == auction.id)
        ).first()
        if existing is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Auction result already exists.",
            ) from error
        db.refresh(auction)
        return auction, existing, False
    db.refresh(auction)
    db.refresh(result)

    auction_listing = db.get(Listing, auction.listing_id)
    listing_title = auction_listing.title if auction_listing else "This listing"
    if top is not None:
        notify(
            db,
            user_id=top.bidder_id,
            actor_id=auction_listing.seller_id if auction_listing else None,
            type=NotificationType.AUCTION_WON,
            title="You won the auction",
            body=f"Congratulations! You won the auction for \"{listing_title}\". Complete checkout to claim it.",
            link="/auctions",
        )
    if auction_listing is not None and auction_listing.seller_id is not None:
        notify(
            db,
            user_id=auction_listing.seller_id,
            actor_id=top.bidder_id if top is not None else None,
            type=NotificationType.AUCTION_ENDED,
            title="Auction ended",
            body=(
                f"Your auction for \"{listing_title}\" ended with a winning bid of ₹{top.amount_minor:,}."
                if top is not None
                else (
                    f"Your auction for \"{listing_title}\" ended with no bids."
                    if not had_bids
                    else f"Your auction for \"{listing_title}\" ended below your reserve price; there is no winner."
                )
            ),
            link="/auctions",
        )
    return auction, result, True


@router.post("/{auction_id}/close", response_model=AuctionResultOut)
def close_auction_endpoint(
    auction_id: uuid.UUID,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> AuctionResultOut:
    """Seller/ADMIN closes a LIVE auction whose end time has passed (idempotent)."""

    auction = _get_auction_or_404(auction_id, db)
    _require_auction_seller_or_admin(auction, user, db)
    _, result, _ = close_auction(db, auction_id)
    return _serialize_result(db, result, user)


def _serialize_result(
    db: Session, result: AuctionResult, viewer: User | None
) -> AuctionResultOut:
    privileged = False
    if viewer is not None:
        auction = db.get(Auction, result.auction_id)
        listing = db.get(Listing, auction.listing_id) if auction else None
        privileged = (
            (result.winner_id is not None and viewer.id == result.winner_id)
            or (listing is not None and viewer.id == listing.seller_id)
            or is_admin(db, viewer)
        )
    names = _bidder_names(db, {result.winner_id} if result.winner_id else set())
    return AuctionResultOut(
        id=result.id,
        auction_id=result.auction_id,
        status=result.status.value,
        winning_bid_id=result.winning_bid_id,
        winner_id=result.winner_id if privileged else None,
        winner=(
            AuctionWinnerRef(id=result.winner_id, display_name=names.get(result.winner_id))
            if privileged and result.winner_id is not None
            else None
        ),
        final_price_minor=result.final_price_minor if privileged else None,
        currency=result.currency if privileged else None,
        decided_at=result.decided_at,
        checkout_expires_at=result.checkout_expires_at if privileged else None,
        created_at=result.created_at,
    )


@router.get("/{auction_id}/result")
def get_result(
    auction_id: uuid.UUID,
    viewer: User | None = Depends(_optional_viewer),
    db: Session = Depends(get_db_session),
):
    """Result visibility: public status, full entitlement for winner/seller/admin."""

    auction = _get_auction_or_404(auction_id, db)
    result = db.scalars(
        select(AuctionResult).where(AuctionResult.auction_id == auction.id)
    ).first()
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Auction result not found."
        )
    listing = db.get(Listing, auction.listing_id)
    privileged = (
        viewer is not None
        and (
            (result.winner_id is not None and viewer.id == result.winner_id)
            or (listing is not None and viewer.id == listing.seller_id)
            or is_admin(db, viewer)
        )
    )
    if not privileged:
        return {"auction_id": str(auction.id), "status": result.status.value}
    return _serialize_result(db, result, viewer)
