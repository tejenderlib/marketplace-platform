"""Read-only admin endpoints (all REQUIRE require_admin_user; no mutations)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.admin.dependencies import require_admin_user
from app.admin.models import ModerationAction, ModerationActionType
from app.admin.schemas import (
    AdminAuctionDetail,
    AdminUserDetail,
    AdminUserSummary,
    DashboardStats,
    ModerationActionOut,
    ModerationRequest,
    PaginatedAdminUsers,
    PaginatedModerationActions,
)
from app.api.v1 import catalog as catalog_module
from app.catalog.models import (
    Listing,
    ListingSaleType,
    ListingStatus,
)
from app.catalog.schemas import ListingOut, PaginatedListings
from app.db.session import get_db_session
from app.identity.models import (
    AuthRefreshToken,
    RefreshTokenStatus,
    Role,
    RoleName,
    User,
    UserProfile,
    UserRole,
    UserStatus,
)
from app.orders.models import Order, OrderSource, OrderStatus, Payment, PaymentProvider, PaymentStatus
from app.orders.schemas import OrderOut, PaginatedOrders, PaymentOut
from app.orders.views import serialize_many as serialize_orders_many
from app.orders.views import serialize_order as serialize_single_order
from app.trading.models import (
    Auction,
    AuctionResult,
    AuctionStatus,
)

router = APIRouter(prefix="/admin", tags=["admin"])

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100


def _count(db: Session, entity, *conditions) -> int:
    return db.scalar(select(func.count()).select_from(entity).where(*conditions)) or 0


@router.get("/dashboard", response_model=DashboardStats)
def dashboard(
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> DashboardStats:
    """Aggregate marketplace statistics via scalar SQL queries (no row loading)."""

    paid_total = (
        db.scalar(
            select(func.coalesce(func.sum(Payment.amount_minor), 0)).where(
                Payment.status == PaymentStatus.SUCCEEDED
            )
        )
        or 0
    )
    return DashboardStats(
        total_users=_count(db, User),
        active_users=_count(db, User, User.status == UserStatus.ACTIVE),
        suspended_users=_count(db, User, User.status == UserStatus.SUSPENDED),
        total_listings=_count(db, Listing),
        active_listings=_count(db, Listing, Listing.status == ListingStatus.ACTIVE),
        sold_listings=_count(db, Listing, Listing.status == ListingStatus.SOLD),
        live_auctions=_count(db, Auction, Auction.status == AuctionStatus.LIVE),
        ended_auctions=_count(db, Auction, Auction.status == AuctionStatus.ENDED),
        total_orders=_count(db, Order),
        paid_orders=_count(db, Order, Order.status == OrderStatus.PAID),
        pending_payment_orders=_count(db, Order, Order.status == OrderStatus.PENDING_PAYMENT),
        failed_payment_orders=_count(db, Order, Order.status == OrderStatus.PAYMENT_FAILED),
        successful_payments=_count(db, Payment, Payment.status == PaymentStatus.SUCCEEDED),
        successful_payments_total_minor=int(paid_total),
    )


def _roles_map(db: Session, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    if not user_ids:
        return {}
    rows = db.execute(
        select(UserRole.user_id, Role.name)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id.in_(user_ids))
    ).all()
    grouped: dict[uuid.UUID, list[str]] = {}
    for user_id, name in rows:
        grouped.setdefault(user_id, []).append(name.value)
    for names in grouped.values():
        names.sort()
    return grouped


def _profiles_map(db: Session, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str | None]:
    if not user_ids:
        return {}
    return dict(
        db.execute(
            select(UserProfile.user_id, UserProfile.display_name).where(
                UserProfile.user_id.in_(user_ids)
            )
        ).all()
    )


def _summarize(db: Session, user: User, roles: list[str], display_name: str | None) -> AdminUserSummary:
    return AdminUserSummary(
        id=user.id,
        email=user.email,
        status=user.status.value,
        roles=roles,
        display_name=display_name,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("/users", response_model=PaginatedAdminUsers)
def list_users(
    status_filter: str | None = Query(default=None, alias="status"),
    role: str | None = None,
    q: str | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> PaginatedAdminUsers:
    """Paginated safe user summaries with status/role/search filters."""

    from app.identity.models import UserRole

    stmt = select(User)
    if status_filter is not None:
        try:
            status_enum = UserStatus(status_filter)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status. Use: {', '.join(s.value for s in UserStatus)}.",
            ) from None
        stmt = stmt.where(User.status == status_enum)
    if role is not None:
        try:
            role_enum = RoleName(role)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid role. Use: {', '.join(r.value for r in RoleName)}.",
            ) from None
        stmt = stmt.join(UserRole, UserRole.user_id == User.id).join(
            Role, Role.id == UserRole.role_id
        ).where(Role.name == role_enum)
    if q is not None and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.outerjoin(UserProfile, UserProfile.user_id == User.id).where(
            or_(User.email.ilike(pattern), UserProfile.display_name.ilike(pattern))
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(
        db.scalars(stmt.order_by(User.created_at.desc(), User.id.desc()).limit(limit).offset(offset)).all()
    )
    ids = {row.id for row in rows}
    roles = _roles_map(db, ids)
    names = _profiles_map(db, ids)
    return PaginatedAdminUsers(
        items=[_summarize(db, row, roles.get(row.id, []), names.get(row.id)) for row in rows],
        total=total, limit=limit, offset=offset,
    )


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def user_detail(
    user_id: uuid.UUID,
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> AdminUserDetail:
    """Safe administrative user detail with listing/order counts."""

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found."
        )
    roles = _roles_map(db, {user.id}).get(user.id, [])
    names = _profiles_map(db, {user.id})
    base = _summarize(db, user, roles, names.get(user.id))
    return AdminUserDetail(
        **base.model_dump(),
        listings_count=_count(db, Listing, Listing.seller_id == user.id),
        buyer_orders_count=_count(db, Order, Order.buyer_id == user.id),
        seller_orders_count=_count(db, Order, Order.seller_id == user.id),
    )


def _parse_listing_status(value: str | None):
    if value is None:
        return None
    try:
        return ListingStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Use: {', '.join(s.value for s in ListingStatus)}.",
        ) from None


def _parse_sale_type(value: str | None):
    if value is None:
        return None
    try:
        return ListingSaleType(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid sale_type. Use: {', '.join(t.value for t in ListingSaleType)}.",
        ) from None


@router.get("/listings", response_model=PaginatedListings)
def admin_listings(
    listing_status: str | None = Query(default=None, alias="status"),
    sale_type: str | None = None,
    category_id: uuid.UUID | None = None,
    seller_id: uuid.UUID | None = None,
    q: str | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> PaginatedListings:
    """Moderation-ready listing browse (no ACTIVE default unlike public)."""

    filters = []
    status_enum = _parse_listing_status(listing_status)
    if status_enum is not None:
        filters.append(Listing.status == status_enum)
    sale_enum = _parse_sale_type(sale_type)
    if sale_enum is not None:
        filters.append(Listing.sale_type == sale_enum)
    if category_id is not None:
        filters.append(Listing.category_id == category_id)
    if seller_id is not None:
        filters.append(Listing.seller_id == seller_id)
    if q is not None and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(Listing.title.ilike(pattern), Listing.description.ilike(pattern))
        )
    total = db.scalar(select(func.count()).select_from(Listing).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Listing)
            .where(*filters)
            .options(selectinload(Listing.category), selectinload(Listing.images))
            .order_by(Listing.created_at.desc(), Listing.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedListings(
        items=catalog_module._serialize_many(db, rows),
        total=total, limit=limit, offset=offset,
    )


@router.get("/listings/{listing_id}", response_model=ListingOut)
def admin_listing_detail(
    listing_id: uuid.UUID,
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ListingOut:
    """Full administrative listing view with images and auction summary."""

    listing = db.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    return catalog_module._serialize_many(db, [listing], with_auctions=True)[0]


def _parse_order_status(value: str | None):
    if value is None:
        return None
    try:
        return OrderStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Use: {', '.join(s.value for s in OrderStatus)}.",
        ) from None


def _parse_order_source(value: str | None):
    if value is None:
        return None
    try:
        return OrderSource(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid source. Use: {', '.join(s.value for s in OrderSource)}.",
        ) from None


@router.get("/orders", response_model=PaginatedOrders)
def admin_orders(
    order_status: str | None = Query(default=None, alias="status"),
    source: str | None = None,
    buyer_id: uuid.UUID | None = None,
    seller_id: uuid.UUID | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> PaginatedOrders:
    """All orders with status/source/buyer/seller filters (payments included)."""

    filters = []
    status_enum = _parse_order_status(order_status)
    if status_enum is not None:
        filters.append(Order.status == status_enum)
    source_enum = _parse_order_source(source)
    if source_enum is not None:
        filters.append(Order.source == source_enum)
    if buyer_id is not None:
        filters.append(Order.buyer_id == buyer_id)
    if seller_id is not None:
        filters.append(Order.seller_id == seller_id)
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
        items=serialize_orders_many(db, rows), total=total, limit=limit, offset=offset
    )


@router.get("/orders/{order_id}", response_model=OrderOut)
def admin_order_detail(
    order_id: uuid.UUID,
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> OrderOut:
    """Full order view with payment summary (no payment secrets exist)."""

    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Order not found."
        )
    return serialize_single_order(db, order)


def _admin_auction_view(
    db: Session, auction: Auction
) -> AdminAuctionDetail:
    listing = db.get(Listing, auction.listing_id)
    assert listing is not None
    names = _profiles_map(db, {listing.seller_id} | (
        {auction.current_winner_id} if auction.current_winner_id else set()
    ))
    result = db.scalars(
        select(AuctionResult).where(AuctionResult.auction_id == auction.id)
    ).first()
    return AdminAuctionDetail(
        id=auction.id,
        listing_id=auction.listing_id,
        listing_title=listing.title,
        seller_id=listing.seller_id,
        seller_display_name=names.get(listing.seller_id),
        status=auction.status.value,
        starting_bid_minor=auction.starting_bid_minor,
        minimum_increment_minor=auction.minimum_increment_minor,
        current_bid_minor=auction.current_bid_minor,
        current_winner_id=auction.current_winner_id,
        bid_count=auction.bid_count,
        starts_at=auction.starts_at,
        ends_at=auction.ends_at,
        settled_at=auction.settled_at,
        result_status=result.status.value if result else None,
        result_winner_id=result.winner_id if result else None,
        result_final_price_minor=result.final_price_minor if result else None,
        result_decided_at=result.decided_at if result else None,
        created_at=auction.created_at,
    )


@router.get("/auctions", response_model=list[AdminAuctionDetail])
def admin_auctions(
    auction_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> list[AdminAuctionDetail]:
    """Auction oversight list with settlement summaries."""

    filters = []
    if auction_status is not None:
        try:
            status_enum = AuctionStatus(auction_status)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status. Use: {', '.join(s.value for s in AuctionStatus)}.",
            ) from None
        filters.append(Auction.status == status_enum)
    rows = list(
        db.scalars(
            select(Auction)
            .where(*filters)
            .order_by(Auction.ends_at.asc(), Auction.id.asc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return [_admin_auction_view(db, row) for row in rows]


@router.get("/auctions/{auction_id}", response_model=AdminAuctionDetail)
def admin_auction_detail(
    auction_id: uuid.UUID,
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> AdminAuctionDetail:
    """Full auction view with winner/result/settlement summary."""

    auction = db.get(Auction, auction_id)
    if auction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Auction not found."
        )
    return _admin_auction_view(db, auction)


def _parse_payment_status(value: str | None):
    if value is None:
        return None
    try:
        return PaymentStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Use: {', '.join(s.value for s in PaymentStatus)}.",
        ) from None


def _parse_provider(value: str | None):
    if value is None:
        return None
    try:
        return PaymentProvider(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid provider. Use: {', '.join(p.value for p in PaymentProvider)}.",
        ) from None


@router.get("/payments", response_model=list[PaymentOut])
def admin_payments(
    payment_status: str | None = Query(default=None, alias="status"),
    provider: str | None = None,
    order_id: uuid.UUID | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> list[PaymentOut]:
    """Payment oversight: safe fields only (no credentials/card/token material)."""

    filters = []
    status_enum = _parse_payment_status(payment_status)
    if status_enum is not None:
        filters.append(Payment.status == status_enum)
    provider_enum = _parse_provider(provider)
    if provider_enum is not None:
        filters.append(Payment.provider == provider_enum)
    if order_id is not None:
        filters.append(Payment.order_id == order_id)
    rows = list(
        db.scalars(
            select(Payment)
            .where(*filters)
            .order_by(Payment.initiated_at.desc(), Payment.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return [PaymentOut.model_validate(row) for row in rows]


def _audit(
    db: Session,
    admin: User,
    action_type: ModerationActionType,
    reason: str,
    metadata: dict | None,
    target_user_id: uuid.UUID | None = None,
    target_listing_id: uuid.UUID | None = None,
) -> ModerationAction:
    """Append one immutable audit row (call inside the mutation transaction)."""

    action = ModerationAction(
        admin_id=admin.id,
        action_type=action_type,
        target_user_id=target_user_id,
        target_listing_id=target_listing_id,
        reason=reason.strip(),
        action_metadata=metadata or {},
    )
    db.add(action)
    db.flush()
    return action


def _audit_out(action: ModerationAction) -> ModerationActionOut:
    return ModerationActionOut(
        id=action.id,
        admin_id=action.admin_id,
        action_type=action.action_type.value,
        target_listing_id=action.target_listing_id,
        target_user_id=action.target_user_id,
        reason=action.reason,
        action_metadata=action.action_metadata,
        created_at=action.created_at,
    )


@router.post("/users/{user_id}/suspend", response_model=ModerationActionOut)
def suspend_user(
    user_id: uuid.UUID,
    payload: ModerationRequest,
    admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ModerationActionOut:
    """Suspend a user: lock, transition, revoke sessions, audit — atomically."""

    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An admin cannot suspend themselves.",
        )
    target = db.scalars(select(User).where(User.id == user_id).with_for_update()).first()
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found."
        )
    if target.status == UserStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="User is already suspended."
        )
    if target.status == UserStatus.DELETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Deleted users cannot be suspended.",
        )
    # Historical marketplace rows are preserved; only status moves.
    target.status = UserStatus.SUSPENDED
    # Revoke live sessions so suspension takes effect immediately.
    db.execute(
        AuthRefreshToken.__table__.update()
        .where(
            AuthRefreshToken.user_id == target.id,
            AuthRefreshToken.status == RefreshTokenStatus.ACTIVE,
        )
        .values(status=RefreshTokenStatus.REVOKED, revoked_at=func.now())
    )
    action = _audit(
        db, admin, ModerationActionType.USER_SUSPENDED, payload.reason,
        payload.metadata, target_user_id=target.id,
    )
    db.commit()
    db.refresh(action)
    return _audit_out(action)


@router.post("/users/{user_id}/reactivate", response_model=ModerationActionOut)
def reactivate_user(
    user_id: uuid.UUID,
    payload: ModerationRequest,
    admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ModerationActionOut:
    """Reactivate a suspended user back to ACTIVE (DELETED stays terminal)."""

    target = db.scalars(select(User).where(User.id == user_id).with_for_update()).first()
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found."
        )
    if target.status == UserStatus.DELETED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Deleted users cannot be reactivated.",
        )
    if target.status != UserStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User is {target.status.value}; only SUSPENDED users can be reactivated.",
        )
    target.status = UserStatus.ACTIVE
    action = _audit(
        db, admin, ModerationActionType.USER_REACTIVATED, payload.reason,
        payload.metadata, target_user_id=target.id,
    )
    db.commit()
    db.refresh(action)
    return _audit_out(action)


def _moderate_listing(
    db: Session,
    admin: User,
    listing_id: uuid.UUID,
    from_status: ListingStatus,
    to_status: ListingStatus,
    action_type: ModerationActionType,
    reason: str,
    metadata: dict | None,
) -> ModerationActionOut:
    """Lock, validate exact transition, move status, audit — atomically."""

    listing = db.scalars(
        select(Listing).where(Listing.id == listing_id).with_for_update()
    ).first()
    if listing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    if listing.status != from_status:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Listing is {listing.status.value}; this action requires {from_status.value}.",
        )
    listing.status = to_status
    action = _audit(
        db, admin, action_type, reason, metadata, target_listing_id=listing.id
    )
    db.commit()
    db.refresh(action)
    return _audit_out(action)


@router.post("/listings/{listing_id}/approve", response_model=ModerationActionOut)
def approve_listing(
    listing_id: uuid.UUID,
    payload: ModerationRequest,
    admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ModerationActionOut:
    """PENDING_REVIEW -> ACTIVE."""

    return _moderate_listing(
        db, admin, listing_id, ListingStatus.PENDING_REVIEW, ListingStatus.ACTIVE,
        ModerationActionType.LISTING_APPROVED, payload.reason, payload.metadata,
    )


@router.post("/listings/{listing_id}/reject", response_model=ModerationActionOut)
def reject_listing(
    listing_id: uuid.UUID,
    payload: ModerationRequest,
    admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ModerationActionOut:
    """PENDING_REVIEW -> REJECTED."""

    return _moderate_listing(
        db, admin, listing_id, ListingStatus.PENDING_REVIEW, ListingStatus.REJECTED,
        ModerationActionType.LISTING_REJECTED, payload.reason, payload.metadata,
    )


@router.post("/listings/{listing_id}/remove", response_model=ModerationActionOut)
def remove_listing(
    listing_id: uuid.UUID,
    payload: ModerationRequest,
    admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ModerationActionOut:
    """ACTIVE -> REMOVED. Auction/bid rows are never touched."""

    return _moderate_listing(
        db, admin, listing_id, ListingStatus.ACTIVE, ListingStatus.REMOVED,
        ModerationActionType.LISTING_REMOVED, payload.reason, payload.metadata,
    )


@router.post("/listings/{listing_id}/restore", response_model=ModerationActionOut)
def restore_listing(
    listing_id: uuid.UUID,
    payload: ModerationRequest,
    admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ModerationActionOut:
    """REMOVED -> ACTIVE only. SOLD/EXPIRED/ARCHIVED are never restored."""

    return _moderate_listing(
        db, admin, listing_id, ListingStatus.REMOVED, ListingStatus.ACTIVE,
        ModerationActionType.LISTING_RESTORED, payload.reason, payload.metadata,
    )


def _parse_action_type(value: str | None):
    if value is None:
        return None
    try:
        return ModerationActionType(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid action_type. Use: {', '.join(t.value for t in ModerationActionType)}.",
        ) from None


@router.get("/moderation", response_model=PaginatedModerationActions)
def list_moderation(
    action_type: str | None = None,
    admin_id: uuid.UUID | None = None,
    target_user_id: uuid.UUID | None = None,
    target_listing_id: uuid.UUID | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> PaginatedModerationActions:
    """Paginated immutable audit trail, newest first."""

    filters = []
    type_enum = _parse_action_type(action_type)
    if type_enum is not None:
        filters.append(ModerationAction.action_type == type_enum)
    if admin_id is not None:
        filters.append(ModerationAction.admin_id == admin_id)
    if target_user_id is not None:
        filters.append(ModerationAction.target_user_id == target_user_id)
    if target_listing_id is not None:
        filters.append(ModerationAction.target_listing_id == target_listing_id)
    total = db.scalar(select(func.count()).select_from(ModerationAction).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(ModerationAction)
            .where(*filters)
            .order_by(ModerationAction.created_at.desc(), ModerationAction.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedModerationActions(
        items=[_audit_out(row) for row in rows], total=total, limit=limit, offset=offset
    )


@router.get("/moderation/{action_id}", response_model=ModerationActionOut)
def moderation_detail(
    action_id: uuid.UUID,
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ModerationActionOut:
    """Single audit record (ADMIN only)."""

    action = db.get(ModerationAction, action_id)
    if action is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Moderation action not found."
        )
    return _audit_out(action)
