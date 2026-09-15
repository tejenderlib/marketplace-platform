"""Catalog endpoints: public browsing plus owner/admin management.

Response-shape note for the later frontend integration: every listing is
returned as ``ListingOut`` — ``id, title, description, sale_type``
(FIXED_PRICE | AUCTION), ``status``, ``condition`` (NEW | LIKE_NEW |
GOOD | FAIR | POOR | FOR_PARTS), ``fixed_price_minor``/``currency``
(INR minor units, i.e. paise; null price means AUCTION), ``offers_enabled``,
``city``/``region``/``country_code``/``postal_code``,
``published_at``/``expires_at``/``sold_at``, nested ``category``
(id/name/slug), ``seller`` (id/display_name), ``images`` ordered by
sort_order (storage_key resolved by the future storage backend, exactly
one primary), and an ``auction`` summary object (or null) on detail
responses. Lists are paginated (``limit``/``offset``) and
deterministically ordered by ``created_at`` desc, ``id`` desc.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.catalog.dependencies import (
    get_listing_or_404,
    is_admin,
    require_listing_owner_or_admin,
)
from app.catalog.models import (
    Category,
    CategoryStatus,
    Favorite,
    ItemCondition,
    Listing,
    ListingImage,
    ListingSaleType,
    ListingStatus,
)
from app.catalog.schemas import (
    AuctionSummary,
    CategoryOut,
    FavoriteOut,
    ImageCreate,
    ImageOut,
    ImageUpdate,
    ListingCreate,
    ListingOut,
    ListingUpdate,
    PaginatedListings,
    SellerSummary,
)
from app.db.session import get_db_session
from app.identity.dependencies import (
    get_optional_current_user,
    require_active_user,
    require_authenticated_user,
)
from app.identity.models import User, UserProfile
from app.trading.models import Auction

router = APIRouter(prefix="/catalog", tags=["catalog"])

# Listing statuses visible through public detail/list endpoints. All
# other statuses (DRAFT, PENDING_REVIEW, REJECTED, REMOVED, ARCHIVED)
# are only reachable by the seller (their /mine route) or ADMIN.
_PUBLIC_LISTING_STATUSES = frozenset(
    {ListingStatus.ACTIVE, ListingStatus.RESERVED, ListingStatus.SOLD}
)

_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100


def _parse_sale_type(value: str | None) -> ListingSaleType | None:
    if value is None:
        return None
    try:
        return ListingSaleType(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid sale_type. Use: {', '.join(t.value for t in ListingSaleType)}.",
        ) from None


def _parse_status(value: str | None) -> ListingStatus | None:
    if value is None:
        return None
    try:
        return ListingStatus(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status. Use: {', '.join(s.value for s in ListingStatus)}.",
        ) from None


def _parse_condition(value: str | None) -> ItemCondition | None:
    if value is None:
        return None
    try:
        return ItemCondition(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid condition. Use: {', '.join(c.value for c in ItemCondition)}.",
        ) from None


def _display_names(db: Session, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str | None]:
    if not user_ids:
        return {}
    rows = db.execute(
        select(UserProfile.user_id, UserProfile.display_name).where(
            UserProfile.user_id.in_(user_ids)
        )
    ).all()
    return {user_id: display_name for user_id, display_name in rows}


def _auction_map(db: Session, listing_ids: list[uuid.UUID]) -> dict[uuid.UUID, Auction]:
    if not listing_ids:
        return {}
    rows = db.scalars(
        select(Auction).where(Auction.listing_id.in_(listing_ids))
    ).all()
    return {row.listing_id: row for row in rows}


def _serialize_listing(
    listing: Listing,
    display_name: str | None,
    auction: Auction | None = None,
) -> ListingOut:
    images = sorted(listing.images, key=lambda img: img.sort_order)
    return ListingOut(
        id=listing.id,
        title=listing.title,
        description=listing.description,
        sale_type=listing.sale_type.value,
        status=listing.status.value,
        condition=listing.condition.value,
        fixed_price_minor=listing.fixed_price_minor,
        currency=listing.currency,
        offers_enabled=listing.offers_enabled,
        city=listing.city,
        region=listing.region,
        country_code=listing.country_code,
        postal_code=listing.postal_code,
        published_at=listing.published_at,
        expires_at=listing.expires_at,
        sold_at=listing.sold_at,
        category=CategoryOut.model_validate(listing.category),
        seller=SellerSummary(id=listing.seller_id, display_name=display_name),
        images=[ImageOut.model_validate(img) for img in images],
        auction=AuctionSummary.model_validate(auction) if auction is not None else None,
        created_at=listing.created_at,
        updated_at=listing.updated_at,
    )


def _serialize_many(
    db: Session, listings: list[Listing], with_auctions: bool = False
) -> list[ListingOut]:
    names = _display_names(db, {listing.seller_id for listing in listings})
    auctions: dict[uuid.UUID, Auction] = {}
    if with_auctions:
        auctions = _auction_map(
            db,
            [listing.id for listing in listings if listing.sale_type == ListingSaleType.AUCTION],
        )
    return [
        _serialize_listing(listing, names.get(listing.seller_id), auctions.get(listing.id))
        for listing in listings
    ]


# Seller-safe status transitions. Everything else is system (RESERVED/SOLD/
# EXPIRED), moderation (PENDING_REVIEW/REMOVED), or ADMIN-controlled.
_SELLER_TRANSITIONS: dict[ListingStatus, set[ListingStatus]] = {
    ListingStatus.DRAFT: {ListingStatus.PENDING_REVIEW, ListingStatus.ARCHIVED},
    ListingStatus.REJECTED: {ListingStatus.DRAFT},
    ListingStatus.ACTIVE: {ListingStatus.ARCHIVED},
}


def _apply_seller_status(
    listing: Listing, target: ListingStatus, *, is_admin: bool
) -> None:
    """Enforce the lifecycle map for non-admin owners (422 on violation)."""

    if is_admin:
        listing.status = target
        return
    if target == listing.status:
        return
    allowed = _SELLER_TRANSITIONS.get(listing.status, set())
    if target not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Transition {listing.status.value} -> {target.value} is not allowed for sellers.",
        )
    listing.status = target


def _check_price_rules(
    sale_type: ListingSaleType,
    fixed_price_minor: int | None,
    offers_enabled: bool,
) -> None:
    """Enforce the canonical FIXED_PRICE/AUCTION/offers matrix (422)."""

    if sale_type == ListingSaleType.FIXED_PRICE and fixed_price_minor is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="FIXED_PRICE listings require fixed_price_minor.",
        )
    if sale_type == ListingSaleType.AUCTION and fixed_price_minor is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="AUCTION listings must not set fixed_price_minor.",
        )
    if offers_enabled and sale_type != ListingSaleType.FIXED_PRICE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="offers_enabled=true is only allowed for FIXED_PRICE listings.",
        )


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db_session)) -> list[Category]:
    """Active categories for marketplace browsing, ordered by name."""

    return list(
        db.scalars(
            select(Category)
            .where(Category.status == CategoryStatus.ACTIVE)
            .order_by(Category.name.asc(), Category.id.asc())
        ).all()
    )


@router.get("/listings", response_model=PaginatedListings)
def list_listings(
    category_id: uuid.UUID | None = None,
    sale_type: str | None = None,
    listing_status: str | None = Query(default=None, alias="status"),
    condition: str | None = None,
    seller_id: uuid.UUID | None = None,
    q: str | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_session),
) -> PaginatedListings:
    """Public paginated browsing with filters on real Listing columns only."""

    sale_type_enum = _parse_sale_type(sale_type)
    status_enum = _parse_status(listing_status) or ListingStatus.ACTIVE
    condition_enum = _parse_condition(condition)

    filters = [Listing.status == status_enum]
    if category_id is not None:
        filters.append(Listing.category_id == category_id)
    if sale_type_enum is not None:
        filters.append(Listing.sale_type == sale_type_enum)
    if condition_enum is not None:
        filters.append(Listing.condition == condition_enum)
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
        items=_serialize_many(db, rows), total=total, limit=limit, offset=offset
    )


@router.get("/listings/mine", response_model=PaginatedListings)
def my_listings(
    listing_status: str | None = Query(default=None, alias="status"),
    sale_type: str | None = None,
    limit: int = Query(default=_DEFAULT_LIMIT, ge=1, le=_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> PaginatedListings:
    """Authenticated seller's own listings (all statuses, drafts included)."""

    sale_type_enum = _parse_sale_type(sale_type)
    status_enum = _parse_status(listing_status)

    filters = [Listing.seller_id == user.id]
    if status_enum is not None:
        filters.append(Listing.status == status_enum)
    if sale_type_enum is not None:
        filters.append(Listing.sale_type == sale_type_enum)

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
        items=_serialize_many(db, rows), total=total, limit=limit, offset=offset
    )


