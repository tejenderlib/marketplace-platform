"""Checkout/orders/dummy-payment smoke tests (stdlib only). Run inside api container:

    docker compose run --rm -e PYTHONPATH=/app api python tests/checkout_smoke.py

Covers addresses, Buy Now (incl. concurrency), order visibility, dummy
payments (success/failure/retry/idempotency), lifecycle + history.
Cleans up all rows created.
"""

from __future__ import annotations

import json
import sys
import threading
import urllib.error
import urllib.request
import uuid

from helpers import ensure_admin

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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Pay12345"})
    assert status == 201, (status, body)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Pay12345"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


ADDR = {
    "recipient_name": "Checkout Buyer", "line1": "14 MG Road", "city": "Bengaluru",
    "region": "Karnataka", "postal_code": "560001", "country": "IN", "phone": "9876543210",
}


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"cseller-{tag}@example.com")
    buyer1_id, buyer1_tok = register(f"cbuyer1-{tag}@example.com")
    buyer2_id, buyer2_tok = register(f"cbuyer2-{tag}@example.com")
    _, admin_tok = ensure_admin(tag, prefix="cadmin")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'CheckoutCat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"checkoutcat-{tag}"},
    )
    db.commit()

    def make_listing(token, **over):
        payload = {
            "category_id": str(cat), "sale_type": "FIXED_PRICE", "title": "Jaipur Rug",
            "condition": "GOOD", "fixed_price_minor": 250000, "currency": "INR",
            "city": "Jaipur", "country_code": "IN",
        }
        payload.update(over)
        status, body = call("POST", "/catalog/listings", payload, token=token)
        assert status == 201, (status, body)
        status, active = call("PATCH", f"/catalog/listings/{body['id']}", {"status": "ACTIVE"}, token=admin_tok)
        assert status == 200, (status, active)
        return body["id"]

    # --- addresses ---
    status, a1 = call("POST", "/addresses", dict(ADDR, is_default=True), token=buyer1_tok)
    check("address create 201 default", status == 201 and a1["is_default"] is True, (status, a1))
    status, a2 = call("POST", "/addresses", dict(ADDR, label="Work", is_default=True), token=buyer1_tok)
    check("second default flips first", status == 201 and a2["is_default"] is True, status)
    status, addrs = call("GET", "/addresses", token=buyer1_tok)
    by_id = {a["id"]: a for a in addrs}
    check("list own + single default", status == 200 and len(addrs) == 2
          and sum(1 for a in addrs if a["is_default"]) == 1
          and by_id[a1["id"]]["is_default"] is False, addrs)
    status, _ = call("PATCH", f"/addresses/{a1['id']}", {"city": "Mumbai"}, token=buyer2_tok)
    check("other user's address 404", status == 404, status)
    status, upd = call("PATCH", f"/addresses/{a1['id']}", {"city": "Mumbai"}, token=buyer1_tok)
    check("update own 200", status == 200 and upd["city"] == "Mumbai", (status, upd))
    status, _ = call("POST", "/addresses", dict(ADDR, country="US"), token=buyer1_tok)
    check("non-IN 422", status == 422, status)
    status, _ = call("GET", "/addresses")
    check("unauth addresses rejected", status in (401, 403), status)

    # --- Buy Now ---
    lid = make_listing(seller_tok)
    buy = {"listing_id": lid, "contact_email": "  Buyer@Example.com ", "address_id": a2["id"]}
    status, order = call("POST", "/checkout/fixed-price", buy, token=buyer1_tok)
    check("checkout 201", status == 201 and order["status"] == "PENDING_PAYMENT"
          and order["subtotal_minor"] == 250000 and order["shipping_minor"] == 0
          and order["total_minor"] == 250000 and order["currency"] == "INR"
          and order["listing_title_snapshot"] == "Jaipur Rug"
          and order["contact_email_normalized"] == "buyer@example.com"
          and order["buyer_id"] == buyer1_id and order["seller_id"] == seller_id
          and order["shipping_snapshot"]["city"] == "Bengaluru", (status, order))
    oid = order["id"]
    check("history created", len(order["history"]) == 1
          and order["history"][0]["from_status"] is None
          and order["history"][0]["to_status"] == "PENDING_PAYMENT", order["history"])
    status, det = call("GET", f"/catalog/listings/{lid}")
    check("listing RESERVED", det["status"] == "RESERVED", det.get("status"))

    status, _ = call("POST", "/checkout/fixed-price", buy)
    check("unauth checkout rejected", status in (401, 403), status)
    auc_lid = make_listing(seller_tok, sale_type="AUCTION", title="Bid Rug", fixed_price_minor=None)
    status, _ = call("POST", "/checkout/fixed-price",
                     {"listing_id": auc_lid, "contact_email": "b@example.com",
                      "address_id": a2["id"]}, token=buyer1_tok)
    check("auction rejected 422", status == 422, status)
    draft_lid = make_listing(seller_tok, title="Draft Rug")
    db.execute(text("UPDATE listings SET status = 'DRAFT' WHERE id = :i"), {"i": draft_lid})
    db.commit()
    status, _ = call("POST", "/checkout/fixed-price",
                     {"listing_id": draft_lid, "contact_email": "b@example.com",
                      "address_id": a2["id"]}, token=buyer1_tok)
    check("inactive rejected 409", status == 409, status)
    own_lid = make_listing(seller_tok, title="Own Rug")
    status, _ = call("POST", "/checkout/fixed-price",
                     {"listing_id": own_lid, "contact_email": "b@example.com",
                      "address_id": a2["id"]}, token=seller_tok)
    check("own listing 422", status == 422, status)
    db.execute(text("DELETE FROM listings WHERE id = :i"), {"i": own_lid})
    db.commit()

    # client price override ignored (fresh listing proves DB pricing)
    lid2 = make_listing(seller_tok, title="Override Rug")
    status, order2 = call("POST", "/checkout/fixed-price",
                          {"listing_id": lid2, "contact_email": "b@example.com",
                           "address": ADDR, "total_minor": 1, "amount_minor": 1,
                           "subtotal_minor": 1},
                          token=buyer2_tok)
    check("client totals ignored", status == 201 and order2["total_minor"] == 250000, (status, order2))

    # snapshot immutability: change listing + address, order keeps originals
    call("PATCH", f"/catalog/listings/{lid}", {"title": "Renamed Rug"}, token=seller_tok)
    call("PATCH", f"/addresses/{a2['id']}", {"city": "Delhi"}, token=buyer1_tok)
    status, frozen = call("GET", f"/orders/{oid}", token=buyer1_tok)
    check("snapshot immutable", frozen["listing_title_snapshot"] == "Jaipur Rug"
          and frozen["shipping_snapshot"]["city"] == "Bengaluru", frozen)

    # concurrent Buy Now: exactly one 201
    lid3 = make_listing(seller_tok, title="Race Rug")
    barrier = threading.Barrier(2)
    results = []

    def _race(tok):
        barrier.wait()
        s, b = call("POST", "/checkout/fixed-price",
                    {"listing_id": lid3, "contact_email": "race@example.com",
                     "address": dict(ADDR, city="Pune")}, token=tok)
        results.append(s)

    threads = [threading.Thread(target=_race, args=(t,)) for t in (buyer1_tok, buyer2_tok)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    check("concurrent one success", sorted(results) == [201, 409], results)
    status, _ = call("POST", "/checkout/fixed-price",
                     {"listing_id": lid3, "contact_email": "late@example.com",
                      "address": ADDR}, token=buyer1_tok)
    check("reserved blocks second buyer 409", status == 409, status)

    # --- order visibility ---
    status, mine = call("GET", "/orders/me", token=buyer1_tok)
    check("buyer sees own", status == 200 and mine["total"] >= 1
          and all(o["buyer_id"] == buyer1_id for o in mine["items"]), mine.get("total"))
    status, sinbox = call("GET", "/seller/orders", token=seller_tok)
    check("seller sees own listings", status == 200 and sinbox["total"] >= 2
          and all(o["seller_id"] == seller_id for o in sinbox["items"]), sinbox.get("total"))
    status, _ = call("GET", f"/orders/{oid}", token=buyer2_tok)
    check("unrelated 403", status == 403, status)
    status, p1 = call("GET", "/seller/orders?limit=1&offset=0", token=seller_tok)
    status, p2 = call("GET", "/seller/orders?limit=1&offset=1", token=seller_tok)
    check("pagination", p1["total"] >= 2 and len(p1["items"]) == 1 and len(p2["items"]) == 1
          and p1["items"][0]["id"] != p2["items"][0]["id"], (p1, p2))

    # ADMIN read (reuse setup admin)
    status, alogin = call("POST", "/auth/login", {"email": f"cadmin-{tag}@example.com", "password": "Admin1234"})
    assert status == 200, (status, alogin)
    status, _ = call("GET", f"/orders/{oid}", token=alogin["access_token"])
    check("admin reads order", status == 200, status)

    # --- payments: success path ---
    key1 = str(uuid.uuid4())
    status, pay1 = call("POST", f"/orders/{oid}/payment", {"idempotency_key": key1}, token=buyer1_tok)
    check("payment success", status == 200 and pay1["payment"]["status"] == "SUCCEEDED"
          and pay1["payment"]["amount_minor"] == 250000 and pay1["payment"]["currency"] == "INR"
          and pay1["payment"]["provider"] == "DUMMY"
          and pay1["order"]["status"] == "PAID" and pay1["order"]["paid_at"] is not None,
          (status, pay1))
    status, det2 = call("GET", f"/catalog/listings/{lid}")
    check("listing SOLD", det2["status"] == "SOLD", det2.get("status"))
    hist = pay1["order"]["history"]
    check("history PENDING->PAID", any(h["from_status"] == "PENDING_PAYMENT" and h["to_status"] == "PAID" for h in hist), hist)
    status, pay1b = call("POST", f"/orders/{oid}/payment", {"idempotency_key": key1}, token=buyer1_tok)
    check("same key idempotent", status == 200 and pay1b["payment"]["id"] == pay1["payment"]["id"], (status, pay1b))
    status, _ = call("POST", f"/orders/{oid}/payment", {"idempotency_key": str(uuid.uuid4())}, token=buyer1_tok)
    check("second success blocked 409", status == 409, status)
    status, _ = call("POST", f"/orders/{oid}/payment", {"idempotency_key": str(uuid.uuid4())}, token=seller_tok)
    check("seller cannot pay 403", status == 403, status)

    # --- payments: failure + retry ---
    fail_lid = make_listing(seller_tok, title="Fail Rug")
    status, fail_order = call("POST", "/checkout/fixed-price",
                              {"listing_id": fail_lid, "contact_email": "f@example.com",
                               "address": ADDR}, token=buyer2_tok)
    assert status == 201, (status, fail_order)
    foid = fail_order["id"]
    status, fail_pay = call("POST", f"/orders/{foid}/payment",
                            {"idempotency_key": str(uuid.uuid4()), "simulate": "failure"},
                            token=buyer2_tok)
    check("failure path", status == 200 and fail_pay["payment"]["status"] == "FAILED"
          and fail_pay["payment"]["failure_code"] == "DUMMY_DECLINED"
          and fail_pay["order"]["status"] == "PAYMENT_FAILED", (status, fail_pay))
    status, det3 = call("GET", f"/catalog/listings/{fail_lid}")
    check("failure keeps purchasable", det3["status"] == "ACTIVE", det3.get("status"))
    status, retry = call("POST", f"/orders/{foid}/payment",
                         {"idempotency_key": str(uuid.uuid4())}, token=buyer2_tok)
    check("retry succeeds", status == 200 and retry["payment"]["status"] == "SUCCEEDED"
          and retry["order"]["status"] == "PAID", (status, retry))
    n_hist = len(retry["order"]["history"])
    check("history grows", n_hist >= 4, n_hist)

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
                {"p": f"c%-{tag}@example.com"},
            ).all()
        ]
        for lid in lids:
            for oid in [r[0] for r in db.execute(text("SELECT id FROM orders WHERE listing_id = :l"), {"l": lid}).all()]:
                db.execute(text("DELETE FROM payments WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM shipments WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM order_status_history WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM order_shipping_addresses WHERE order_id = :o"), {"o": oid})
                db.execute(text("DELETE FROM orders WHERE id = :o"), {"o": oid})
            db.execute(text("DELETE FROM offers WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM favorites WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listing_images WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM auctions WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listings WHERE id = :l"), {"l": lid})
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"checkoutcat-{tag}"})
        for prefix in ("cseller-", "cbuyer1-", "cbuyer2-", "cadmin-"):
            for (uid,) in db.execute(
                text("SELECT id FROM users WHERE email LIKE :p"), {"p": f"{prefix}{tag}@example.com"}
            ).all():
                db.execute(text("DELETE FROM user_addresses WHERE user_id = :u"), {"u": uid})
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
