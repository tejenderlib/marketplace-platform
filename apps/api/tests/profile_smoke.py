"""Profile self-service smoke tests (stdlib only). Run inside the api container:

    docker compose run --rm -e PYTHONPATH=/app api python tests/profile_smoke.py

Covers PATCH /users/me/profile: owner edit, persistence via /me,
validation, auth gating, and that no cross-user targeting exists.
Cleans up all rows created.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = "http://api:8000/api/v1"
FAILURES: list[str] = []


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


def check(label, condition, detail=""):
    print(("PASS " if condition else "FAIL ") + label, detail if not condition else "")
    if not condition:
        FAILURES.append(label)


def main():
    tag = uuid.uuid4().hex[:8]
    email = f"prof-{tag}@example.com"
    status, _ = call("POST", "/auth/register", {"email": email, "password": "Prof12345"})
    assert status == 201, (status,)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Prof12345"})
    assert status == 200, (status, login)
    tok = login["access_token"]

    # 1. edit own profile (writable fields: display_name + avatar_key only)
    status, updated = call("PATCH", "/users/me/profile",
                           {"display_name": "Prof Tester", "avatar_key": "avatar-1",
                            "first_name": "Prof", "bio": "Marketplace regular."},
                           token=tok)
    check("update 200", status == 200 and updated["profile"]["display_name"] == "Prof Tester"
          and updated["profile"]["avatar_url"] == "avatar-1"
          and updated["profile"]["first_name"] is None
          and updated["profile"]["bio"] is None
          and "password_hash" not in json.dumps(updated), (status, updated))

    # 2. persists and surfaces via /me
    status, me = call("GET", "/auth/me", token=tok)
    check("visible in /me", status == 200 and me["profile"]["display_name"] == "Prof Tester", (status, me))

    # 3. validation
    status, _ = call("PATCH", "/users/me/profile", {"display_name": "x"}, token=tok)
    check("short display 422", status == 422, status)
    status, _ = call("PATCH", "/users/me/profile", {"display_name": "y" * 121}, token=tok)
    check("long display_name 422", status == 422, status)

    # 4. null clears a nullable field
    status, cleared = call("PATCH", "/users/me/profile", {"display_name": None}, token=tok)
    check("null clears display_name", status == 200 and cleared["profile"]["display_name"] is None, (status, cleared))

    # 5. auth gating + no cross-user targeting surface
    status, _ = call("PATCH", "/users/me/profile", {"display_name": "Anon"})
    check("unauth 401", status == 401, status)
    for method, path in [("GET", "/users/me/profile"), ("PUT", "/users/me/profile"),
                         ("GET", "/users/someone-else/profile")]:
        status, _ = call(method, path, {"display_name": "Hacker"} if method == "PUT" else None,
                         token=tok)
        check(f"{method} {path} not routable (404/405)", status in (404, 405), (method, path, status))

    # 6. unknown keys ignored, not stored
    status, body = call("PATCH", "/users/me/profile",
                        {"display_name": "Prof Tester", "is_admin": True, "roles": ["ADMIN"]},
                        token=tok)
    check("unknown keys ignored", status == 200 and body["profile"]["display_name"] == "Prof Tester", (status, body))

    _cleanup([email])
    print("FAILURES:", FAILURES if FAILURES else "none")
    return 1 if FAILURES else 0


def _cleanup(emails):
    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        for email in emails:
            uid = db.execute(text("SELECT id FROM users WHERE email = :e"), {"e": email}).scalar()
            if uid is None:
                continue
            db.execute(text("DELETE FROM auth_refresh_tokens WHERE user_id = :u"), {"u": uid})
            db.execute(text("DELETE FROM user_roles WHERE user_id = :u"), {"u": uid})
            db.execute(text("DELETE FROM user_profiles WHERE user_id = :u"), {"u": uid})
            db.execute(text("DELETE FROM users WHERE id = :u"), {"u": uid})
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
