"""Shared setup helpers for backend smoke suites (stdlib only).

Sellers can no longer PATCH listings straight to ACTIVE; activation goes
through the canonical submit (seller) + approve (admin) workflow.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
import uuid

BASE = "http://api:8000/api/v1"


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as error:
        payload = error.read().decode() or "{}"
        try:
            return error.code, json.loads(payload)
        except json.JSONDecodeError:
            return error.code, {"raw": payload}


def ensure_admin(tag, prefix="adm"):
    """Register a user, grant ADMIN via role rows, log in. Returns (id, token)."""

    from sqlalchemy import text
    from app.db.session import SessionLocal

    email = f"{prefix}-{tag}@example.com"
    status, body = call("POST", "/auth/register", {"email": email, "password": "Admin1234"})
    assert status in (200, 201), (status, email)
    # Phase 8: marketplace/admin actions require a verified (ACTIVE) account.
    status, _ = call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    assert status == 200, (status, email)
    db = SessionLocal()
    try:
        role = db.execute(text("SELECT id FROM roles WHERE name = 'ADMIN'")).scalar()
        uid = db.execute(text("SELECT id FROM users WHERE email = :e"), {"e": email}).scalar()
        exists = db.execute(
            text("SELECT 1 FROM user_roles WHERE user_id = :u AND role_id = :r"),
            {"u": uid, "r": role},
        ).first()
        if not exists:
            db.execute(
                text("INSERT INTO user_roles (id, user_id, role_id) VALUES (:i, :u, :r)"),
                {"i": uuid.uuid4(), "u": uid, "r": role},
            )
            db.commit()
        else:
            db.rollback()
    finally:
        db.close()
    from app.identity.security import hash_password

    db2 = SessionLocal()
    try:
        db2.execute(
            text("UPDATE users SET password_hash = :h WHERE email = :e"),
            {"h": hash_password("Admin1234"), "e": email},
        )
        db2.commit()
    finally:
        db2.close()
    status, login = call("POST", "/auth/login", {"email": email, "password": "Admin1234"})
    assert status == 200, (status, login)
    return login, login["access_token"]


def activate_listing(seller_tok, admin_tok, listing_id):
    """Canonical publish: seller submits DRAFT, admin approves to ACTIVE."""

    status, _ = call("POST", f"/catalog/listings/{listing_id}/submit", token=seller_tok)
    assert status == 200, ("submit", status, listing_id)
    status, body = call(
        "POST", f"/admin/listings/{listing_id}/approve",
        {"reason": "smoke test approval"}, token=admin_tok,
    )
    assert status == 200, ("approve", status, listing_id)
    return body
