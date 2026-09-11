"""Admin read-only API smoke tests (stdlib only). Run inside the api container:

    docker compose run --rm -e PYTHONPATH=/app api python tests/admin_smoke.py

Covers the authZ matrix on every admin route, dashboard aggregates, user/
listing/order/auction/payment reads, and secret-leak checks. Cleans up.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = "http://api:8000/api/v1"
FAILURES: list[str] = []

ADMIN_ROUTES = [
    "/admin/dashboard",
    "/admin/users",
    "/admin/listings",
    "/admin/orders",
    "/admin/auctions",
    "/admin/payments",
]

FORBIDDEN_BODY_FRAGMENTS = ("password_hash", "token_hash", "card_number", "cvv")


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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Admin1234"})
    assert status == 201, (status, body)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Admin1234"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


def grant_admin(email):
    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        role = db.execute(text("SELECT id FROM roles WHERE name = 'ADMIN'")).scalar()
        uid = db.execute(text("SELECT id FROM users WHERE email = :e"), {"e": email}).scalar()
        db.execute(text("INSERT INTO user_roles (id, user_id, role_id) VALUES (:i, :u, :r)"),
                   {"i": uuid.uuid4(), "u": uid, "r": role})
        db.commit()
        return uid
    finally:
        db.close()


def main():
    tag = uuid.uuid4().hex[:8]
    admin_id, admin_tok = register(f"adm-{tag}@example.com")
    grant_admin(f"adm-{tag}@example.com")
    buyer_id, buyer_tok = register(f"abuyer-{tag}@example.com")
    seller_id, seller_tok = register(f"aseller-{tag}@example.com")
    susp_id, susp_tok = register(f"susp-{tag}@example.com")
    grant_admin(f"susp-{tag}@example.com")
    del_id, del_tok = register(f"goner-{tag}@example.com")
    grant_admin(f"goner-{tag}@example.com")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    # seed marketplace activity: category, listing+image, order+payment
    db = SessionLocal()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'AdminCat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"admincat-{tag}"},
    )
    db.commit()
    db.close()
    status, listing = call("POST", "/catalog/listings",
                           {"category_id": str(cat), "sale_type": "FIXED_PRICE",
                            "title": "Admin Visible Chair", "condition": "GOOD",
                            "fixed_price_minor": 99000, "currency": "INR",
                            "city": "Jaipur", "country_code": "IN"},
                           token=seller_tok)
    assert status == 201, (status, listing)
    lid = listing["id"]
    call("PATCH", f"/catalog/listings/{lid}", {"status": "ACTIVE"}, token=admin_tok)
    status, img = call("POST", f"/catalog/listings/{lid}/images",
                       {"storage_key": f"admin/{tag}/chair.jpg", "content_type": "image/jpeg",
                        "byte_size": 42000, "is_primary": True},
                       token=seller_tok)
    assert status == 201, (status, img)
    status, order = call("POST", "/checkout/fixed-price",
                         {"listing_id": lid, "contact_email": "buyer@example.com",
                          "address": {"recipient_name": "Admin Buyer", "line1": "9 Park St",
                                      "city": "Kolkata", "country": "IN"}},
                         token=buyer_tok)
    assert status == 201, (status, order)
    oid = order["id"]
    key = str(uuid.uuid4())
    status, pay = call("POST", f"/orders/{oid}/payment", {"idempotency_key": key}, token=buyer_tok)
    assert status == 200 and pay["payment"]["status"] == "SUCCEEDED", (status, pay)

    # 1. authZ matrix on every admin route
    db2 = SessionLocal()
    db2.execute(text("UPDATE users SET status = 'SUSPENDED' WHERE id = :u"), {"u": susp_id})
    db2.execute(text("UPDATE users SET status = 'DELETED' WHERE id = :u"), {"u": del_id})
    db2.commit()
    db2.close()
    matrix_ok = True
    for route in ADMIN_ROUTES:
        s_anon, _ = call("GET", route)
        s_buyer, _ = call("GET", route, token=buyer_tok)
        s_seller, _ = call("GET", route, token=seller_tok)
        s_admin, _ = call("GET", route, token=admin_tok)
        s_susp, _ = call("GET", route, token=susp_tok)
        s_del, _ = call("GET", route, token=del_tok)
        ok = (s_anon in (401, 403) and s_buyer == 403 and s_seller == 403
              and s_admin == 200 and s_susp == 403 and s_del == 403)
        if not ok:
            matrix_ok = False
            print("  matrix", route, s_anon, s_buyer, s_seller, s_admin, s_susp, s_del)
    check("authZ matrix all routes", matrix_ok)
    # detail routes matrix (representative ids)
    for route in (f"/admin/users/{buyer_id}", f"/admin/listings/{lid}",
                  f"/admin/orders/{oid}", "/admin/auctions/00000000-0000-0000-0000-000000000000"):
        s_anon, _ = call("GET", route)
        s_buyer, _ = call("GET", route, token=buyer_tok)
        s_admin, _ = call("GET", route, token=admin_tok)
        ok = s_anon in (401, 403) and s_buyer == 403 and s_admin in (200, 404)
        if not ok:
            matrix_ok = False
            print("  detail-matrix", route, s_anon, s_buyer, s_admin)
    check("authZ matrix detail routes", matrix_ok)

    # 2. dashboard aggregates (delta-proof: verify known entities counted)
    status, dash = call("GET", "/admin/dashboard", token=admin_tok)
    check("dashboard 200 + keys", status == 200 and dash["total_users"] >= 5
          and dash["total_listings"] >= 1 and dash["paid_orders"] >= 1
          and dash["successful_payments"] >= 1
          and dash["successful_payments_total_minor"] >= 99000
          and dash["successful_payments_currency"] == "INR"
          and dash["suspended_users"] >= 1, dash)

    # 3. users: pagination, filters, search, detail, no secrets
    status, users = call("GET", "/admin/users?limit=2&offset=0", token=admin_tok)
    check("users pagination", status == 200 and len(users["items"]) <= 2 and users["total"] >= 5,
          users.get("total"))
    status, susp = call("GET", "/admin/users?status=SUSPENDED", token=admin_tok)
    check("users status filter", status == 200 and all(u["status"] == "SUSPENDED" for u in susp["items"])
          and susp["total"] >= 1, susp.get("total"))
    status, admins = call("GET", "/admin/users?role=ADMIN", token=admin_tok)
    check("users role filter", status == 200 and all("ADMIN" in u["roles"] for u in admins["items"])
          and admins["total"] >= 1, admins.get("total"))
    status, found = call("GET", f"/admin/users?q=abuyer-{tag}", token=admin_tok)
    check("users search", status == 200 and any(u["email"] == f"abuyer-{tag}@example.com" for u in found["items"]), found)
    status, detail = call("GET", f"/admin/users/{buyer_id}", token=admin_tok)
    check("user detail + counts", status == 200 and detail["email"] == f"abuyer-{tag}@example.com"
          and detail["roles"] == ["BUYER"] and detail["buyer_orders_count"] >= 1, detail)
    blob = json.dumps([users, susp, detail]).lower()
    check("no secrets in users", not any(f in blob for f in FORBIDDEN_BODY_FRAGMENTS), blob[:200])
    status, _ = call("GET", f"/admin/users/{uuid.uuid4()}", token=admin_tok)
    check("user 404", status == 404, status)

    # 4. listings admin
    status, listings = call("GET", f"/admin/listings?seller_id={seller_id}&status=SOLD&q=chair", token=admin_tok)
    check("listings filters", status == 200 and listings["total"] >= 1
          and all(i["seller"]["id"] == seller_id for i in listings["items"]), listings.get("total"))
    status, ldet = call("GET", f"/admin/listings/{lid}", token=admin_tok)
    check("listing detail + images", status == 200 and len(ldet["images"]) == 1
          and ldet["images"][0]["storage_key"] == f"admin/{tag}/chair.jpg"
          and ldet["condition"] == "GOOD" and ldet["city"] == "Jaipur", ldet)
    status, _ = call("GET", f"/admin/listings/{uuid.uuid4()}", token=admin_tok)
    check("listing 404", status == 404, status)

    # 5. orders admin (+ payment summary, no secrets)
    status, orders = call("GET", f"/admin/orders?status=PAID&source=FIXED_PRICE&buyer_id={buyer_id}&seller_id={seller_id}",
                          token=admin_tok)
    check("orders filters", status == 200 and orders["total"] >= 1, orders.get("total"))
    status, odet = call("GET", f"/admin/orders/{oid}", token=admin_tok)
    check("order detail + payment", status == 200 and len(odet["payments"]) == 1
          and odet["payments"][0]["status"] == "SUCCEEDED", odet)
    blob = json.dumps([orders, odet]).lower()
    check("no secrets in orders", not any(f in blob for f in FORBIDDEN_BODY_FRAGMENTS), blob[:200])
    status, _ = call("GET", f"/admin/orders/{uuid.uuid4()}", token=admin_tok)
    check("order 404", status == 404, status)

    # 6. auctions admin (seed one auction via API for the detail path)
    status, alisting = call("POST", "/catalog/listings",
                            {"category_id": str(cat), "sale_type": "AUCTION",
                             "title": "Admin Gavel", "condition": "GOOD", "currency": "INR",
                             "city": "Jaipur", "country_code": "IN"},
                            token=seller_tok)
    assert status == 201, (status, alisting)
    alid = alisting["id"]
    call("PATCH", f"/catalog/listings/{alid}", {"status": "ACTIVE"}, token=admin_tok)
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    status, auc = call("POST", "/auctions",
                       {"listing_id": alid, "starting_bid_minor": 10000,
                        "minimum_increment_minor": 1000, "currency": "INR",
                        "starts_at": (now - timedelta(hours=1)).isoformat(),
                        "ends_at": (now + timedelta(hours=1)).isoformat()},
                       token=seller_tok)
    assert status == 201, (status, auc)
    aid = auc["id"]
    status, aucs = call("GET", "/admin/auctions", token=admin_tok)
    check("auctions list", status == 200 and any(a["id"] == aid for a in aucs), len(aucs))
    status, adet = call("GET", f"/admin/auctions/{aid}", token=admin_tok)
    check("auction detail + settlement", status == 200 and adet["listing_title"] == "Admin Gavel"
          and adet["seller_id"] == seller_id and adet["result_status"] is None
          and adet["settled_at"] is None and adet["bid_count"] == 0, adet)
    status, _ = call("GET", f"/admin/auctions/{uuid.uuid4()}", token=admin_tok)
    check("auction 404", status == 404, status)

    # 7. payments admin (safe fields only)
    status, pays = call("GET", f"/admin/payments?status=SUCCEEDED&provider=DUMMY&order_id={oid}",
                        token=admin_tok)
    check("payments filters", status == 200 and len(pays) == 1
          and pays[0]["amount_minor"] == 99000 and pays[0]["provider_reference"] is not None
          and pays[0]["order_id"] == oid, pays)
    blob = json.dumps(pays).lower()
    check("no secrets in payments", not any(f in blob for f in FORBIDDEN_BODY_FRAGMENTS), blob[:200])

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
                {"p": f"a%-{tag}@example.com"},
            ).all()
        ]
        for lid in lids:
            for oid in [r[0] for r in db.execute(text("SELECT id FROM orders WHERE listing_id = :l"), {"l": lid}).all()]:
                db.execute(text("DELETE FROM payments WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM shipments WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM order_status_history WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM order_shipping_addresses WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM orders WHERE id = :o"), {"o": oid})
            for aid in [r[0] for r in db.execute(text("SELECT id FROM auctions WHERE listing_id = :l"), {"l": lid}).all()]:
                db.execute(text("DELETE FROM auction_results WHERE auction_id = :a"), {"a": aid})
                db.execute(text("UPDATE auctions SET current_bid_id=NULL, current_winning_bid_id=NULL WHERE id = :a"), {"a": aid})
                db.execute(text("DELETE FROM bids WHERE auction_id = :a"), {"a": aid})
                db.execute(text("DELETE FROM auctions WHERE id = :a"), {"a": aid})
            db.execute(text("DELETE FROM offers WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM favorites WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listing_images WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listings WHERE id = :l"), {"l": lid})
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"admincat-{tag}"})
        for prefix in ("adm-", "abuyer-", "aseller-", "susp-", "goner-"):
            for (uid,) in db.execute(
                text("SELECT id FROM users WHERE email LIKE :p"), {"p": f"{prefix}{tag}@example.com"}
            ).all():
                db.execute(text("DELETE FROM bids WHERE bidder_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM user_addresses WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM auth_refresh_tokens WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM user_roles WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM user_profiles WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM users WHERE id = :u"), {"u": uid})
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
