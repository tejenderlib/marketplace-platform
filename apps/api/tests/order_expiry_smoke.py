"""Phase 8.2 order/checkout expiry + buyer cancel smoke tests (stdlib only):

    docker compose exec -T -e PYTHONPATH=/app:/app/tests -w /app/tests api python tests/order_expiry_smoke.py

Covers checkout_expires_at exposure on all sources, lazy expiry on order
read, expiry gate on payment, abandoned-reservation release in Buy Now,
auction-win order expiry (result PAYMENT_EXPIRED, listing released),
buyer cancel (success, authZ, state rules, duplicate), and cleanup.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

from helpers import activate_listing, ensure_admin

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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Expy12345"})
    assert status == 201, (status, body)
    # Phase 8: marketplace actions require a verified (ACTIVE) account.
    status, _v = call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    assert status == 200, (status, _v)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Expy12345"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


ADDR = {
    "recipient_name": "Expy Buyer", "line1": "82 Expiry Lane", "city": "Jaipur",
    "region": "Rajasthan", "postal_code": "302001", "country": "IN",
}


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def db_session():
    from app.db.session import SessionLocal

    return SessionLocal()


def backdate_order(order_id):
    db = db_session()
    from sqlalchemy import text

    db.execute(
        text("UPDATE orders SET checkout_expires_at = now() - interval '1 hour' WHERE id = :i"),
        {"i": order_id},
    )
    db.commit()
    db.close()


def make_listing(cat, seller_tok, admin_tok, title, **over):
    payload = {
        "category_id": str(cat), "sale_type": "FIXED_PRICE", "title": title,
        "condition": "GOOD", "fixed_price_minor": 120000, "currency": "INR",
        "city": "Jaipur", "country_code": "IN",
    }
    payload.update(over)
    status, body = call("POST", "/catalog/listings", payload, token=seller_tok)
    assert status == 201, (status, body)
    activate_listing(seller_tok, admin_tok, body["id"])
    return body["id"]


def make_auction_cycle(cat, seller_tok, bidder_tok, admin_tok, title):
    """Create AUCTION listing + auction row -> publish -> LIVE -> bid -> close."""
    from sqlalchemy import text

    payload = {
        "category_id": str(cat), "sale_type": "AUCTION", "title": title,
        "condition": "GOOD", "currency": "INR", "city": "Jaipur", "country_code": "IN",
    }
    status, body = call("POST", "/catalog/listings", payload, token=seller_tok)
    assert status == 201, (status, body)
    lid = body["id"]
    # Two-step workflow: the auction row must exist before the listing
    # can be submitted for approval.
    now = datetime.now(timezone.utc)
    status, auc = call("POST", "/auctions",
                      {"listing_id": lid, "starting_bid_minor": 40000,
                       "minimum_increment_minor": 5000, "currency": "INR",
                       "starts_at": iso(now - timedelta(hours=2)),
                       "ends_at": iso(now + timedelta(hours=2))},
                      token=seller_tok)
    assert status == 201, (status, auc)
    aid = auc["id"]
    activate_listing(seller_tok, admin_tok, lid)
    assert call("POST", f"/auctions/{aid}/schedule", token=seller_tok)[0] == 200
    assert call("POST", f"/auctions/{aid}/start", token=seller_tok)[0] == 200
    status, bid = call("POST", f"/auctions/{aid}/bids",
                       {"amount_minor": 60000, "currency": "INR",
                        "request_id": str(uuid.uuid4())},
                       token=bidder_tok)
    assert status == 201, (status, bid)
    db = db_session()
    db.execute(text("UPDATE auctions SET ends_at = now() - interval '1 minute' WHERE id = :i"),
               {"i": aid})
    db.commit()
    db.close()
    status, res = call("POST", f"/auctions/{aid}/close", token=seller_tok)
    assert status == 200 and res["status"] == "AWAITING_CHECKOUT", (status, res)
    return lid, aid, res


def make_accepted_offer(lid, buyer_tok, seller_tok):
    status, offer = call("POST", "/offers",
                         {"listing_id": lid, "amount_minor": 90000,
                          "currency": "INR", "message": "phase 8.2"},
                         token=buyer_tok)
    assert status == 201, (status, offer)
    status, accepted = call("PATCH", f"/offers/{offer['id']}", {"status": "ACCEPTED"},
                            token=seller_tok)
    assert status == 200, (status, accepted)
    return offer["id"]


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"eseller-{tag}@example.com")
    buyer_id, buyer_tok = register(f"ebuyer-{tag}@example.com")
    buyer2_id, buyer2_tok = register(f"ebuyer2-{tag}@example.com")
    winner_id, winner_tok = register(f"ewinner-{tag}@example.com")
    _, admin_tok = ensure_admin(tag, prefix="eadmin")

    from sqlalchemy import text

    db = db_session()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'ExpyCat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"expycat-{tag}"},
    )
    db.commit()
    db.close()

    # -----------------------------------------------------------------
    # 1. checkout_expires_at exposed: FIXED_PRICE checkout stamps a deadline
    # -----------------------------------------------------------------
    lid1 = make_listing(cat, seller_tok, admin_tok, "Expiry Teak Bench")
    status, order = call("POST", "/checkout/fixed-price",
                         {"listing_id": lid1, "contact_email": "buyer@example.com",
                          "address": ADDR},
                         token=buyer_tok)
    check("fixed checkout 201 + deadline", status == 201
          and order["checkout_expires_at"] is not None, (status, order))
    oid1 = order["id"]
    status, got = call("GET", f"/orders/{oid1}", token=buyer_tok)
    check("OrderOut exposes checkout_expires_at", status == 200
          and got["checkout_expires_at"] == order["checkout_expires_at"], (status, got))

    # -----------------------------------------------------------------
    # 2. ACCEPTED_OFFER checkout stamps the deadline too
    # -----------------------------------------------------------------
    lid2 = make_listing(cat, seller_tok, admin_tok, "Expiry Offer Vase")
    offer_id = make_accepted_offer(lid2, buyer_tok, seller_tok)
    status, order2 = call("POST", "/checkout/offer",
                          {"offer_id": offer_id, "contact_email": "buyer@example.com",
                           "address": ADDR},
                          token=buyer_tok)
    check("offer checkout 201 + deadline", status == 201
          and order2["checkout_expires_at"] is not None, (status, order2))
    oid2 = order2["id"]

    # -----------------------------------------------------------------
    # 3. AUCTION_WIN checkout stamps the deadline too
    # -----------------------------------------------------------------
    lid3, aid3, res3 = make_auction_cycle(cat, seller_tok, winner_tok, admin_tok,
                                          "Expiry Auction Carpet")
    status, order3 = call("POST", "/checkout/auction",
                          {"auction_result_id": res3["id"],
                           "contact_email": "winner@example.com", "address": ADDR},
                          token=winner_tok)
    check("auction checkout 201 + deadline", status == 201
          and order3["checkout_expires_at"] is not None, (status, order3))
    oid3 = order3["id"]

    # -----------------------------------------------------------------
    # 4. buyer cancel: happy path releases listing + records history
    # -----------------------------------------------------------------
    status, cancelled = call("POST", f"/orders/{oid2}/cancel", token=buyer_tok)
    check("buyer cancel 200", status == 200
          and cancelled["status"] == "CANCELLED"
          and cancelled["cancelled_at"] is not None, (status, cancelled))
    status, ldet = call("GET", f"/catalog/listings/{lid2}")
    check("cancel releases listing to ACTIVE", ldet["status"] == "ACTIVE", ldet.get("status"))
    check("cancel history note", any(
        h["to_status"] == "CANCELLED" and "Buyer cancelled" in (h.get("note") or "")
        for h in cancelled["history"]), cancelled.get("history"))

    # authZ: not the buyer
    status, _ = call("POST", f"/orders/{oid1}/cancel", token=buyer2_tok)
    check("stranger cancel 403", status == 403, status)
    status, _ = call("POST", f"/orders/{oid1}/cancel", token=seller_tok)
    check("seller cancel 403", status == 403, status)
    status, _ = call("POST", f"/orders/{oid1}/cancel")
    check("unauth cancel 401", status in (401, 403), status)
    # duplicate / invalid state
    status, _ = call("POST", f"/orders/{oid2}/cancel", token=buyer_tok)
    check("second cancel 409", status == 409, status)
    # paid order can no longer be cancelled
    status, pay = call("POST", f"/orders/{oid1}/payment",
                      {"idempotency_key": str(uuid.uuid4())}, token=buyer_tok)
    assert status == 200 and pay["order"]["status"] == "PAID", (status, pay)
    status, _ = call("POST", f"/orders/{oid1}/cancel", token=buyer_tok)
    check("cancel paid order 409", status == 409, status)

    # -----------------------------------------------------------------
    # 5. lazy expiry on order read: backdate a fresh PENDING_PAYMENT order
    # -----------------------------------------------------------------
    lid4 = make_listing(cat, seller_tok, admin_tok, "Expiry Read Brass Lamp")
    status, order4 = call("POST", "/checkout/fixed-price",
                          {"listing_id": lid4, "contact_email": "buyer@example.com",
                           "address": ADDR},
                          token=buyer_tok)
    assert status == 201, (status, order4)
    oid4 = order4["id"]
    backdate_order(oid4)
    status, read = call("GET", f"/orders/{oid4}", token=buyer_tok)
    check("expired read flips CANCELLED", status == 200
          and read["status"] == "CANCELLED"
          and read["cancelled_at"] is not None, (status, read))
    status, ldet4 = call("GET", f"/catalog/listings/{lid4}")
    check("expired read releases listing", ldet4["status"] == "ACTIVE", ldet4.get("status"))
    check("expiry history note", any(
        h["to_status"] == "CANCELLED" and "expired" in (h.get("note") or "")
        for h in read["history"]), read.get("history"))
    # payment after read-expiry is rejected
    status, _ = call("POST", f"/orders/{oid4}/payment",
                     {"idempotency_key": str(uuid.uuid4())}, token=buyer_tok)
    check("pay after expiry 409", status == 409, status)

    # -----------------------------------------------------------------
    # 6. expiry gate on payment (no read first): backdate then pay
    # -----------------------------------------------------------------
    lid5 = make_listing(cat, seller_tok, admin_tok, "Expiry Gate Silver Frame")
    status, order5 = call("POST", "/checkout/fixed-price",
                          {"listing_id": lid5, "contact_email": "buyer@example.com",
                           "address": ADDR},
                          token=buyer_tok)
    assert status == 201, (status, order5)
    backdate_order(order5["id"])
    status, body = call("POST", f"/orders/{order5['id']}/payment",
                        {"idempotency_key": str(uuid.uuid4())}, token=buyer_tok)
    check("expired pay 409", status == 409, (status, body))
    status, after = call("GET", f"/orders/{order5['id']}", token=buyer_tok)
    check("expired pay flipped CANCELLED", after["status"] == "CANCELLED", after.get("status"))
    status, ldet5 = call("GET", f"/catalog/listings/{lid5}")
    check("expired pay releases listing", ldet5["status"] == "ACTIVE", ldet5.get("status"))

    # -----------------------------------------------------------------
    # 7. abandoned reservation release: another buyer can Buy Now
    # -----------------------------------------------------------------
    lid6 = make_listing(cat, seller_tok, admin_tok, "Expiry Race Marble Idol")
    status, order6 = call("POST", "/checkout/fixed-price",
                          {"listing_id": lid6, "contact_email": "buyer@example.com",
                           "address": ADDR},
                          token=buyer_tok)
    assert status == 201, (status, order6)
    backdate_order(order6["id"])
    # listing is RESERVED; buyer2 checkout lazily releases it and proceeds
    status, order6b = call("POST", "/checkout/fixed-price",
                           {"listing_id": lid6, "contact_email": "buyer2@example.com",
                            "address": ADDR},
                           token=buyer2_tok)
    check("abandoned reservation released for next buyer", status == 201
          and order6b["buyer_id"] == buyer2_id
          and order6b["checkout_expires_at"] is not None, (status, order6b))
    status, ldet6 = call("GET", f"/catalog/listings/{lid6}")
    check("listing re-reserved", ldet6["status"] == "RESERVED", ldet6.get("status"))
    status, stale = call("GET", f"/orders/{order6['id']}", token=buyer_tok)
    check("first buyer order CANCELLED", stale["status"] == "CANCELLED", stale.get("status"))

    # -----------------------------------------------------------------
    # 8. auction-win order expiry: result flips PAYMENT_EXPIRED, listing released
    # -----------------------------------------------------------------
    backdate_order(oid3)
    status, read3 = call("GET", f"/orders/{oid3}", token=winner_tok)
    check("auction order expired CANCELLED", status == 200
          and read3["status"] == "CANCELLED", (status, read3))
    status, res3b = call("GET", f"/auctions/{aid3}/result", token=winner_tok)
    check("result PAYMENT_EXPIRED", res3b["status"] == "PAYMENT_EXPIRED", res3b)
    status, ldet3 = call("GET", f"/catalog/listings/{lid3}")
    check("auction listing released", ldet3["status"] == "ACTIVE", ldet3.get("status"))
    # expired auction order cannot be paid
    status, _ = call("POST", f"/orders/{oid3}/payment",
                     {"idempotency_key": str(uuid.uuid4())}, token=winner_tok)
    check("expired auction pay 409", status == 409, status)

    # -----------------------------------------------------------------
    # 9. unexpired order still pays fine (deadline in the future)
    # -----------------------------------------------------------------
    status, okpay = call("POST", f"/orders/{order6b['id']}/payment",
                         {"idempotency_key": str(uuid.uuid4())}, token=buyer2_tok)
    check("fresh order pays 200", status == 200
          and okpay["order"]["status"] == "PAID", (status, okpay))

    _cleanup(tag)
    print("FAILURES:", FAILURES if FAILURES else "none")
    return 1 if FAILURES else 0


def _cleanup(tag):
    from sqlalchemy import text

    db = db_session()
    try:
        lids = [
            r[0]
            for r in db.execute(
                text("SELECT id FROM listings WHERE seller_id IN (SELECT id FROM users WHERE email LIKE :p)"),
                {"p": f"e%-{tag}@example.com"},
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
            db.execute(text("DELETE FROM moderation_actions WHERE target_listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM notifications WHERE link = '/orders' AND user_id IN (SELECT id FROM users WHERE email LIKE :p)"),
                       {"p": f"e%-{tag}@example.com"})
            db.execute(text("DELETE FROM listings WHERE id = :l"), {"l": lid})
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"expycat-{tag}"})
        for prefix in ("eseller-", "ebuyer-", "ebuyer2-", "ewinner-", "eadmin-"):
            for (uid,) in db.execute(
                text("SELECT id FROM users WHERE email LIKE :p"), {"p": f"{prefix}{tag}@example.com"}
            ).all():
                db.execute(text("DELETE FROM bids WHERE bidder_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM notifications WHERE user_id = :u OR actor_id = :u"), {"u": uid})
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