@router.get("/listings/{listing_id}", response_model=ListingOut)
def get_listing(
    listing: Listing = Depends(get_listing_or_404),
    user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db_session),
) -> ListingOut:
    """Public listing detail, with auction summary for AUCTION listings.

    Visibility rule: only ACTIVE (and other publicly viewable) listings
    are served. Non-public statuses (DRAFT, PENDING_REVIEW, REJECTED,
    REMOVED, ARCHIVED) are 404 for everyone except the listing's seller
    and ADMIN users, who keep legitimate access through this same route
    while managing their listings.
    """

    if listing.status not in _PUBLIC_LISTING_STATUSES:
        is_owner = user is not None and user.id == listing.seller_id
        is_admin_user = user is not None and is_admin(db, user)
        if not (is_owner or is_admin_user):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
            )
    db.refresh(listing, attribute_names=["category", "images"])
    names = _display_names(db, {listing.seller_id})
    auction = None
    if listing.sale_type == ListingSaleType.AUCTION:
        auction = db.scalars(
            select(Auction).where(Auction.listing_id == listing.id)
        ).first()
    return _serialize_listing(listing, names.get(listing.seller_id), auction)


@router.post("/listings", response_model=ListingOut, status_code=status.HTTP_201_CREATED)
def create_listing(
    payload: ListingCreate,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> ListingOut:
    """Create a DRAFT listing owned by the authenticated user (seller never from client)."""

    sale_type = _parse_sale_type(payload.sale_type)
    assert sale_type is not None
    condition = _parse_condition(payload.condition)
    assert condition is not None
    if payload.currency != "INR":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Currency must be INR.",
        )
    category = db.get(Category, payload.category_id)
    if category is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found."
        )
    _check_price_rules(sale_type, payload.fixed_price_minor, payload.offers_enabled)

    listing = Listing(
        seller_id=user.id,
        category_id=payload.category_id,
        sale_type=sale_type,
        status=ListingStatus.DRAFT,
        condition=condition,
        title=payload.title.strip(),
        description=payload.description,
        fixed_price_minor=payload.fixed_price_minor,
        currency=payload.currency,
        offers_enabled=payload.offers_enabled,
        city=payload.city.strip(),
        region=payload.region,
        country_code=payload.country_code,
        postal_code=payload.postal_code,
        published_at=payload.published_at,
        expires_at=payload.expires_at,
    )
    db.add(listing)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Listing data violates database constraints.",
        ) from error
    db.refresh(listing)
    return _serialize_many(db, [db.get(Listing, listing.id)])[0]


