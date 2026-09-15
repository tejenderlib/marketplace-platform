"""Seller workflow smoke tests (stdlib only). Run inside the api container:

    docker compose run --rm -e PYTHONPATH=/app api python tests/seller_workflow_smoke.py

Covers /listings/mine, seller lifecycle map, publish flow DRAFT -> ACTIVE
(incl. auction config gate, auth, duplicate safety, public visibility),
image PATCH/reorder/primary rules, and ownership. Cleans up.
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


def register(email):
    status, body = call("POST", "/auth/register", {"email": email, "password": "Sell12345"})
    assert status == 201, (status, body)
    # Phase 8: marketplace actions require a verified (ACTIVE) account.
    status, _v = call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    assert status == 200, (status, _v)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Sell12345"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


IMG = {"storage_key": "s/x.jpg", "content_type": "image/jpeg", "byte_size": 1000}


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"wfseller-{tag}@example.com")
    other_id, other_tok = register(f"wfother-{tag}@example.com")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'WF', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"wfcat-{tag}"},
    )
    db.commit()

    def make_listing(token, **over):
        payload = {
            "category_id": str(cat), "sale_type": "FIXED_PRICE", "title": "WF Item",
            "condition": "GOOD", "fixed_price_minor": 10000, "currency": "INR",
            "city": "Jaipur", "country_code": "IN",
        }
        payload.update(over)
        status, body = call("POST", "/catalog/listings", payload, token=token)
        assert status == 201, (status, body)
        return body["id"]

    # 1. my listings: drafts visible to owner only
    lid = make_listing(seller_tok)
    status, mine = call("GET", "/catalog/listings/mine", token=seller_tok)
    check("mine 200 + draft visible", status == 200 and any(i["id"] == lid and i["status"] == "DRAFT" for i in mine["items"]), mine.get("total"))
    status, other_mine = call("GET", "/catalog/listings/mine", token=other_tok)
    check("other sees none", status == 200 and all(i["id"] != lid for i in other_mine["items"]), other_mine.get("total"))
    status, _ = call("GET", "/catalog/listings/mine")
    check("unauth mine rejected", status in (401, 403), status)
    status, filt = call("GET", "/catalog/listings/mine?status=DRAFT&sale_type=FIXED_PRICE&limit=1&offset=0", token=seller_tok)
    check("mine filters+pagination", status == 200 and filt["limit"] == 1, filt)

    # 2. lifecycle via PATCH: allowed + rejected transitions
    status, _ = call("PATCH", f"/catalog/listings/{lid}", {"status": "ACTIVE"}, token=seller_tok)
    check("DRAFT->ACTIVE rejected 422", status == 422, status)
    status, _ = call("PATCH", f"/catalog/listings/{lid}", {"status": "SOLD"}, token=seller_tok)
    check("DRAFT->SOLD rejected", status == 422, status)
    status, body = call("PATCH", f"/catalog/listings/{lid}", {"status": "ARCHIVED"}, token=seller_tok)
    check("DRAFT->ARCHIVED allowed", status == 200 and body["status"] == "ARCHIVED", (status, body))
    # admin still unrestricted
    admin_role = db.execute(text("SELECT id FROM roles WHERE name = 'ADMIN'")).scalar()
    admin_id = uuid.uuid4()
    db.execute(text("INSERT INTO users (id, email, password_hash, status) VALUES (:i, :e, 'x', 'ACTIVE')"),
               {"i": admin_id, "e": f"wfadmin-{tag}@example.com"})
    db.execute(text("INSERT INTO user_roles (id, user_id, role_id) VALUES (:i, :u, :r)"),
               {"i": uuid.uuid4(), "u": admin_id, "r": admin_role})
    db.commit()
    db.close()
    from app.identity.security import hash_password
    from app.db.session import SessionLocal as S2
    db2 = S2()
    db2.execute(text("UPDATE users SET password_hash = :h WHERE id = :u"),
                {"h": hash_password("Admin1234"), "u": admin_id})
    db2.commit()
    db2.close()
    status, alogin = call("POST", "/auth/login", {"email": f"wfadmin-{tag}@example.com", "password": "Admin1234"})
    assert status == 200, (status, alogin)
    admin_tok = alogin["access_token"]
    status, body = call("PATCH", f"/catalog/listings/{lid}", {"status": "ACTIVE"}, token=admin_tok)
    check("admin unrestricted", status == 200 and body["status"] == "ACTIVE", (status, body))
    # seller ACTIVE->SOLD / ACTIVE->REMOVED rejected; ACTIVE->ARCHIVED allowed
    for label, target, expect in [
        ("ACTIVE->SOLD rejected", "SOLD", 422),
        ("ACTIVE->REMOVED rejected", "REMOVED", 422),
        ("ACTIVE->RESERVED rejected", "RESERVED", 422),
        ("ACTIVE->EXPIRED rejected", "EXPIRED", 422),
    ]:
        status, _ = call("PATCH", f"/catalog/listings/{lid}", {"status": target}, token=seller_tok)
        check(label, status == expect, status)
    status, body = call("PATCH", f"/catalog/listings/{lid}", {"status": "ARCHIVED"}, token=seller_tok)
    check("ACTIVE->ARCHIVED allowed", status == 200 and body["status"] == "ARCHIVED", (status, body))

    # 3. publish flow (fresh listing): DRAFT -> ACTIVE immediately
    lid2 = make_listing(seller_tok, title="WF Submit")
    status, _ = call("POST", f"/catalog/listings/{lid2}/submit", token=other_tok)
    check("publish non-owner 403", status == 403, status)
    status, _ = call("POST", f"/catalog/listings/{lid2}/submit")
    check("publish unauth rejected", status in (401, 403), status)
    status, sub = call("POST", f"/catalog/listings/{lid2}/submit", token=seller_tok)
    check("publish DRAFT->ACTIVE", status == 200 and sub["status"] == "ACTIVE", (status, sub))
    check("publish sets published_at", sub.get("published_at") is not None, sub.get("published_at"))
    status, pub = call("GET", f"/catalog/listings/{lid2}")
    check("published listing publicly visible", status == 200 and pub["status"] == "ACTIVE", (status, pub))
    status, _ = call("POST", f"/catalog/listings/{lid2}/submit", token=seller_tok)
    check("duplicate publish 409", status == 409, status)
    # legacy REJECTED rows can still return to DRAFT (historical compatibility)
    db3 = S2()
    db3.execute(text("UPDATE listings SET status = 'REJECTED' WHERE id = :i"), {"i": lid2})
    db3.commit()
    db3.close()
    status, body = call("PATCH", f"/catalog/listings/{lid2}", {"status": "DRAFT"}, token=seller_tok)
    check("REJECTED->DRAFT legacy path", status == 200 and body["status"] == "DRAFT", (status, body))
    status, sub2 = call("POST", f"/catalog/listings/{lid2}/submit", token=seller_tok)
    check("republish after legacy reject 200 ACTIVE", status == 200 and sub2["status"] == "ACTIVE", (status, sub2))

    # 4. auction boundary: AUCTION listing without auction row cannot submit
    alid = make_listing(seller_tok, sale_type="AUCTION", title="WF Auction", fixed_price_minor=None)
    status, _ = call("POST", f"/catalog/listings/{alid}/submit", token=seller_tok)
    check("auction w/o config 422", status == 422, status)
    # create auction row via auctions API, then submit works, still no duplicate
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    iso = lambda dt: dt.isoformat()
    status, auc = call("POST", "/auctions",
                       {"listing_id": alid, "starting_bid_minor": 1000,
                        "minimum_increment_minor": 100, "currency": "INR",
                        "starts_at": iso(now), "ends_at": iso(now + __import__("datetime").timedelta(days=1))},
                       token=seller_tok)
    check("auction row created", status == 201, (status, auc))
    status, sub3 = call("POST", f"/catalog/listings/{alid}/submit", token=seller_tok)
    check("auction publish with config 200 ACTIVE", status == 200 and sub3["status"] == "ACTIVE", (status, sub3))
    status, _ = call("POST", "/auctions",
                     {"listing_id": alid, "starting_bid_minor": 1000,
                      "minimum_increment_minor": 100, "currency": "INR",
                      "starts_at": iso(now), "ends_at": iso(now + __import__("datetime").timedelta(days=1))},
                     token=seller_tok)
    check("no duplicate auction 409", status == 409, status)
    # fixed-price listing cannot create auction
    status, _ = call("POST", "/auctions",
                     {"listing_id": lid2, "starting_bid_minor": 1000,
                      "minimum_increment_minor": 100, "currency": "INR",
                      "starts_at": iso(now), "ends_at": iso(now + __import__("datetime").timedelta(days=1))},
                     token=seller_tok)
    check("fixed listing auction 422", status == 422, status)

    # 5. images: add two, reorder, primary swap, conflicts, ownership
    status, im1 = call("POST", f"/catalog/listings/{lid2}/images", dict(IMG, storage_key="s/1.jpg"), token=seller_tok)
    assert status == 201, (status, im1)
    status, im2 = call("POST", f"/catalog/listings/{lid2}/images", dict(IMG, storage_key="s/2.jpg"), token=seller_tok)
    assert status == 201, (status, im2)
    status, upd = call("PATCH", f"/catalog/listings/{lid2}/images/{im2['id']}",
                       {"alt_text": "Front view"}, token=seller_tok)
    check("alt_text update", status == 200 and upd["alt_text"] == "Front view", (status, upd))
    status, _ = call("PATCH", f"/catalog/listings/{lid2}/images/{im2['id']}",
                     {"sort_order": 0}, token=seller_tok)
    check("occupied sort_order 409", status == 409, status)
    status, upd2 = call("PATCH", f"/catalog/listings/{lid2}/images/{im2['id']}",
                        {"sort_order": 5}, token=seller_tok)
    check("sort_order move", status == 200 and upd2["sort_order"] == 5, (status, upd2))
    status, prim = call("PATCH", f"/catalog/listings/{lid2}/images/{im2['id']}",
                        {"is_primary": True}, token=seller_tok)
    check("primary set", status == 200 and prim["is_primary"] is True, (status, prim))
    status, prim2 = call("PATCH", f"/catalog/listings/{lid2}/images/{im1['id']}",
                         {"is_primary": True}, token=seller_tok)
    check("primary swap", status == 200 and prim2["is_primary"] is True, (status, prim2))
    db4 = S2()
    n_primary = db4.execute(
        text("SELECT count(*) FROM listing_images WHERE listing_id = :l AND is_primary = true"),
        {"l": lid2},
    ).scalar()
    db4.close()
    check("single primary invariant", n_primary == 1, n_primary)
    status, _ = call("PATCH", f"/catalog/listings/{lid2}/images/{im1['id']}",
                     {"alt_text": "x"}, token=other_tok)
    check("non-owner image 403", status == 403, status)
    status, _ = call("PATCH", f"/catalog/listings/{lid2}/images/{im1['id']}",
                     {"alt_text": "y"}, token=admin_tok)
    check("admin image allowed", status == 200, status)

    _cleanup(tag)
    print("FAILURES:", FAILURES if FAILURES else "none")
    return 1 if FAILURES else 0


def _cleanup(tag):
    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        lids = [
            r[0]
            for r in db.execute(
                text("SELECT id FROM listings WHERE seller_id IN (SELECT id FROM users WHERE email LIKE :p)"),
                {"p": f"%{tag}@example.com"},
            ).all()
        ]
        for lid in lids:
            for oid in [r[0] for r in db.execute(text("SELECT id FROM orders WHERE listing_id = :l"), {"l": lid}).all()]:
                db.execute(text("DELETE FROM payments WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM shipments WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM order_status_history WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM order_shipping_addresses WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM orders WHERE id = :o"), {"o": oid})
            db.execute(text("DELETE FROM moderation_actions WHERE target_listing_id = :l"), {"l": lid})
            for aid in [r[0] for r in db.execute(text("SELECT id FROM auctions WHERE listing_id = :l"), {"l": lid}).all()]:
                db.execute(text("DELETE FROM auction_results WHERE auction_id = :a"), {"a": aid})
                db.execute(text("UPDATE auctions SET current_bid_id=NULL, current_winning_bid_id=NULL WHERE id = :a"), {"a": aid})
                db.execute(text("DELETE FROM bids WHERE auction_id = :a"), {"a": aid})
                db.execute(text("DELETE FROM auctions WHERE id = :a"), {"a": aid})
            db.execute(text("DELETE FROM offers WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM favorites WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listing_images WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listings WHERE id = :l"), {"l": lid})
        # fix non-ascii tag emails possibly created above, then users
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"wfcat-{tag}"})
        for (uid,) in db.execute(text("SELECT id FROM users")).all():
            pass
        for email_row in db.execute(text("SELECT id, email FROM users")).all():
            uid, email = email_row
            if tag in email:
                db.execute(text("DELETE FROM moderation_actions WHERE target_user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM moderation_actions WHERE admin_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM bids WHERE bidder_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM offers WHERE buyer_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM auth_refresh_tokens WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM user_roles WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM user_profiles WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM users WHERE id = :u"), {"u": uid})
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
