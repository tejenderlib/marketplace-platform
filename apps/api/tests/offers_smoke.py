"""Offers API smoke tests (stdlib only). Run inside the api container:

    docker compose run --rm -e PYTHONPATH=/app api python tests/offers_smoke.py

Covers buyer create/rules, seller inbox/response, withdraw, visibility,
ADMIN path, expiry, and canonical lifecycle. Cleans up all rows created.
"""

from __future__ import annotations

import json
import sys
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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Offer1234"})
    assert status == 201, (status, body)
    # Phase 8: marketplace actions require a verified (ACTIVE) account.
    status, _v = call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    assert status == 200, (status, _v)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Offer1234"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"oseller-{tag}@example.com")
    buyer1_id, buyer1_tok = register(f"obuyer1-{tag}@example.com")
    buyer2_id, buyer2_tok = register(f"obuyer2-{tag}@example.com")
    _, admin_tok = ensure_admin(tag, prefix="oadmin")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'OfferCat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"offercat-{tag}"},
    )
    db.commit()

    def make_listing(token, **over):
        payload = {
            "category_id": str(cat), "sale_type": "FIXED_PRICE", "title": "Carved Door Panel",
            "condition": "GOOD", "fixed_price_minor": 50000, "currency": "INR",
            "city": "Jaipur", "country_code": "IN",
        }
        payload.update(over)
        status, body = call("POST", "/catalog/listings", payload, token=token)
        assert status == 201, (status, body)
        status, active = call("PATCH", f"/catalog/listings/{body['id']}", {"status": "ACTIVE"}, token=admin_tok)
        assert status == 200, (status, active)
        return body["id"]

    fixed_id = make_listing(seller_tok)
    draft_id = make_listing(seller_tok, title="Draft Item")
    db.execute(text("UPDATE listings SET status = 'DRAFT' WHERE id = :i"), {"i": draft_id})
    db.commit()
    auc_id = make_listing(seller_tok, sale_type="AUCTION", title="Auction Item",
                          fixed_price_minor=None)

    # 1. buyer: create valid INR offer (with message)
    status, offer = call("POST", "/offers",
                         {"listing_id": fixed_id, "amount_minor": 45000, "currency": "INR",
                          "message": "Cash pickup today."},
                         token=buyer1_tok)
    check("create 201 PENDING", status == 201 and offer["status"] == "PENDING"
          and offer["buyer_id"] == buyer1_id and offer["currency"] == "INR"
          and offer["message"] == "Cash pickup today." and offer["responded_at"] is None
          and offer["listing"]["title"] == "Carved Door Panel"
          and offer["seller"]["id"] == seller_id, (status, offer))
    oid = offer["id"]

    # 2. unauthenticated rejected
    status, _ = call("POST", "/offers", {"listing_id": fixed_id, "amount_minor": 1, "currency": "INR"})
    check("unauth create rejected", status in (401, 403), status)

    # 3. seller cannot offer on own listing
    status, _ = call("POST", "/offers",
                     {"listing_id": fixed_id, "amount_minor": 1000, "currency": "INR"},
                     token=seller_tok)
    check("own listing 422", status == 422, status)

    # 4. AUCTION / inactive / missing listings rejected
    status, _ = call("POST", "/offers",
                     {"listing_id": auc_id, "amount_minor": 1000, "currency": "INR"},
                     token=buyer1_tok)
    check("auction 422", status == 422, status)
    status, _ = call("POST", "/offers",
                     {"listing_id": draft_id, "amount_minor": 1000, "currency": "INR"},
                     token=buyer1_tok)
    check("inactive 422", status == 422, status)
    status, _ = call("POST", "/offers",
                     {"listing_id": str(uuid.uuid4()), "amount_minor": 1000, "currency": "INR"},
                     token=buyer1_tok)
    check("missing listing 404", status == 404, status)
    status, _ = call("POST", "/offers",
                     {"listing_id": fixed_id, "amount_minor": 1000, "currency": "USD"},
                     token=buyer1_tok)
    check("USD 422", status == 422, status)
    status, _ = call("POST", "/offers",
                     {"listing_id": fixed_id, "amount_minor": 0, "currency": "INR"},
                     token=buyer1_tok)
    check("zero amount 422", status == 422, status)

    # 5. duplicate pending rejected
    status, _ = call("POST", "/offers",
                     {"listing_id": fixed_id, "amount_minor": 44000, "currency": "INR"},
                     token=buyer1_tok)
    check("duplicate pending 409", status == 409, status)

    # 6. buyer inbox + visibility
    status, mine = call("GET", "/offers/me", token=buyer1_tok)
    check("buyer inbox", status == 200 and mine["total"] == 1 and mine["items"][0]["id"] == oid, mine)
    status, mine_f = call("GET", f"/offers/me?listing_id={fixed_id}&status=PENDING", token=buyer1_tok)
    check("buyer filters", status == 200 and mine_f["total"] == 1, mine_f)
    status, detail = call("GET", f"/offers/{oid}", token=buyer1_tok)
    check("buyer views own", status == 200 and detail["id"] == oid, status)
    status, _ = call("GET", f"/offers/{oid}", token=buyer2_tok)
    check("unrelated cannot view 403", status == 403, status)

    # 7. withdraw flow
    status, wd = call("POST", f"/offers/{oid}/withdraw", token=buyer1_tok)
    check("withdraw WITHDRAWN", status == 200 and wd["status"] == "WITHDRAWN"
          and wd["responded_at"] is not None, (status, wd))
    status, _ = call("POST", f"/offers/{oid}/withdraw", token=buyer1_tok)
    check("withdraw again 409", status == 409, status)
    status, other_wd = call("POST", f"/offers/{oid}/withdraw", token=buyer2_tok)
    check("other buyer withdraw 403", status == 403, other_wd)

    # 7b. concurrent duplicate-pending: exactly one 201, one 409
    import threading

    barrier = threading.Barrier(2)
    results = []

    def _race_create():
        barrier.wait()
        s, b = call("POST", "/offers",
                    {"listing_id": fixed_id, "amount_minor": 46000, "currency": "INR"},
                    token=buyer1_tok)
        results.append(s)

    threads = [threading.Thread(target=_race_create) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    check("concurrent exactly-once", sorted(results) == [201, 409], results)
    # leave a clean state: withdraw the race winner if buyer1 holds a PENDING
    status, pend = call("GET", f"/offers/me?listing_id={fixed_id}&status=PENDING", token=buyer1_tok)
    for item in pend.get("items", []):
        call("POST", f"/offers/{item['id']}/withdraw", token=buyer1_tok)

    # 8. seller inbox (own listings only)
    status, inbox = call("GET", "/seller/offers", token=seller_tok)
    check("seller inbox", status == 200 and inbox["total"] >= 1
          and all(i["seller"]["id"] == seller_id for i in inbox["items"]), inbox.get("total"))
    other_seller_id, other_seller_tok = register(f"oseller2-{tag}@example.com")
    status, empty = call("GET", "/seller/offers", token=other_seller_tok)
    check("other seller sees none", status == 200 and empty["total"] == 0, empty)

    # 9. accept flow (fresh pending after withdrawal)
    status, offer2 = call("POST", "/offers",
                          {"listing_id": fixed_id, "amount_minor": 47000, "currency": "INR"},
                          token=buyer1_tok)
    assert status == 201, (status, offer2)
    oid2 = offer2["id"]
    status, acc = call("PATCH", f"/offers/{oid2}", {"status": "ACCEPTED"}, token=seller_tok)
    check("accept ACCEPTED", status == 200 and acc["status"] == "ACCEPTED"
          and acc["amount_minor"] == 47000 and acc["responded_at"] is not None, (status, acc))
    status, _ = call("PATCH", f"/offers/{oid2}", {"status": "REJECTED"}, token=seller_tok)
    check("re-answer 409", status == 409, status)
    status, _ = call("PATCH", f"/offers/{oid2}", {"status": "COMPLETED"}, token=seller_tok)
    check("invented transition 422", status == 422, status)
    status, detail2 = call("GET", f"/offers/{oid2}", token=seller_tok)
    check("seller views own", status == 200, status)
    status, _ = call("PATCH", f"/offers/{oid2}", {"status": "REJECTED"}, token=buyer1_tok)
    check("buyer cannot respond 403", status == 403, status)

    # 10. reject flow
    status, offer3 = call("POST", "/offers",
                          {"listing_id": fixed_id, "amount_minor": 30000, "currency": "INR"},
                          token=buyer2_tok)
    assert status == 201, (status, offer3)
    status, rej = call("PATCH", f"/offers/{offer3['id']}", {"status": "REJECTED"}, token=seller_tok)
    check("reject REJECTED", status == 200 and rej["status"] == "REJECTED", (status, rej))

    # 11. ADMIN view + privileged respond (reuse setup admin)
    status, alogin = call("POST", "/auth/login", {"email": f"oadmin-{tag}@example.com", "password": "Admin1234"})
    assert status == 200, (status, alogin)
    admin_tok = alogin["access_token"]
    status, _ = call("GET", f"/offers/{oid2}", token=admin_tok)
    check("admin views 200", status == 200, status)
    status, offer4 = call("POST", "/offers",
                          {"listing_id": fixed_id, "amount_minor": 48000, "currency": "INR"},
                          token=buyer2_tok)
    assert status == 201, (status, offer4)
    status, acc4 = call("PATCH", f"/offers/{offer4['id']}", {"status": "ACCEPTED"}, token=admin_tok)
    check("admin accept 200", status == 200 and acc4["status"] == "ACCEPTED", (status, acc4))

    # 12. expiry: backdate a pending offer, reads flip it to EXPIRED
    status, offer5 = call("POST", "/offers",
                          {"listing_id": fixed_id, "amount_minor": 49000, "currency": "INR",
                           "expires_at": "2030-01-01T00:00:00+00:00"},
                          token=buyer2_tok)
    assert status == 201, (status, offer5)
    db3 = SessionLocal()
    db3.execute(text("UPDATE offers SET expires_at = now() - interval '1 hour' WHERE id = :i"),
                {"i": offer5["id"]})
    db3.commit()
    db3.close()
    status, exp = call("GET", f"/offers/{offer5['id']}", token=buyer2_tok)
    check("expired reads EXPIRED", status == 200 and exp["status"] == "EXPIRED", (status, exp))
    status, _ = call("PATCH", f"/offers/{offer5['id']}", {"status": "ACCEPTED"}, token=seller_tok)
    check("expired cannot accept 409", status == 409, status)
    status, _ = call("POST", f"/offers/{offer5['id']}/withdraw", token=buyer2_tok)
    check("expired cannot withdraw 409", status == 409, status)

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
            db.execute(text("DELETE FROM offers WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM favorites WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listing_images WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM auctions WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listings WHERE id = :l"), {"l": lid})
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"offercat-{tag}"})
        for prefix in ("oseller-", "obuyer1-", "obuyer2-", "oseller2-", "oadmin-"):
            for (uid,) in db.execute(
                text("SELECT id FROM users WHERE email LIKE :p"), {"p": f"{prefix}{tag}@example.com"}
            ).all():
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