@router.patch("/listings/{listing_id}", response_model=ListingOut)
def update_listing(
    payload: ListingUpdate,
    listing: Listing = Depends(require_listing_owner_or_admin),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> ListingOut:
    """Owner-or-ADMIN edit. Sellers follow the lifecycle map; ADMIN is unrestricted."""

    data = payload.model_dump(exclude_unset=True)
    if payload.category_id is not None and db.get(Category, payload.category_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found."
        )
    if payload.currency is not None and payload.currency != "INR":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Currency must be INR.",
        )
    condition = _parse_condition(data.get("condition")) if "condition" in data else None
    if payload.status is not None:
        target = _parse_status(payload.status)
        assert target is not None
        _apply_seller_status(listing, target, is_admin=is_admin(db, user))

    price = data.get("fixed_price_minor", listing.fixed_price_minor)
    offers = data.get("offers_enabled", listing.offers_enabled)
    if "fixed_price_minor" in data or "offers_enabled" in data:
        _check_price_rules(listing.sale_type, price, offers)

    for field in (
        "category_id",
        "title",
        "description",
        "fixed_price_minor",
        "offers_enabled",
        "city",
        "region",
        "country_code",
        "postal_code",
        "published_at",
        "expires_at",
        "sold_at",
    ):
        if field in data:
            value = data[field]
            if field == "title" and value is not None:
                value = value.strip()
            if field == "city" and value is not None:
                value = value.strip()
            setattr(listing, field, value)
    if condition is not None:
        listing.condition = condition
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Listing data violates database constraints.",
        ) from error
    db.refresh(listing)
    return _serialize_many(db, [listing])[0]


