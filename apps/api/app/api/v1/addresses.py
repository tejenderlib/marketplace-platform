"""Saved-address endpoints: users manage only their own address book."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.identity.dependencies import require_authenticated_user
from app.identity.models import User
from app.orders.models import AddressStatus, UserAddress
from app.orders.schemas import AddressCreate, AddressOut, AddressUpdate

router = APIRouter(prefix="/addresses", tags=["addresses"])


def _get_own_address(address_id: uuid.UUID, user: User, db: Session) -> UserAddress:
    """Fetch an ACTIVE address owned by the caller (404 otherwise, no oracle)."""

    address = db.scalars(
        select(UserAddress).where(
            UserAddress.id == address_id,
            UserAddress.user_id == user.id,
            UserAddress.status == AddressStatus.ACTIVE,
        )
    ).first()
    if address is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Address not found."
        )
    return address


def _validate_india(country: str | None) -> None:
    if country is not None and country != "IN":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only Indian addresses (country IN) are supported.",
        )


@router.post("", response_model=AddressOut, status_code=status.HTTP_201_CREATED)
def create_address(
    payload: AddressCreate,
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> AddressOut:
    """Save an address; first address (or explicit flag) becomes the default."""

    _validate_india(payload.country)
    existing_count = db.scalar(
        select(UserAddress.id).where(
            UserAddress.user_id == user.id, UserAddress.status == AddressStatus.ACTIVE
        ).limit(1)
    )
    make_default = payload.is_default or existing_count is None
    if make_default:
        db.execute(
            UserAddress.__table__.update()
            .where(UserAddress.user_id == user.id)
            .values(is_default=False)
        )
    address = UserAddress(
        user_id=user.id,
        label=payload.label,
        recipient_name=payload.recipient_name.strip(),
        line1=payload.line1.strip(),
        line2=payload.line2,
        city=payload.city.strip(),
        region=payload.region,
        postal_code=payload.postal_code,
        country=payload.country,
        phone=payload.phone,
        is_default=make_default,
    )
    db.add(address)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Address data violates database constraints.",
        ) from error
    db.refresh(address)
    return AddressOut.model_validate(address)


@router.get("", response_model=list[AddressOut])
def list_addresses(
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> list[AddressOut]:
    """The caller's ACTIVE saved addresses, defaults first."""

    rows = list(
        db.scalars(
            select(UserAddress)
            .where(
                UserAddress.user_id == user.id,
                UserAddress.status == AddressStatus.ACTIVE,
            )
            .order_by(UserAddress.is_default.desc(), UserAddress.created_at.desc())
        ).all()
    )
    return [AddressOut.model_validate(row) for row in rows]


@router.patch("/{address_id}", response_model=AddressOut)
def update_address(
    address_id: uuid.UUID,
    payload: AddressUpdate,
    user: User = Depends(require_authenticated_user),
    db: Session = Depends(get_db_session),
) -> AddressOut:
    """Update own address; preserves the single-default rule."""

    address = _get_own_address(address_id, user, db)
    data = payload.model_dump(exclude_unset=True)
    if "country" in data:
        _validate_india(data["country"])
    if data.get("is_default") is True:
        db.execute(
            UserAddress.__table__.update()
            .where(UserAddress.user_id == user.id, UserAddress.id != address.id)
            .values(is_default=False)
        )
        address.is_default = True
    for field in (
        "label", "recipient_name", "line1", "line2", "city", "region",
        "postal_code", "country", "phone",
    ):
        if field in data and field != "is_default":
            value = data[field]
            if isinstance(value, str) and field in ("recipient_name", "line1", "city"):
                value = value.strip()
            setattr(address, field, value)
    if "is_default" in data and data["is_default"] is False:
        address.is_default = False
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Address data violates database constraints.",
        ) from error
    db.refresh(address)
    return AddressOut.model_validate(address)
