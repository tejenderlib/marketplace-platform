"""Auth API smoke tests (stdlib only). Run inside the api container:

    docker compose run --rm api python tests/auth_smoke.py

Covers: register, duplicate, login, wrong password, /me valid/invalid,
refresh, revoked/expired refresh, logout revocation, suspended/deleted
rejection, ADMIN self-select impossibility. Cleans up all rows created.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

BASE = "http://api:8000/api/v1"
FAILURES: list[str] = []


def call(method: str, path: str, body: dict | None = None, token: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request) as response:
            payload = response.read().decode() or "{}"
            return response.status, json.loads(payload)
    except urllib.error.HTTPError as error:
        payload = error.read().decode() or "{}"
        try:
            return error.code, json.loads(payload)
        except json.JSONDecodeError:
            return error.code, {"raw": payload}


def check(label: str, condition: bool, detail: object = "") -> None:
    print(("PASS " if condition else "FAIL ") + label, detail if not condition else "")
    if not condition:
        FAILURES.append(label)


def main() -> int:
    tag = uuid.uuid4().hex[:8]
    email = f"smoke-{tag}@example.com"
    password = "Smoke1234"

    # 1. successful registration
    status, reg = call(
        "POST",
        "/auth/register",
        {"email": email, "password": password, "display_name": "Smoke User"},
    )
    check("register 201", status == 201, (status, reg))
    check("register roles == [BUYER]", reg.get("roles") == ["BUYER"], reg)
    check("register status canonical", reg.get("status") == "PENDING_VERIFICATION", reg)
    check("register hides password_hash", "password_hash" not in json.dumps(reg), reg)
    check("register profile", (reg.get("profile") or {}).get("display_name") == "Smoke User", reg)

    # 2. duplicate registration rejected (case-insensitive)
    status, dup = call(
        "POST", "/auth/register", {"email": "  " + email.upper() + " ", "password": password}
    )
    check("duplicate 409", status == 409, (status, dup))

    # 3. successful login
    status, login = call("POST", "/auth/login", {"email": email, "password": password})
    check("login 200", status == 200, (status, login))
    access, refresh = login.get("access_token"), login.get("refresh_token")
    check("login tokens present", bool(access) and bool(refresh), login.keys())
    check("login token_type bearer", login.get("token_type") == "bearer", login)

    # 4. wrong password rejected (generic 401)
    status, bad = call("POST", "/auth/login", {"email": email, "password": "Wrong9999"})
    check("wrong password 401", status == 401, (status, bad))
    status, unknown = call(
        "POST", "/auth/login", {"email": f"nope-{tag}@example.com", "password": password}
    )
    check("unknown email same 401", status == 401, (status, unknown))
    check(
        "no enumeration",
        bad.get("detail") == unknown.get("detail"),
        (bad, unknown),
    )

    # 5/6. /me valid + without token
    status, me = call("GET", "/auth/me", token=access)
    check("/me 200", status == 200, (status, me))
    check("/me email + roles", me.get("email") == email and me.get("roles") == ["BUYER"], me)
    check("/me hides password_hash", "password_hash" not in json.dumps(me), me)
    status, _ = call("GET", "/auth/me")
    check("/me no token rejected", status in (401, 403), status)
    status, _ = call("GET", "/auth/me", token="bogus.token.here")
    check("/me bad token 401", status == 401, status)

    # 7. refresh works
    status, ref = call("POST", "/auth/refresh", {"refresh_token": refresh})
    check("refresh 200", status == 200, (status, ref))
    check("refresh new access", bool(ref.get("access_token")), ref)
    status, me2 = call("GET", "/auth/me", token=ref.get("access_token"))
    check("refreshed access works", status == 200, status)

    # 9. logout revokes refresh token
    status, out = call("POST", "/auth/logout", {"refresh_token": refresh}, token=access)
    check("logout 200", status == 200, (status, out))

    # 8. revoked refresh rejected
    status, _ = call("POST", "/auth/refresh", {"refresh_token": refresh})
    check("revoked refresh 401", status == 401, status)

    # 8b. expired refresh rejected (craft an expired row via re-login + backdate)
    status, login2 = call("POST", "/auth/login", {"email": email, "password": password})
    refresh2 = login2.get("refresh_token")
    _backdate_refresh_token(refresh2)
    status, _ = call("POST", "/auth/refresh", {"refresh_token": refresh2})
    check("expired refresh 401", status == 401, status)

    # 10. suspended/deleted users cannot authenticate
    _set_user_status(email, "SUSPENDED")
    status, _ = call("POST", "/auth/login", {"email": email, "password": password})
    check("suspended login 403", status == 403, status)
    status, _ = call("GET", "/auth/me", token=access)
    check("/me suspended 403", status == 403, status)
    _set_user_status(email, "DELETED")
    status, _ = call("POST", "/auth/login", {"email": email, "password": password})
    check("deleted login 403", status == 403, status)

    # 11. ADMIN cannot be self-selected (extra field is ignored)
    admin_email = f"admin-{tag}@example.com"
    status, admin_reg = call(
        "POST",
        "/auth/register",
        {"email": admin_email, "password": password, "role": "ADMIN", "roles": ["ADMIN"]},
    )
    check("role field ignored 201", status == 201, (status, admin_reg))
    check("new user is BUYER only", admin_reg.get("roles") == ["BUYER"], admin_reg)

    _cleanup([email, admin_email])
    print("FAILURES:", FAILURES if FAILURES else "none")
    return 1 if FAILURES else 0


def _db():
    from sqlalchemy import text  # local import: script also runs without app context
    from app.db.session import SessionLocal

    return SessionLocal(), text


def _set_user_status(email: str, status_value: str) -> None:
    session, text = _db()
    try:
        session.execute(
            text("UPDATE users SET status = :s WHERE email = :e"),
            {"s": status_value, "e": email},
        )
        session.commit()
    finally:
        session.close()


def _backdate_refresh_token(raw_token: str) -> None:
    import hashlib

    session, text = _db()
    try:
        session.execute(
            text(
                "UPDATE auth_refresh_tokens SET expires_at = :past "
                "WHERE token_hash = :h"
            ),
            {
                "past": datetime.now(timezone.utc) - timedelta(days=1),
                "h": hashlib.sha256(raw_token.encode()).hexdigest(),
            },
        )
        session.commit()
    finally:
        session.close()


def _cleanup(emails: list[str]) -> None:
    session, text = _db()
    try:
        for email in emails:
            user_id = session.execute(
                text("SELECT id FROM users WHERE email = :e"), {"e": email}
            ).scalar()
            if user_id is None:
                continue
            session.execute(
                text("DELETE FROM auth_refresh_tokens WHERE user_id = :u"), {"u": user_id}
            )
            session.execute(
                text("DELETE FROM user_roles WHERE user_id = :u"), {"u": user_id}
            )
            session.execute(
                text("DELETE FROM user_profiles WHERE user_id = :u"), {"u": user_id}
            )
            session.execute(text("DELETE FROM users WHERE id = :u"), {"u": user_id})
        session.commit()
    finally:
        session.close()


if __name__ == "__main__":
    sys.exit(main())
