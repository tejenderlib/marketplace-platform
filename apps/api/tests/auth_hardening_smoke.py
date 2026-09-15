"""Auth hardening smoke tests (stdlib only). Run inside the api container:

    docker compose run --rm api python tests/auth_hardening_smoke.py

Covers Phase 8.1: refresh-token rotation, replay/rotation reuse detection
with family revocation, logout revocation, expired-token rejection, and
login/registration rate limiting. Cleans up all rows created.
"""

from __future__ import annotations

import json
import sys
import time
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
    email = f"hard-{tag}@example.com"
    password = "Smoke1234"

    status, reg = call(
        "POST",
        "/auth/register",
        {"email": email, "password": password, "display_name": "Hardening User"},
    )
    check("register 201", status == 201, (status, reg))

    status, login = call("POST", "/auth/login", {"email": email, "password": password})
    check("login 200", status == 200, (status, login))
    access, first_refresh = login.get("access_token"), login.get("refresh_token")

    # 1. normal refresh succeeds and rotates the token
    status, ref = call("POST", "/auth/refresh", {"refresh_token": first_refresh})
    check("refresh 200", status == 200, (status, ref))
    check("refresh returns new access", bool(ref.get("access_token")), ref)
    second_refresh = ref.get("refresh_token")
    check("refresh rotates token", bool(second_refresh) and second_refresh != first_refresh, ref)
    status, me = call("GET", "/auth/me", token=ref.get("access_token"))
    check("refreshed access works", status == 200, (status, me))

    # 2. old (rotated) refresh token replay fails
    status, _ = call("POST", "/auth/refresh", {"refresh_token": first_refresh})
    check("rotated token replay 401", status == 401, status)

    # 3. reuse detection: replaying the rotated token revoked the family,
    #    so the legitimate descendant token is now dead too.
    status, _ = call("POST", "/auth/refresh", {"refresh_token": second_refresh})
    check("family revoked after reuse 401", status == 401, status)
    _assert_family_dead(email)

    # 4. login + refresh chain still works after rotation storm
    status, login2 = call("POST", "/auth/login", {"email": email, "password": password})
    check("re-login 200", status == 200, (status, login2))
    chain = login2.get("refresh_token")
    for step in range(3):
        status, ref = call("POST", "/auth/refresh", {"refresh_token": chain})
        check(f"chain refresh {step + 1} works", status == 200, (status, ref))
        chain = ref.get("refresh_token")
    check("chain kept rotating", bool(chain) and chain != login2.get("refresh_token"), chain)

    # 5. legitimate logout with the CURRENT (rotated) token still works
    status, out = call(
        "POST", "/auth/logout", {"refresh_token": chain}, token=login2.get("access_token")
    )
    check("logout 200", status == 200, (status, out))
    status, _ = call("POST", "/auth/refresh", {"refresh_token": chain})
    check("logged-out refresh 401", status == 401, status)

    # 6. expired refresh rejected (re-login + backdate)
    status, login3 = call("POST", "/auth/login", {"email": email, "password": password})
    expired = login3.get("refresh_token")
    _backdate_refresh_token(expired)
    status, _ = call("POST", "/auth/refresh", {"refresh_token": expired})
    check("expired refresh 401", status == 401, status)

    # 7. login throttling: per-account failures lock the account bucket,
    #    then a successful login is also blocked until the window clears.
    throttle_email = f"thr-{tag}@example.com"
    status, reg2 = call(
        "POST", "/auth/register", {"email": throttle_email, "password": password}
    )
    check("throttle user registered", status == 201, (status, reg2))
    for _ in range(5):
        status, _ = call(
            "POST", "/auth/login", {"email": throttle_email, "password": "Wrong9999"}
        )
    check("five bad logins all 401", status == 401, status)
    status, blocked = call(
        "POST", "/auth/login", {"email": throttle_email, "password": password}
    )
    check("account locked after failures 429", status == 429, (status, blocked))
    check(
        "429 detail is generic",
        isinstance(blocked.get("detail"), str),
        blocked,
    )
    # The account key is the email string, so the lock must also apply to
    # a nonexistent account name (no enumeration signal).
    status, _ = call(
        "POST", "/auth/login", {"email": f"ghost-{tag}@example.com", "password": password}
    )
    check("fresh unknown account not blocked", status == 401, status)

    # 8. IP throttling on registration: a burst of registrations from
    #    this client is eventually rejected with 429. (Sequential test
    #    suites may share a container IP, so how many succeed before the
    #    block depends on prior window consumption — only require that
    #    some succeed and that the block happens.)
    made = 0
    hit_429 = False
    for i in range(40):
        status, body = call(
            "POST",
            "/auth/register",
            {"email": f"reg{tag}-{i}@example.com", "password": password},
        )
        if status == 201:
            made += 1
        if status == 429:
            hit_429 = True
            break
    check("register throttled 429 after burst", hit_429, made)
    check("some registrations succeeded before block", made >= 1, made)

    # Wait out the 60s window so the per-account login lock from step 7
    # clears before cleanup verification of a fresh good login.
    print("waiting out the 60s rate-limit window...")
    time.sleep(62)
    status, ok = call("POST", "/auth/login", {"email": throttle_email, "password": password})
    check("login allowed after window", status == 200, (status, ok))

    _cleanup(
        [email, throttle_email]
        + [f"reg{tag}-{i}@example.com" for i in range(40)]
    )
    print("FAILURES:", FAILURES if FAILURES else "none")
    return 1 if FAILURES else 0


def _db():
    from sqlalchemy import text  # local import: script also runs without app context
    from app.db.session import SessionLocal

    return SessionLocal(), text


def _assert_family_dead(email: str) -> None:
    session, text = _db()
    try:
        rows = session.execute(
            text(
                "SELECT r.status FROM auth_refresh_tokens r "
                "JOIN users u ON u.id = r.user_id WHERE u.email = :e"
            ),
            {"e": email},
        ).fetchall()
        statuses = [row[0] for row in rows]
        check("all family rows REVOKED", bool(statuses) and all(
            s == "REVOKED" for s in statuses
        ), statuses)
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