@router.post("/listings/{listing_id}/submit", response_model=ListingOut)
def submit_listing(
    listing_id: uuid.UUID,
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> ListingOut:
    """Owner submits a DRAFT for review.

    Two-step auction workflow: an AUCTION listing must already have its
    auction row (created via POST /auctions) before it is publishable.
    Approval itself stays an admin action.
    """

    listing = db.scalars(
        select(Listing).where(Listing.id == listing_id).with_for_update()
    ).first()
    if listing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )
    if listing.seller_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the listing owner may submit it for review.",
        )
    if listing.status != ListingStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Listing is {listing.status.value}; only DRAFT listings can be submitted.",
        )
    if not listing.title or len(listing.title.strip()) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A title of at least 3 characters is required to submit.",
        )
    if db.get(Category, listing.category_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A valid category is required to submit.",
        )
    if listing.currency != "INR":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Currency must be INR.",
        )
    if not listing.city or not listing.country_code:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="City and country are required to submit.",
        )
    _check_price_rules(listing.sale_type, listing.fixed_price_minor, listing.offers_enabled)
    if listing.sale_type == ListingSaleType.AUCTION:
        auction_exists = db.scalars(
            select(Auction.id).where(Auction.listing_id == listing.id)
        ).first()
        if auction_exists is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="AUCTION listings require auction configuration (POST /auctions) before review.",
            )
    listing.status = ListingStatus.PENDING_REVIEW
    db.commit()
    db.refresh(listing)
    return _serialize_many(db, [listing])[0]


@router.get("/listings/{listing_id}/images", response_model=list[ImageOut])
def list_images(
    listing: Listing = Depends(get_listing_or_404),
    db: Session = Depends(get_db_session),
) -> list[ImageOut]:
    """Images for a listing, ordered by sort_order."""

    rows = db.scalars(
        select(ListingImage)
        .where(ListingImage.listing_id == listing.id)
        .order_by(ListingImage.sort_order.asc(), ListingImage.id.asc())
    ).all()
    return [ImageOut.model_validate(row) for row in rows]


@router.post(
    "/listings/{listing_id}/images",
    response_model=ImageOut,
    status_code=status.HTTP_201_CREATED,
)
def add_image(
    payload: ImageCreate,
    listing: Listing = Depends(require_listing_owner_or_admin),
    db: Session = Depends(get_db_session),
) -> ImageOut:
    """Register a storage_key reference (resolved by the future storage backend)."""

    sort_order = payload.sort_order
    if sort_order is None:
        max_order = db.scalar(
            select(func.max(ListingImage.sort_order)).where(
                ListingImage.listing_id == listing.id
            )
        )
        sort_order = (max_order + 1) if max_order is not None else 0
    if payload.is_primary:
        primary_exists = db.scalars(
            select(ListingImage).where(
                ListingImage.listing_id == listing.id,
                ListingImage.is_primary.is_(True),
            )
        ).first()
        if primary_exists is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Listing already has a primary image.",
            )
    image = ListingImage(
        listing_id=listing.id,
        storage_key=payload.storage_key,
        content_type=payload.content_type,
        byte_size=payload.byte_size,
        width=payload.width,
        height=payload.height,
        alt_text=payload.alt_text,
        sort_order=sort_order,
        is_primary=payload.is_primary,
    )
    db.add(image)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Image conflicts with an existing row (sort order or primary).",
        ) from error
    db.refresh(image)
    return ImageOut.model_validate(image)


