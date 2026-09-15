"""Ratings & reviews smoke tests (stdlib only). Run inside api container:

    docker compose run --rm -e PYTHONPATH=/app api python tests/reviews_smoke.py

Covers create eligibility (participant, DELIVERED-only, one-per-reviewer),
validation, self-review impossibility, my/reviewee reads, and admin soft
removal with moderation audit reuse. Cleans up all rows created.
"""

from __future__ import annotations

import json
import sys
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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Revu1234"})
    assert status == 201, (status, body)
    # Phase 8: marketplace actions require a verified (ACTIVE) account.
    status, _v = call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    assert status == 200, (status, _v)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Revu1234"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


ADDR = {
    "recipient_name": "Review Buyer", "line1": "7 Bazaar Lane", "city": "Jodhpur",
    "region": "Rajasthan", "postal_code": "342001", "country": "IN",
}


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"rseller-{tag}@example.com")
    buyer_id, buyer_tok = register(f"rbuyer-{tag}@example.com")
    stranger_id, stranger_tok = register(f"rstranger-{tag}@example.com")
    _, admin_tok = ensure_admin(tag, prefix="radmin")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'RevCat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"reviewcat-{tag}"},
    )
    db.commit()
    db.close()

    def make_delivered_order(title, deliver=True):
        payload = {
            "category_id": str(cat), "sale_type": "FIXED_PRICE", "title": title,
            "condition": "GOOD", "fixed_price_minor": 125000, "currency": "INR",
            "city": "Jaipur", "country_code": "IN", "offers_enabled": False,
        }
        status, listing = call("POST", "/catalog/listings", payload, token=seller_tok)
        assert status == 201, (status, listing)
        activate_listing(seller_tok, admin_tok, listing["id"])
        status, order = call(
            "POST", "/checkout/fixed-price",
            {"listing_id": listing["id"], "contact_email": "rv@example.com", "address": ADDR},
            token=buyer_tok,
        )
        assert status == 201, (status, order)
        if deliver:
            d = SessionLocal()
            d.execute(text("UPDATE orders SET status = 'DELIVERED' WHERE id = :i"), {"i": order["id"]})
            d.commit()
            d.close()
        return listing["id"], order["id"]

    _, oid_delivered = make_delivered_order("Review Teak Table")
    _, oid_unpaid = make_delivered_order("Review Unpaid Stool", deliver=False)

    # 1. positive: buyer reviews seller on the delivered order
    status, review = call("POST", "/reviews",
                          {"order_id": oid_delivered, "rating": 5,
                           "comment": "  Excellent craft, fast delivery.  "},
                          token=buyer_tok)
    check("buyer reviews seller 201", status == 201
          and review["reviewer_id"] == buyer_id and review["reviewee_id"] == seller_id
          and review["rating"] == 5 and review["status"] == "ACTIVE"
          and review["order_id"] == oid_delivered
          and review["comment"] == "Excellent craft, fast delivery."
          and review["removed_at"] is None, (status, review))
    rid_buyer_review = review["id"]

    # 2. one review per reviewer per order
    status, _ = call("POST", "/reviews", {"order_id": oid_delivered, "rating": 4}, token=buyer_tok)
    check("duplicate reviewer 409", status == 409, status)

    # 3. not eligible state (order still PENDING_PAYMENT/unpaid)
    status, _ = call("POST", "/reviews", {"order_id": oid_unpaid, "rating": 3}, token=buyer_tok)
    check("unpaid order 409", status == 409, status)
    status, _ = call("POST", "/reviews", {"order_id": oid_unpaid, "rating": 3}, token=seller_tok)
    check("unpaid order seller 409", status == 409, status)

    # 4. seller reviews buyer on the same delivered order (reverse direction)
    status, rev = call("POST", "/reviews", {"order_id": oid_delivered, "rating": 1, "comment": "minor"}, token=seller_tok)
    check("seller reviews buyer 201", status == 201
          and rev["reviewer_id"] == seller_id and rev["reviewee_id"] == buyer_id
          and rev["rating"] == 1, (status, rev))
    rid_seller_review = rev["id"]

    # 5. stranger not allowed
    status, _ = call("POST", "/reviews", {"order_id": oid_delivered, "rating": 5}, token=stranger_tok)
    check("stranger 403", status == 403, status)
    status, _ = call("POST", "/reviews", {"order_id": oid_delivered, "rating": 5})
    check("unauth 401/403", status in (401, 403), status)

    # 6. validation
    status, _ = call("POST", "/reviews", {"order_id": oid_delivered, "rating": 0}, token=buyer_tok)
    check("rating 0 422", status == 422, status)
    status, _ = call("POST", "/reviews", {"order_id": oid_delivered, "rating": 6}, token=buyer_tok)
    check("rating 6 422", status == 422, status)
    status, _ = call("POST", "/reviews",
                     {"order_id": oid_delivered, "rating": 5, "comment": "x" * 2001},
                     token=buyer_tok)
    check("comment too long 422", status == 422, status)
    status, _ = call("POST", "/reviews", {"order_id": str(uuid.uuid4()), "rating": 5}, token=buyer_tok)
    check("unknown order 404", status == 404, status)

    # 7. reads
    status, mine = call("GET", "/reviews/my", token=buyer_tok)
    check("my reviews (buyer) 1", status == 200 and mine["total"] == 1
          and mine["items"][0]["id"] == rid_buyer_review, (status, mine))
    status, about_seller = call("GET", f"/reviews/reviewee/{seller_id}", token=buyer_tok)
    check("about seller aggregate", status == 200 and about_seller["total"] == 1
          and about_seller["average_rating"] == 5.0
          and about_seller["items"][0]["status"] == "ACTIVE", (status, about_seller))
    status, about_buyer = call("GET", f"/reviews/reviewee/{buyer_id}", token=buyer_tok)
    check("about buyer aggregate", status == 200
          and about_buyer["total"] == 1 and about_buyer["average_rating"] == 1.0, (status, about_buyer))
    status, _ = call("GET", f"/reviews/reviewee/{buyer_id}")
    check("reads require auth", status in (401, 403), status)

    # 8. admin removal is soft + audited
    status, rm = call("POST", f"/admin/reviews/{rid_buyer_review}/remove",
                      {"reason": "inappropriate content"}, token=admin_tok)
    check("admin remove 200", status == 200 and rm["action_type"] == "REVIEW_REMOVED"
          and rm["target_review_id"] == rid_buyer_review and rm["reason"] == "inappropriate content",
          (status, rm))
    status, _ = call("POST", f"/admin/reviews/{rid_buyer_review}/remove",
                     {"reason": "again"}, token=admin_tok)
    check("remove twice 409", status == 409, status)
    status, _ = call("POST", f"/admin/reviews/{rid_buyer_review}/remove", {"reason": "nope"}, token=buyer_tok)
    check("non-admin remove 403", status == 403, status)
    status, _ = call("POST", f"/admin/reviews/{str(uuid.uuid4())}/remove", {"reason": "x"}, token=admin_tok)
    check("remove unknown 404", status == 404, status)

    # 9. removed review hidden publicly, preserved in author history
    status, about_seller_after = call("GET", f"/reviews/reviewee/{seller_id}", token=buyer_tok)
    check("removed hidden from reviewee", status == 200 and about_seller_after["total"] == 0
          and about_seller_after["average_rating"] is None, (status, about_seller_after))
    status, mine_after = call("GET", "/reviews/my", token=buyer_tok)
    check("removed preserved in my history", status == 200 and mine_after["total"] == 1
          and mine_after["items"][0]["status"] == "REMOVED"
          and mine_after["items"][0]["removed_at"] is not None, (status, mine_after))

    # 10. admin lists + audit trail reuse
    status, admin_list = call("GET", "/admin/reviews?status=REMOVED", token=admin_tok)
    check("admin reviews filter REMOVED", status == 200
          and admin_list["total"] == 1 and admin_list["items"][0]["id"] == rid_buyer_review,
          (status, admin_list))
    status, admin_all = call("GET", "/admin/reviews", token=admin_tok)
    check("admin reviews all statuses", status == 200 and admin_all["total"] == 2, (status, admin_all))
    status, mod = call("GET", f"/admin/moderation?target_review_id={rid_buyer_review}", token=admin_tok)
    check("audit trail by review target", status == 200 and mod["total"] == 1
          and mod["items"][0]["action_type"] == "REVIEW_REMOVED", (status, mod))

    check("seller review still ACTIVE", True)
    status, still = call("GET", f"/reviews/reviewee/{buyer_id}", token=buyer_tok)
    check("independent review intact", status == 200 and still["total"] == 1
          and still["items"][0]["id"] == rid_seller_review, (status, still))

    _cleanup(tag)
    print("FAILURES:", FAILURES if FAILURES else "none")
    return 1 if FAILURES else 0


