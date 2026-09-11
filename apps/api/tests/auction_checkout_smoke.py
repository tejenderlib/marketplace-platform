"""Auction winner checkout + settlement smoke tests (stdlib only):

    docker compose run --rm -e PYTHONPATH=/app api python tests/auction_checkout_smoke.py

Covers winner checkout, exactly-once (serial + concurrent), settlement,
failure/retry, expiry, visibility. Cleans up all rows created.
"""

from __future__ import annotations

import json
import sys
import threading
import urllib.error
import urllib.request
import uuid

from helpers import ensure_admin
from datetime import datetime, timedelta, timezone

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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Win12345"})
    assert status == 201, (status, body)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Win12345"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


ADDR = {
    "recipient_name": "Winner Buyer", "line1": "7 Lake View", "city": "Udaipur",
    "region": "Rajasthan", "postal_code": "313001", "country": "IN",
}


def make_auction_cycle(tag, seller_tok, bidder_tok, title, admin_tok, backdate_end=True):
    """Create listing -> auction -> LIVE -> bid -> (backdated) close. Returns ids."""
    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat = db.execute(text("SELECT id FROM categories WHERE slug = :s"), {"s": f"winccat-{tag}"}).scalar()
    status, listing = call("POST", "/catalog/listings",
                           {"category_id": str(cat), "sale_type": "AUCTION",
                            "title": title, "condition": "GOOD", "currency": "INR",
                            "city": "Jaipur", "country_code": "IN"},
                           token=seller_tok)
    assert status == 201, (status, listing)
    lid = listing["id"]
    call("PATCH", f"/catalog/listings/{lid}", {"status": "ACTIVE"}, token=admin_tok)
    now = datetime.now(timezone.utc)
    status, auc = call("POST", "/auctions",
                       {"listing_id": lid, "starting_bid_minor": 50000,
                        "minimum_increment_minor": 5000, "currency": "INR",
                        "starts_at": iso(now - timedelta(hours=2)),
                        "ends_at": iso(now + timedelta(hours=2))},
                       token=seller_tok)
    assert status == 201, (status, auc)
    aid = auc["id"]
    call("POST", f"/auctions/{aid}/schedule", token=seller_tok)
    call("POST", f"/auctions/{aid}/start", token=seller_tok)
    status, bid = call("POST", f"/auctions/{aid}/bids",
                       {"amount_minor": 75000, "currency": "INR",
                        "request_id": str(uuid.uuid4())},
                       token=bidder_tok)
    assert status == 201, (status, bid)
    if backdate_end:
        db.execute(text("UPDATE auctions SET ends_at = now() - interval '1 minute' WHERE id = :i"), {"i": aid})
        db.commit()
    status, res = call("POST", f"/auctions/{aid}/close", token=seller_tok)
    assert status == 200 and res["status"] == "AWAITING_CHECKOUT", (status, res)
    db.close()
    return lid, aid, res


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"wseller-{tag}@example.com")
    winner_id, winner_tok = register(f"wwinner-{tag}@example.com")
    stranger_id, stranger_tok = register(f"wstranger-{tag}@example.com")
    _, admin_tok = ensure_admin(tag, prefix="wadmin")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'WinCat', :slug, 'ACTIVE')"),
        {"id": uuid.uuid4(), "slug": f"winccat-{tag}"},
    )
    db.commit()
    db.close()

    lid, aid, res = make_auction_cycle(tag, seller_tok, winner_tok, "Ivory Chess Set", admin_tok)
    rid = res["id"]

    # 1. valid winner checkout
    status, order = call("POST", "/checkout/auction",
                         {"auction_result_id": rid, "contact_email": " Winner@Example.com ",
                          "address": ADDR},
                         token=winner_tok)
    check("checkout 201", status == 201 and order["source"] == "AUCTION_WIN"
          and order["auction_result_id"] == rid and order["accepted_offer_id"] is None
          and order["buyer_id"] == winner_id and order["seller_id"] == seller_id
          and order["subtotal_minor"] == 75000 and order["shipping_minor"] == 0
          and order["total_minor"] == 75000 and order["currency"] == "INR"
          and order["status"] == "PENDING_PAYMENT"
          and order["listing_title_snapshot"] == "Ivory Chess Set"
          and order["contact_email_normalized"] == "winner@example.com"
          and order["shipping_snapshot"]["city"] == "Udaipur", (status, order))
    oid = order["id"]
    status, res2 = call("GET", f"/auctions/{aid}/result", token=seller_tok)
    check("result ORDER_CREATED", res2["status"] == "ORDER_CREATED", res2)
    status, ldet = call("GET", f"/catalog/listings/{lid}")
    check("listing RESERVED", ldet["status"] == "RESERVED", ldet.get("status"))

    # 2. authZ/validation
    status, _ = call("POST", "/checkout/auction",
                     {"auction_result_id": rid, "contact_email": "a@b.com", "address": ADDR})
    check("unauth rejected", status in (401, 403), status)
    status, _ = call("POST", "/checkout/auction",
                     {"auction_result_id": rid, "contact_email": "a@b.com", "address": ADDR},
                     token=stranger_tok)
    check("stranger 403", status == 403, status)
    status, _ = call("POST", "/checkout/auction",
                     {"auction_result_id": rid, "contact_email": "a@b.com", "address": ADDR},
                     token=seller_tok)
    check("seller 403", status == 403, status)
    status, dup = call("POST", "/checkout/auction",
                       {"auction_result_id": rid, "contact_email": "a@b.com", "address": ADDR},
                       token=winner_tok)
    check("duplicate returns existing 200", status == 200 and dup["id"] == oid, (status, dup))

    # 3. concurrent checkout: exactly one order
    barrier = threading.Barrier(2)
    results = []

    def _race():
        barrier.wait()
        s, b = call("POST", "/checkout/auction",
                    {"auction_result_id": rid, "contact_email": "r@b.com", "address": ADDR},
                    token=winner_tok)
        results.append((s, b.get("id")))

    threads = [threading.Thread(target=_race) for _ in range(2)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    check("concurrent exactly-once", sorted(s for s, _ in results) == [200, 200]
          and results[0][1] == results[1][1] == oid, results)

    # 4. price manipulation ignored
    status, manip = call("POST", "/checkout/auction",
                         {"auction_result_id": rid, "contact_email": "a@b.com",
                          "address": ADDR, "total_minor": 1, "subtotal_minor": 1},
                         token=winner_tok)
    check("client price ignored", status == 200 and manip["total_minor"] == 75000
          and manip["id"] == oid, (status, manip))

    # 5. expiry: backdate a fresh result, checkout flips to PAYMENT_EXPIRED
    lid2, aid2, res2b = make_auction_cycle(tag, seller_tok, winner_tok, "Marble Elephant", admin_tok)
    rid2 = res2b["id"]
    db2 = SessionLocal()
    db2.execute(text("UPDATE auction_results SET checkout_expires_at = now() - interval '1 hour' WHERE id = :i"),
                {"i": rid2})
    db2.commit()
    db2.close()
    status, _ = call("POST", "/checkout/auction",
                     {"auction_result_id": rid2, "contact_email": "a@b.com", "address": ADDR},
                     token=winner_tok)
    check("expired 409", status == 409, status)
    status, exp = call("GET", f"/auctions/{aid2}/result", token=winner_tok)
    check("lazy PAYMENT_EXPIRED", exp["status"] == "PAYMENT_EXPIRED", exp)

    # 6. payment success -> full settlement
    key = str(uuid.uuid4())
    status, pay = call("POST", f"/orders/{oid}/payment", {"idempotency_key": key}, token=winner_tok)
    check("settle success", status == 200 and pay["payment"]["status"] == "SUCCEEDED"
          and pay["order"]["status"] == "PAID" and pay["order"]["paid_at"] is not None,
          (status, pay))
    status, res3 = call("GET", f"/auctions/{aid}/result", token=winner_tok)
    check("result PAYMENT_COMPLETED", res3["status"] == "PAYMENT_COMPLETED", res3)
    status, auc = call("GET", f"/auctions/{aid}", token=seller_tok)
    check("auction SETTLED + settled_at", auc["status"] == "SETTLED"
          and auc["settled_at"] is not None, auc)
    db3 = SessionLocal()
    arow = db3.execute(text("SELECT status, settled_at FROM auctions WHERE id = :i"), {"i": aid}).first()
    lrow = db3.execute(text("SELECT status FROM listings WHERE id = :i"), {"i": lid}).scalar()
    brow = db3.execute(text("SELECT status FROM bids WHERE auction_id = :i ORDER BY amount_minor DESC"), {"i": aid}).first()
    db3.close()
    check("settled atomically", arow[0] == "SETTLED" and arow[1] is not None
          and lrow == "SOLD" and brow[0] == "WON", (arow, lrow, brow))

    # 7. failure + retry on second auction cycle
    lid3, aid3, res3b = make_auction_cycle(tag, seller_tok, winner_tok, "Brass Lamp", admin_tok)
    rid3 = res3b["id"]
    status, order3 = call("POST", "/checkout/auction",
                          {"auction_result_id": rid3, "contact_email": "w@example.com",
                           "address": ADDR},
                          token=winner_tok)
    assert status == 201, (status, order3)
    o3 = order3["id"]
    status, fail = call("POST", f"/orders/{o3}/payment",
                        {"idempotency_key": str(uuid.uuid4()), "simulate": "failure"},
                        token=winner_tok)
    check("failure path", status == 200 and fail["payment"]["status"] == "FAILED"
          and fail["order"]["status"] == "PAYMENT_FAILED", (status, fail))
    db4 = SessionLocal()
    states = db4.execute(text("SELECT (SELECT status FROM auctions WHERE id = :a), (SELECT status FROM auction_results WHERE id = :r), (SELECT status FROM listings WHERE id = :l)"),
                                 {"a": aid3, "r": rid3, "l": lid3}).first()
    db4.close()
    check("failure keeps ENDED/ORDER_CREATED/ACTIVE", states == ("ENDED", "ORDER_CREATED", "ACTIVE"), states)
    status, retry = call("POST", f"/orders/{o3}/payment",
                         {"idempotency_key": str(uuid.uuid4())}, token=winner_tok)
    check("retry succeeds", status == 200 and retry["order"]["status"] == "PAID", (status, retry))
    status, rep = call("POST", f"/orders/{o3}/payment",
                       {"idempotency_key": str(uuid.uuid4())}, token=winner_tok)
    check("paid blocks new key 409", status == 409, status)

    # 8. visibility: seller full, stranger minimal, admin full
    status, sell = call("GET", f"/auctions/{aid}/result", token=seller_tok)
    check("seller full", status == 200 and sell.get("winner_id") == winner_id
          and sell.get("final_price_minor") == 75000, sell)
    status, pub = call("GET", f"/auctions/{aid}/result")
    check("stranger minimal", status == 200 and pub["status"] == "PAYMENT_COMPLETED"
          and "winner_id" not in pub, pub)

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
                {"p": f"w%-{tag}@example.com"},
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
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"winccat-{tag}"})
        for prefix in ("wseller-", "wwinner-", "wstranger-", "wadmin-"):
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
