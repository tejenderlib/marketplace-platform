"""Listing image upload/serving smoke tests (stdlib only). Run inside api container:

    docker compose exec -e PYTHONPATH=/app api python tests/sell_images_smoke.py

Covers Phase 2 real image bytes: owner upload (raw body, magic-sniffed
type, Pillow dimensions, server-generated opaque key), auth/ownership
(401/403), invalid MIME / oversized / undecodable bytes (422), public
serving, private visibility (owner 200, stranger 404 — same convention
as listing detail), wrong listing/image pairing (404), missing-file
safety, delete cleanup (row + file), and metadata CRUD regression
(primary/reorder). Cleans up all rows and files created.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = "http://api:8000/api/v1"
FAILURES: list[str] = []

# Smallest valid 1x1 PNG and 1x1 GIF (generated via Pillow).
PNG_1X1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000"
    "907753de0000000c49444154789c63f8cfc0000003010100c9fe92ef"
    "0000000049454e44ae426082"
)
GIF_1X1 = bytes.fromhex(
    "47494638376101000100810000ff00000000000000000000002c00000000"
    "0100010000080400010404003b"
)


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


def call_bytes(method, path, data, content_type, token=None):
    request = urllib.request.Request(
        BASE + path, data=data, method=method, headers={"Content-Type": content_type}
    )
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            headers = {k.lower(): v for k, v in dict(response.headers).items()}
            ctype = headers.get("content-type") or ""
            if ctype.startswith("application/json"):
                try:
                    return response.status, json.loads(raw.decode() or "{}"), headers
                except json.JSONDecodeError:
                    return response.status, {"raw": raw.decode("utf-8", "replace")}, headers
            return response.status, {"_bytes": raw}, headers
    except urllib.error.HTTPError as error:
        payload = error.read().decode() or "{}"
        try:
            return error.code, json.loads(payload), {}
        except json.JSONDecodeError:
            return error.code, {"raw": payload}, {}


def check(label, condition, detail=""):
    print(("PASS " if condition else "FAIL ") + label, detail if not condition else "")
    if not condition:
        FAILURES.append(label)


def register(email, password="Seller1234"):
    status, body = call("POST", "/auth/register", {"email": email, "password": password})
    assert status == 201, (status, body)
    call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    status, login = call("POST", "/auth/login", {"email": email, "password": password})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


def register_pending(email):
    status, body = call("POST", "/auth/register", {"email": email, "password": "Seller1234"})
    assert status == 201, (status, body)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Seller1234"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"img-seller-{tag}@example.com")
    buyer_id, buyer_tok = register(f"img-buyer-{tag}@example.com")
    _, pending_tok = register_pending(f"img-pending-{tag}@example.com")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'Photo', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"photo-{tag}"},
    )
    db.commit()
    db.close()

    fixed = {
        "category_id": str(cat), "sale_type": "FIXED_PRICE", "title": f"Camera {tag}",
        "description": "With photos.", "condition": "GOOD",
        "fixed_price_minor": 50000, "currency": "INR", "offers_enabled": False,
        "city": "Delhi", "country_code": "IN",
    }
    status, created = call("POST", "/catalog/listings", fixed, token=seller_tok)
    assert status == 201, (status, created)
    lid = created["id"]
    up = f"/catalog/listings/{lid}/images/upload"

    # 1. owner upload succeeds: sniffed type, dims, opaque key, primary-first
    status, img1, _ = call_bytes("POST", up, PNG_1X1, "image/png", token=seller_tok)
    check("owner upload 201", status == 201, (status, img1))
    check("upload shape", img1.get("content_type") == "image/png"
          and img1.get("byte_size") == len(PNG_1X1)
          and img1.get("width") == 1 and img1.get("height") == 1
          and img1.get("is_primary") is True and img1.get("sort_order") == 0, img1)
    key1 = img1.get("storage_key", "")
    check("opaque server key", "/" not in key1 and ".." not in key1
          and key1.endswith(".png") and len(key1) < 60, key1)
    img1_id = img1["id"]

    # claimed MIME is ignored: GIF bytes with jpeg content-type header
    status, img2, _ = call_bytes("POST", up, GIF_1X1, "image/jpeg", token=seller_tok)
    check("sniff beats header", status == 201 and img2.get("content_type") == "image/gif"
          and img2.get("is_primary") is False, (status, img2))
    img2_id = img2["id"]

    # 2. auth/ownership
    status, _, _ = call_bytes("POST", up, PNG_1X1, "image/png", token=None)
    check("unauth upload 401", status == 401, status)
    status, _, _ = call_bytes("POST", up, PNG_1X1, "image/png", token=pending_tok)
    check("pending upload 403", status == 403, status)
    status, _, _ = call_bytes("POST", up, PNG_1X1, "image/png", token=buyer_tok)
    check("non-owner upload 403", status == 403, status)

    # 3. validation
    status, _, _ = call_bytes("POST", up, b"hello, not an image", "text/plain", token=seller_tok)
    check("invalid MIME 422", status == 422, status)
    status, _, _ = call_bytes("POST", up, PNG_1X1[:20], "image/png", token=seller_tok)
    check("truncated bytes 422", status == 422, status)
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (10 * 1024 * 1024 + 1)
    status, _, _ = call_bytes("POST", up, big, "image/png", token=seller_tok)
    check("oversized 422", status == 422, status)

    # 4. visibility: DRAFT images hidden from strangers, visible to owner
    status, _ = call("GET", f"/catalog/listings/{lid}/images", token=buyer_tok)
    check("stranger DRAFT list 404", status == 404, status)
    status, rows = call("GET", f"/catalog/listings/{lid}/images", token=seller_tok)
    check("owner DRAFT list 200", status == 200 and len(rows) == 2, (status, rows))
    status, _, _ = call_bytes("GET", f"/catalog/listings/{lid}/images/{img1_id}/content", b"", "x", token=buyer_tok)
    check("stranger DRAFT content 404", status == 404, status)
    status, payload, headers = call_bytes("GET", f"/catalog/listings/{lid}/images/{img1_id}/content", b"", "x", token=seller_tok)
    ctype = headers.get("content-type")
    check("owner DRAFT content 200+png", status == 200 and ctype == "image/png"
          and payload.get("_bytes") == PNG_1X1, (status, ctype))

    # 5. publish -> public serving; wrong pairing rejected
    status, _ = call("POST", f"/catalog/listings/{lid}/submit", token=seller_tok)
    assert status == 200, status
    status, payload, headers = call_bytes("GET", f"/catalog/listings/{lid}/images/{img1_id}/content", b"", "x", token=None)
    ctype = headers.get("content-type")
    check("public content 200", status == 200 and ctype == "image/png"
          and payload.get("_bytes") == PNG_1X1, (status, ctype))
    status, pub_rows = call("GET", f"/catalog/listings/{lid}/images", token=None)
    check("public list 200", status == 200 and len(pub_rows) == 2, (status, pub_rows))
    status, _, _ = call_bytes("GET", f"/catalog/listings/{lid}/images/{img2_id}/content", b"", "x", token=None)
    check("second image public", status == 200, status)
    status, other = call("POST", "/catalog/listings", dict(fixed, title=f"Other {tag}"), token=seller_tok)
    assert status == 201, (status, other)
    other_id = other["id"]
    status, _, _ = call_bytes("GET", f"/catalog/listings/{other_id}/images/{img1_id}/content", b"", "x", token=None)
    check("cross-listing content 404", status == 404, status)

    # 6. metadata regression: primary swap + reorder still work
    status, upd = call("PATCH", f"/catalog/listings/{lid}/images/{img2_id}", {"is_primary": True}, token=seller_tok)
    check("set primary 200", status == 200 and upd.get("is_primary") is True, (status, upd))
    status, upd = call("PATCH", f"/catalog/listings/{lid}/images/{img1_id}", {"sort_order": 5}, token=seller_tok)
    check("reorder 200", status == 200 and upd.get("sort_order") == 5, (status, upd))

    # 7. missing-file safety: remove bytes on disk, content -> 404 (no 500)
    from app.media import get_backend
    assert get_backend().delete(key1) is True
    status, _, _ = call_bytes("GET", f"/catalog/listings/{lid}/images/{img1_id}/content", b"", "x", token=None)
    check("missing file 404", status == 404, status)

    # 8. delete cleanup: file removed + row removed
    status, img3, _ = call_bytes("POST", up, PNG_1X1, "image/png", token=seller_tok)
    assert status == 201, (status, img3)
    key3 = img3["storage_key"]
    from pathlib import Path
    from app.core.config import get_settings
    assert (get_settings().media_dir / key3).is_file()
    status, _ = call("DELETE", f"/catalog/listings/{lid}/images/{img3['id']}", token=seller_tok)
    check("delete 200", status == 200, status)
    check("file removed", not (get_settings().media_dir / key3).exists())
    status, rows = call("GET", f"/catalog/listings/{lid}/images", token=seller_tok)
    check("row removed", status == 200 and img3["id"] not in [r["id"] for r in rows], (status, rows))

    # cleanup rows
    db = SessionLocal()
    db.execute(text("DELETE FROM listing_images WHERE listing_id IN "
                    "(SELECT id FROM listings WHERE title LIKE :t)"), {"t": f"%{tag}%"})
    db.execute(text("DELETE FROM listings WHERE title LIKE :t"), {"t": f"%{tag}%"})
    db.execute(text("DELETE FROM categories WHERE slug LIKE :t"), {"t": f"%{tag}"})
    db.execute(text("DELETE FROM users WHERE email LIKE :t"), {"t": f"%img-%{tag}@example.com"})
    db.commit()
    db.close()
    # orphan files from truncated/failed paths share no keys; sweep test keys
    for leftover in (key1, img2.get("storage_key", "")):
        if leftover:
            from app.media import get_backend as _backend
            _backend().delete(leftover)

    print(f"FAILURES: {FAILURES if FAILURES else 'none'}")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