def _cleanup(tag):
    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        uids = [
            r[0]
            for r in db.execute(
                text("SELECT id FROM users WHERE email LIKE :p"),
                {"p": f"r%-{tag}@example.com"},
            ).all()
        ]
        if not uids:
            db.commit()
            return
        id_placeholders = ", ".join(f":u{i}" for i in range(len(uids)))
        uid_params = {f"u{i}": uid for i, uid in enumerate(uids)}
        for uid in uids:
            db.execute(
                text("DELETE FROM moderation_actions WHERE target_review_id IN "
                     "(SELECT id FROM reviews WHERE reviewer_id = :u OR reviewee_id = :u)"),
                {"u": uid},
            )
            db.execute(text("DELETE FROM reviews WHERE reviewer_id = :u OR reviewee_id = :u"), {"u": uid})
        lids = [
            r[0]
            for r in db.execute(
                text(f"SELECT id FROM listings WHERE seller_id IN ({id_placeholders})"),
                uid_params,
            ).all()
        ]
        if lids:
            lph = ",".join(f":li{i}" for i in range(len(lids)))
            lparams = {f"li{i}": lid for i, lid in enumerate(lids)}
            db.execute(text(f"DELETE FROM moderation_actions WHERE target_listing_id IN ({lph})"), lparams)
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
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"reviewcat-{tag}"})
        db.execute(text(f"DELETE FROM moderation_actions WHERE admin_id IN ({id_placeholders})"), uid_params)
        for uid in uids:
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