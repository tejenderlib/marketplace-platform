"""Read-only admin endpoints (all REQUIRE require_admin_user; no mutations)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

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
from app.notifications.models import NotificationType
from app.notifications.service import notify
from app.orders.models import Order, OrderSource, OrderStatus, Payment, PaymentProvider, PaymentStatus
from app.orders.schemas import OrderOut, PaginatedOrders, PaymentOut
from app.orders.views import serialize_many as serialize_orders_many
from app.orders.views import serialize_order as serialize_single_order
from app.reviews.models import Review, ReviewStatus
from app.reviews.schemas import PaginatedReviews, ReviewOut
from app.reports.models import Report, ReportStatus
from app.reports.schemas import PaginatedReports, ReportOut, ReportStatusUpdate
from app.support.models import (
    SupportTicket,
    SupportTicketMessage,
    SupportTicketPriority,
    SupportTicketStatus,
)
from app.support.schemas import (
    PaginatedSupportTickets,
    SupportMessageCreate,
    SupportTicketMessageOut,
    SupportTicketOut,
    SupportTicketUpdate,
)
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
    target_review_id: uuid.UUID | None = None,
) -> ModerationAction:
    """Append one immutable audit row (call inside the mutation transaction)."""

    action = ModerationAction(
        admin_id=admin.id,
        action_type=action_type,
        target_user_id=target_user_id,
        target_listing_id=target_listing_id,
        target_review_id=target_review_id,
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
        target_review_id=action.target_review_id,
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

    notification_types = {
        ModerationActionType.LISTING_APPROVED: NotificationType.LISTING_APPROVED,
        ModerationActionType.LISTING_REJECTED: NotificationType.LISTING_REJECTED,
        ModerationActionType.LISTING_REMOVED: NotificationType.LISTING_REMOVED,
        ModerationActionType.LISTING_RESTORED: NotificationType.LISTING_RESTORED,
    }
    if action_type in notification_types and listing.seller_id is not None:
        notify(
            db,
            user_id=listing.seller_id,
            actor_id=admin.id,
            type=notification_types[action_type],
            title=f"Listing {to_status.value.lower()}",
            body=f"Your listing \"{listing.title}\" was {to_status.value.lower()}{(' — ' + reason) if reason else ''}.",
            link=f"#/listing/{listing.id}",
        )
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


def _parse_review_status(value: str | None):
    if value is None:
        return None
    try:
        return ReviewStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid review status. Use: {', '.join(s.value for s in ReviewStatus)}.",
        ) from None


@router.get("/reviews", response_model=PaginatedReviews)
def list_reviews(
    status_filter: str | None = Query(default=None, alias="status"),
    reviewer_id: uuid.UUID | None = None,
    reviewee_id: uuid.UUID | None = None,
    order_id: uuid.UUID | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> PaginatedReviews:
    """Admin review oversight: all rows incl. REMOVED, with filters."""

    filters = []
    status_enum = _parse_review_status(status_filter)
    if status_enum is not None:
        filters.append(Review.status == status_enum)
    if reviewer_id is not None:
        filters.append(Review.reviewer_id == reviewer_id)
    if reviewee_id is not None:
        filters.append(Review.reviewee_id == reviewee_id)
    if order_id is not None:
        filters.append(Review.order_id == order_id)
    total = db.scalar(select(func.count()).select_from(Review).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Review)
            .where(*filters)
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


@router.post("/reviews/{review_id}/remove", response_model=ModerationActionOut)
def remove_review(
    review_id: uuid.UUID,
    payload: ModerationRequest,
    admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ModerationActionOut:
    """Soft-remove a review: ACTIVE -> REMOVED, audit row appended.

    The review row is never deleted; it is hidden from public/reviewee reads
    while remaining in the author's history.
    """

    review = db.scalars(
        select(Review).where(Review.id == review_id).with_for_update()
    ).first()
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Review not found."
        )
    if review.status == ReviewStatus.REMOVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Review is already removed.",
        )
    review.status = ReviewStatus.REMOVED
    review.removed_at = datetime.now(timezone.utc)
    action = _audit(
        db, admin, ModerationActionType.REVIEW_REMOVED, payload.reason,
        payload.metadata, target_review_id=review.id,
    )
    db.commit()
    db.refresh(action)
    return _audit_out(action)


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
    target_review_id: uuid.UUID | None = None,
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
    if target_review_id is not None:
        filters.append(ModerationAction.target_review_id == target_review_id)
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


def _parse_report_status(value: str | None):
    if value is None:
        return None
    try:
        return ReportStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid report status. Use: {', '.join(s.value for s in ReportStatus)}.",
        ) from None


def _serialize_report(db: Session, report: Report) -> ReportOut:
    return ReportOut.model_validate(report)


@router.get("/reports", response_model=PaginatedReports)
def list_reports(
    status_filter: str | None = Query(default=None, alias="status"),
    target_type: str | None = None,
    reporter_id: uuid.UUID | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> PaginatedReports:
    """Admin report oversight: all rows, with filters."""

    filters = []
    status_enum = _parse_report_status(status_filter)
    if status_enum is not None:
        filters.append(Report.status == status_enum)
    if target_type is not None:
        filters.append(Report.target_type == target_type)
    if reporter_id is not None:
        filters.append(Report.reporter_id == reporter_id)
    total = db.scalar(select(func.count()).select_from(Report).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(Report)
            .where(*filters)
            .order_by(Report.created_at.desc(), Report.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedReports(
        items=[_serialize_report(db, row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/reports/{report_id}", response_model=ReportOut)
def report_detail(
    report_id: uuid.UUID,
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ReportOut:
    """Single report (ADMIN only)."""

    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found."
        )
    return _serialize_report(db, report)


@router.patch("/reports/{report_id}/status", response_model=ReportOut)
def update_report_status(
    report_id: uuid.UUID,
    payload: ReportStatusUpdate,
    admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> ReportOut:
    """Admin transitions a report: OPEN -> UNDER_REVIEW -> RESOLVED | DISMISSED."""

    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Report not found."
        )
    try:
        new_status = ReportStatus(payload.status)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid report status. Use: {', '.join(s.value for s in ReportStatus)}.",
        ) from None
    if report.status == new_status:
        db.commit()
    else:
        report.status = new_status
        db.commit()
    db.refresh(report)
    return _serialize_report(db, report)


def _parse_ticket_status(value: str | None):
    if value is None:
        return None
    try:
        return SupportTicketStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid ticket status. Use: {', '.join(s.value for s in SupportTicketStatus)}.",
        ) from None


def _parse_ticket_priority(value: str | None):
    if value is None:
        return None
    try:
        return SupportTicketPriority(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid priority. Use: {', '.join(p.value for p in SupportTicketPriority)}.",
        ) from None


@router.get("/support/tickets", response_model=PaginatedSupportTickets)
def list_tickets(
    status_filter: str | None = Query(default=None, alias="status"),
    priority_filter: str | None = Query(default=None, alias="priority"),
    user_id: uuid.UUID | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> PaginatedSupportTickets:
    """Admin support-ticket listing with filters."""

    filters = []
    status_enum = _parse_ticket_status(status_filter)
    if status_enum is not None:
        filters.append(SupportTicket.status == status_enum)
    priority_enum = _parse_ticket_priority(priority_filter)
    if priority_enum is not None:
        filters.append(SupportTicket.priority == priority_enum)
    if user_id is not None:
        filters.append(SupportTicket.user_id == user_id)
    total = db.scalar(select(func.count()).select_from(SupportTicket).where(*filters)) or 0
    rows = list(
        db.scalars(
            select(SupportTicket)
            .where(*filters)
            .order_by(SupportTicket.created_at.desc(), SupportTicket.id.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )
    return PaginatedSupportTickets(
        items=[SupportTicketOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/support/tickets/{ticket_id}", response_model=SupportTicketOut)
def ticket_detail_admin(
    ticket_id: uuid.UUID,
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> SupportTicketOut:
    """Single support ticket (ADMIN only)."""

    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )
    return SupportTicketOut.model_validate(ticket)


@router.get("/support/tickets/{ticket_id}/messages", response_model=list[SupportTicketMessageOut])
def ticket_messages_admin(
    ticket_id: uuid.UUID,
    _admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> list[SupportTicketMessageOut]:
    """Thread messages for a ticket (ADMIN only)."""

    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )
    rows = list(
        db.scalars(
            select(SupportTicketMessage)
            .where(SupportTicketMessage.ticket_id == ticket.id)
            .order_by(SupportTicketMessage.created_at.asc(), SupportTicketMessage.id.asc())
        ).all()
    )
    return [SupportTicketMessageOut.model_validate(row) for row in rows]


@router.patch("/support/tickets/{ticket_id}", response_model=SupportTicketOut)
def update_ticket_admin(
    ticket_id: uuid.UUID,
    payload: SupportTicketUpdate,
    admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> SupportTicketOut:
    """Admin updates a ticket's status and/or priority."""

    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )
    if payload.status is not None:
        try:
            status_enum = SupportTicketStatus(payload.status)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid ticket status. Use: {', '.join(s.value for s in SupportTicketStatus)}.",
            ) from None
        ticket.status = status_enum
    if payload.priority is not None:
        try:
            priority_enum = SupportTicketPriority(payload.priority)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid priority. Use: {', '.join(p.value for p in SupportTicketPriority)}.",
            ) from None
        ticket.priority = priority_enum
    db.commit()
    db.refresh(ticket)
    return SupportTicketOut.model_validate(ticket)


@router.post(
    "/support/tickets/{ticket_id}/messages",
    response_model=SupportTicketMessageOut,
    status_code=status.HTTP_201_CREATED,
)
def reply_ticket_admin(
    ticket_id: uuid.UUID,
    payload: SupportMessageCreate,
    admin: User = Depends(require_admin_user),
    db: Session = Depends(get_db_session),
) -> SupportTicketMessageOut:
    """Support replies to a ticket; sets WAITING_FOR_CUSTOMER."""

    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found."
        )
    if not payload.body.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message body cannot be empty.",
        )
    if ticket.status in ("RESOLVED", "CLOSED"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Terminal tickets cannot receive replies.",
        )
    message = SupportTicketMessage(
        ticket_id=ticket.id,
        author_id=admin.id,
        body=payload.body.strip(),
    )
    ticket.status = SupportTicketStatus.WAITING_FOR_CUSTOMER
    db.add(message)
    db.commit()
    db.refresh(message)
    return SupportTicketMessageOut.model_validate(message)
