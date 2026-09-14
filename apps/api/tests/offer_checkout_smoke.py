"""Accepted-offer checkout smoke tests (stdlib only). Run inside api container:

    docker compose run --rm -e PYTHONPATH=/app api python tests/offer_checkout_smoke.py

Covers accepted-offer checkout success, wrong buyer, non-accepted offer,
inactive/non-fixed listing guards, and the concurrent duplicate/race case.
Cleans up all rows created.
"""

from __future__ import annotations

import json
import sys
import threading
import urllib.error
import urllib.request
import uuid

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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Offer1234"})
    assert status == 201, (status, body)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Offer1234"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


ADDR = {
    "recipient_name": "Offer Buyer", "line1": "21 Lake Drive", "city": "Udaipur",
    "region": "Rajasthan", "postal_code": "313001", "country": "IN",
}


def make_listing(token, admin_tok, cat, title, **over):
    payload = {
        "category_id": str(cat), "sale_type": "FIXED_PRICE", "title": title,
        "condition": "GOOD", "fixed_price_minor": 250000, "currency": "INR",
        "city": "Jaipur", "country_code": "IN", "offers_enabled": True,
    }
    payload.update(over)
    status, body = call("POST", "/catalog/listings", payload, token=token)
    assert status == 201, (status, body)
    activate_listing(token, admin_tok, body["id"])
    return body["id"]