@router.patch("/listings/{listing_id}/images/{image_id}", response_model=ImageOut)
def update_image(
    payload: ImageUpdate,
    image_id: uuid.UUID,
    listing: Listing = Depends(require_listing_owner_or_admin),
    db: Session = Depends(get_db_session),
) -> ImageOut:
    """Owner-or-ADMIN image edit: sort_order, alt_text, is_primary.

    Occupied sort orders are rejected (409) rather than swapped, so no
    intermediate state ever violates uniqueness. Setting a new primary
    demotes the previous one in the same transaction.
    """

    image = db.scalars(
        select(ListingImage).where(
            ListingImage.id == image_id, ListingImage.listing_id == listing.id
        )
    ).first()
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found."
        )
    data = payload.model_dump(exclude_unset=True)
    if "sort_order" in data and data["sort_order"] is not None:
        if data["sort_order"] != image.sort_order:
            clash = db.scalars(
                select(ListingImage).where(
                    ListingImage.listing_id == listing.id,
                    ListingImage.sort_order == data["sort_order"],
                    ListingImage.id != image.id,
                )
            ).first()
            if clash is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Another image already uses this sort order.",
                )
            image.sort_order = data["sort_order"]
    if "alt_text" in data:
        image.alt_text = data["alt_text"]
    if data.get("is_primary") is True and not image.is_primary:
        db.execute(
            ListingImage.__table__.update()
            .where(
                ListingImage.listing_id == listing.id,
                ListingImage.is_primary.is_(True),
            )
            .values(is_primary=False)
        )
        image.is_primary = True
    elif "is_primary" in data and data["is_primary"] is False:
        image.is_primary = False
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Image conflicts with an existing row.",
        ) from error
    db.refresh(image)
    return ImageOut.model_validate(image)


@router.delete("/listings/{listing_id}/images/{image_id}")
def remove_image(
    image_id: uuid.UUID,
    listing: Listing = Depends(require_listing_owner_or_admin),
    db: Session = Depends(get_db_session),
) -> dict[str, str]:
    """Hard-delete an image row (canonical images carry no status field)."""

    image = db.scalars(
        select(ListingImage).where(
            ListingImage.id == image_id, ListingImage.listing_id == listing.id
        )
    ).first()
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found."
        )
    db.delete(image)
    db.commit()
    return {"status": "deleted"}


@router.post(
    "/listings/{listing_id}/favorite",
    response_model=FavoriteOut,
    status_code=status.HTTP_201_CREATED,
)
def favorite_listing(
    listing: Listing = Depends(get_listing_or_404),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> FavoriteOut:
    """Favorite a publicly viewable listing; the composite key yields 409 on duplicates."""

    if listing.status not in _PUBLIC_LISTING_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found."
        )

    favorite = Favorite(user_id=user.id, listing_id=listing.id)
    db.add(favorite)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Listing is already favorited.",
        ) from error
    db.refresh(favorite)
    return _favorite_out(db, favorite)


@router.delete("/listings/{listing_id}/favorite")
def unfavorite_listing(
    listing: Listing = Depends(get_listing_or_404),
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> dict[str, str]:
    """Remove a favorite row entirely (canonical favorites carry no status)."""

    existing = db.scalars(
        select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.listing_id == listing.id,
        )
    ).first()
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Favorite not found."
        )
    db.delete(existing)
    db.commit()
    return {"status": "unfavorited"}


@router.get("/favorites", response_model=list[FavoriteOut])
def list_favorites(
    user: User = Depends(require_active_user),
    db: Session = Depends(get_db_session),
) -> list[FavoriteOut]:
    """The authenticated user's favorites with listing summaries."""

    rows = list(
        db.scalars(
            select(Favorite)
            .where(Favorite.user_id == user.id)
            .options(
                selectinload(Favorite.listing).selectinload(Listing.category),
                selectinload(Favorite.listing).selectinload(Listing.images),
            )
            .order_by(Favorite.created_at.desc(), Favorite.listing_id.asc())
        ).all()
    )
    listings = [row.listing for row in rows]
    serialized = {item.id: item for item in _serialize_many(db, listings)}
    return [
        FavoriteOut(
            user_id=row.user_id,
            listing_id=row.listing_id,
            created_at=row.created_at,
            listing=serialized[row.listing.id],
        )
        for row in rows
    ]


def _favorite_out(db: Session, favorite: Favorite) -> FavoriteOut:
    listing = db.scalars(
        select(Listing)
        .where(Listing.id == favorite.listing_id)
        .options(selectinload(Listing.category), selectinload(Listing.images))
    ).first()
    assert listing is not None
    serialized = _serialize_many(db, [listing])[0]
    return FavoriteOut(
        user_id=favorite.user_id,
        listing_id=favorite.listing_id,
        created_at=favorite.created_at,
        listing=serialized,
    )
