"""Development-only admin provisioning: python -m app.scripts.create_admin.

Interactively creates (or upgrades) a local admin account using the
existing identity models, bcrypt hashing, and ADMIN role. Prompts hide
password input and nothing secret is printed or logged.
"""

from __future__ import annotations

import getpass
import re
import sys

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _prompt_email() -> str:
    from app.identity.security import normalize_email

    raw = input("Admin email: ")
    email = normalize_email(raw)
    if not 3 <= len(email) <= 320 or _EMAIL_RE.match(email) is None:
        print("error: enter a valid email address.", file=sys.stderr)
        raise SystemExit(2)
    return email


def _prompt_new_password() -> str:
    from app.identity.security import validate_password_strength

    first = getpass.getpass("Admin password: ")
    second = getpass.getpass("Confirm password: ")
    if first != second:
        print("error: passwords do not match.", file=sys.stderr)
        raise SystemExit(2)
    try:
        validate_password_strength(first)
    except ValueError as error:
        print(f"warning: weak password ({error})", file=sys.stderr)
        print(
            "Development-only: a weak local password is permitted, "
            "never use it outside local development.",
            file=sys.stderr,
        )
        if not _confirm("Use this weak password anyway?"):
            raise SystemExit(2)
    return first


def _confirm(question: str) -> bool:
    answer = input(f"{question} [y/N]: ").strip().lower()
    return answer in ("y", "yes")


def _role_names(db, user_id) -> list[str]:
    from sqlalchemy import select

    from app.identity.models import Role, UserRole

    return sorted(
        db.scalars(
            select(Role.name).join(UserRole, UserRole.role_id == Role.id).where(
                UserRole.user_id == user_id
            )
        ).all(),
        key=lambda name: name.value,
    )


def main() -> int:
    from sqlalchemy import select

    from app.db.session import SessionLocal
    from app.identity.models import Role, RoleName, User, UserRole, UserStatus
    from app.identity.security import hash_password

    print("Local development admin provisioning (NOT for production).")
    email = _prompt_email()

    db = SessionLocal()
    try:
        user = db.scalars(select(User).where(User.email == email)).first()
        password_set = False
        if user is None:
            password = _prompt_new_password()
            user = User(
                email=email,
                password_hash=hash_password(password),
                status=UserStatus.ACTIVE,
            )
            password_set = True
            db.add(user)
            db.flush()
            admin_role = db.scalars(
                select(Role).where(Role.name == RoleName.ADMIN)
            ).first()
            if admin_role is None:
                print("error: ADMIN role is not seeded.", file=sys.stderr)
                db.rollback()
                return 1
            db.add(UserRole(user_id=user.id, role_id=admin_role.id))
            db.commit()
            print("Admin provisioning succeeded.")
        else:
            roles = [name.value for name in _role_names(db, user.id)]
            print(f"User already exists: {user.email}")
            print(f"  id: {user.id}")
            print(f"  status: {user.status.value}")
            print(f"  roles: {', '.join(roles) if roles else '(none)'}")
            changed = False
            if user.status not in (UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION):
                # Never leave a SUSPENDED/DELETED admin behind: login must work.
                if _confirm(
                    f"Account is {user.status.value}; reactivate to ACTIVE for login?"
                ):
                    user.status = UserStatus.ACTIVE
                    changed = True
                else:
                    db.rollback()
                    print("No changes made.")
                    return 0
            if RoleName.ADMIN.value not in roles:
                if _confirm("Grant the ADMIN role (existing roles are kept)?"):
                    admin_role = db.scalars(
                        select(Role).where(Role.name == RoleName.ADMIN)
                    ).first()
                    if admin_role is None:
                        print("error: ADMIN role is not seeded.", file=sys.stderr)
                        db.rollback()
                        return 1
                    db.add(UserRole(user_id=user.id, role_id=admin_role.id))
                    changed = True
            if _confirm("Reset this account's password?"):
                password = _prompt_new_password()
                user.password_hash = hash_password(password)
                password_set = True
                changed = True
            if changed:
                db.commit()
                print("Admin provisioning succeeded.")
            else:
                db.rollback()
                print("No changes made.")
        db.refresh(user)
        roles = [name.value for name in _role_names(db, user.id)]
        print(f"  email: {user.email}")
        print(f"  user ID: {user.id}")
        print(f"  status: {user.status.value}")
        print(f"  roles: {', '.join(roles) if roles else '(none)'}")
        if password_set:
            print("  password was set.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