def make_accepted_offer(lid, buyer_tok, seller_tok, amount=150000):
    status, offer = call("POST", "/offers",
                         {"listing_id": lid, "amount_minor": amount,
                          "currency": "INR", "message": "phase 6.5a"},
                         token=buyer_tok)
    assert status == 201, (status, offer)
    assert offer["status"] == "PENDING", offer
    status, accepted = call("PATCH", f"/offers/{offer['id']}", {"status": "ACCEPTED"},
                            token=seller_tok)
    assert status == 200 and accepted["status"] == "ACCEPTED", (status, accepted)
    return offer["id"]


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"oseller-{tag}@example.com")
    buyer_id, buyer_tok = register(f"obuyer-{tag}@example.com")
    stranger_id, stranger_tok = register(f"ostranger-{tag}@example.com")
    _, admin_tok = ensure_admin(tag, prefix="oadmin")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'OfferCat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"offercheckoutcat-{tag}"},
    )
    db.commit()
    db.close()

    # 1. accepted-offer checkout success
    lid = make_listing(seller_tok, admin_tok, cat, "Teak Desk")
    offer_id = make_accepted_offer(lid, buyer_tok, seller_tok, amount=180000)
    status, order = call("POST", "/checkout/offer",
                         {"offer_id": offer_id, "contact_email": "  OfferBuyer@Example.com ",
                          "address": ADDR},
                         token=buyer_tok)
    check("checkout 201", status == 201 and order["source"] == "ACCEPTED_OFFER"
          and order["accepted_offer_id"] == offer_id and order["auction_result_id"] is None
          and order["buyer_id"] == buyer_id and order["seller_id"] == seller_id
          and order["subtotal_minor"] == 180000 and order["shipping_minor"] == 0
          and order["total_minor"] == 180000 and order["currency"] == "INR"
          and order["status"] == "PENDING_PAYMENT"
          and order["listing_title_snapshot"] == "Teak Desk"
          and order["contact_email_normalized"] == "offerbuyer@example.com"
          and order["shipping_snapshot"]["city"] == "Udaipur", (status, order))
    oid = order["id"]
    check("history created", len(order["history"]) == 1
          and order["history"][0]["from_status"] is None
          and order["history"][0]["to_status"] == "PENDING_PAYMENT", order["history"])
    status, det = call("GET", f"/catalog/listings/{lid}")
    check("listing RESERVED", det["status"] == "RESERVED", det.get("status"))
    status, dup = call("POST", "/checkout/offer",
                       {"offer_id": offer_id, "contact_email": "again@example.com",
                        "address": ADDR},
                       token=buyer_tok)
    check("serial duplicate returns existing 200", status == 200 and dup["id"] == oid, (status, dup))

    # 2. wrong buyer (stranger + seller) and unauthenticated
    lid_b = make_listing(seller_tok, admin_tok, cat, "Bronze Altar")
    offer_b = make_accepted_offer(lid_b, buyer_tok, seller_tok, amount=90000)
    status, _ = call("POST", "/checkout/offer",
                     {"offer_id": offer_b, "contact_email": "a@b.com", "address": ADDR})
    check("unauth rejected", status in (401, 403), status)
    status, _ = call("POST", "/checkout/offer",
                     {"offer_id": offer_b, "contact_email": "a@b.com", "address": ADDR},
                     token=stranger_tok)
    check("stranger 403", status == 403, status)
    status, _ = call("POST", "/checkout/offer",
                     {"offer_id": offer_b, "contact_email": "a@b.com", "address": ADDR},
                     token=seller_tok)
    check("seller 403", status == 403, status)

    # 3. non-accepted offer (PENDING + REJECTED)
    lid_c = make_listing(seller_tok, admin_tok, cat, "Cedar Bench")
    status, pend = call("POST", "/offers",
                        {"listing_id": lid_c, "amount_minor": 70000, "currency": "INR"},
                        token=buyer_tok)
    assert status == 201, (status, pend)
    status, _ = call("POST", "/checkout/offer",
                     {"offer_id": pend["id"], "contact_email": "a@b.com", "address": ADDR},
                     token=buyer_tok)
    check("pending offer 409", status == 409, status)
    status, rej = call("PATCH", f"/offers/{pend['id']}", {"status": "REJECTED"}, token=seller_tok)
    assert status == 200 and rej["status"] == "REJECTED", (status, rej)
    status, _ = call("POST", "/checkout/offer",
                     {"offer_id": pend["id"], "contact_email": "a@b.com", "address": ADDR},
                     token=buyer_tok)
    check("rejected offer 409", status == 409, status)

    # 4a. inactive listing 409 (offer accepted, then listing ARCHIVED by admin)
    lid_d = make_listing(seller_tok, admin_tok, cat, "Dormant Stool")
    offer_d = make_accepted_offer(lid_d, buyer_tok, seller_tok, amount=50000)
    status, _ = call("PATCH", f"/catalog/listings/{lid_d}", {"status": "ARCHIVED"}, token=admin_tok)
    assert status == 200, (status, admin_tok)
    status, _ = call("POST", "/checkout/offer",
                     {"offer_id": offer_d, "contact_email": "a@b.com", "address": ADDR},
                     token=buyer_tok)
    check("inactive listing 409", status == 409, status)

    # 4b. non-fixed listing 422. Offers can only ever reference FIXED_PRICE
    # listings (composite FK + check constraint), so poison the listing via a
    # replica-role transaction that skips FK triggers to exercise the guard.
    lid_e = make_listing(seller_tok, admin_tok, cat, "Flip Cabinet")
    offer_e = make_accepted_offer(lid_e, buyer_tok, seller_tok, amount=60000)
    db2 = SessionLocal()
    db2.execute(text("SET session_replication_role = replica"))
    db2.execute(
        text("UPDATE listings SET sale_type = 'AUCTION', fixed_price_minor = NULL, "
             "offers_enabled = false WHERE id = :i"),
        {"i": lid_e},
    )
    db2.commit()
    db2.close()
    status, _ = call("POST", "/checkout/offer",
                     {"offer_id": offer_e, "contact_email": "a@b.com", "address": ADDR},
                     token=buyer_tok)
    check("non-fixed listing 422", status == 422, status)

    # 5. concurrent checkout: exactly one order, others get the existing one
    lid_f = make_listing(seller_tok, admin_tok, cat, "Race Console")
    offer_f = make_accepted_offer(lid_f, buyer_tok, seller_tok, amount=120000)
    barrier = threading.Barrier(2)
    results = []

    def _race():
        barrier.wait()
        s, b = call("POST", "/checkout/offer",
                    {"offer_id": offer_f, "contact_email": "race@example.com", "address": ADDR},
                    token=buyer_tok)
        results.append((s, b.get("id")))

    threads = [threading.Thread(target=_race) for _ in range(2)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    check("concurrent exactly-once",
          sorted(s for s, _ in results) == [200, 201]
          and results[0][1] is not None and results[0][1] == results[1][1], results)
    oid_f = results[0][1]
    status, det_f = call("GET", f"/catalog/listings/{lid_f}")
    check("raced listing RESERVED", det_f["status"] == "RESERVED", det_f.get("status"))
    db3 = SessionLocal()
    cnt = db3.execute(
        text("SELECT count(*) FROM orders WHERE accepted_offer_id = :o"), {"o": offer_f}
    ).scalar()
    db3.close()
    check("exactly one order row", cnt == 1, cnt)

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
                {"p": f"o%-{tag}@example.com"},
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
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"offercheckoutcat-{tag}"})
        for prefix in ("oseller-", "obuyer-", "ostranger-", "oadmin-"):
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