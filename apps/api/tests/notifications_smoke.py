"""Notifications smoke tests (stdlib only). Run inside api container:

    docker compose exec -T -e PYTHONPATH=/app:/app/tests -w /app/tests api python tests/notifications_smoke.py

Covers:
- Auth required (401 without token).
- User only sees own notifications (not other users').
- Unread count (GET /notifications/unread-count).
- Mark single notification as read (PATCH /notifications/{id}/read).
- Mark all as read (POST /notifications/mark-read).
- Newest first ordering.
- History preserved (read notifications are not deleted).
- All 5 event types fire: OFFER_RECEIVED, OFFER_ACCEPTED, ORDER_PLACED, PAYMENT_SUCCEEDED, REVIEW_RECEIVED.
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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Noti1234"})
    assert status == 201, (status, body)
    # Phase 8: marketplace actions require a verified (ACTIVE) account.
    status, _v = call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    assert status == 200, (status, _v)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Noti1234"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


ADDR = {
    "recipient_name": "Noti Buyer", "line1": "9 Notification Road", "city": "Jaipur",
    "region": "Rajasthan", "postal_code": "302001", "country": "IN",
}


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"nseller-{tag}@example.com")
    buyer_id, buyer_tok = register(f"nbuyer-{tag}@example.com")
    _, admin_tok = ensure_admin(tag, prefix="nadmin")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'NotiCat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"noticat-{tag}"},
    )
    db.commit()
    db.close()

    # Create a fixed-price listing
    payload = {
        "category_id": str(cat), "sale_type": "FIXED_PRICE", "title": "Notification Test Item",
        "condition": "NEW", "fixed_price_minor": 50000, "currency": "INR",
        "city": "Mumbai", "country_code": "IN", "offers_enabled": True,
    }
    status, listing = call("POST", "/catalog/listings", payload, token=seller_tok)
    assert status == 201, (status, listing)
    activate_listing(seller_tok, admin_tok, listing["id"])

    # -------------------------------------------------------------------
    # 1. Auth required
    # -------------------------------------------------------------------
    status, _ = call("GET", "/notifications")
    check("list notifications 401 without token", status in (401, 403), status)
    status, _ = call("GET", "/notifications/unread-count")
    check("unread-count 401 without token", status in (401, 403), status)

    # -------------------------------------------------------------------
    # 2. OFFER_RECEIVED: buyer creates offer → seller gets notification
    # -------------------------------------------------------------------
    status, offer = call(
        "POST", "/offers",
        {"listing_id": listing["id"], "amount_minor": 45000, "currency": "INR", "message": "lowball"},
        token=buyer_tok,
    )
    assert status == 201, (status, offer)
    status, items = call("GET", "/notifications", token=seller_tok)
    check("seller got OFFER_RECEIVED", status == 200 and items["total"] >= 1, (status, items))
    offer_notif = items["items"][0]
    check("offer_notif type OFFER_RECEIVED",
          offer_notif["type"] == "OFFER_RECEIVED" and offer_notif["user_id"] == seller_id
          and offer_notif["actor_id"] == buyer_id,
          offer_notif)

    # Buyer should NOT see seller's notifications
    status, buyer_items = call("GET", "/notifications", token=buyer_tok)
    check("buyer does not see seller notifications",
          status == 200 and buyer_items["total"] == 0, (status, buyer_items))

    # -------------------------------------------------------------------
    # 3. OFFER_ACCEPTED: seller accepts → buyer gets notification
    # -------------------------------------------------------------------
    status, _ = call(
        "PATCH", f"/offers/{offer['id']}",
        {"status": "ACCEPTED"},
        token=seller_tok,
    )
    assert status == 200, (status, _)
    status, buyer_items = call("GET", "/notifications", token=buyer_tok)
    check("buyer got OFFER_ACCEPTED", status == 200 and buyer_items["total"] >= 1, (status, buyer_items))
    accept_notif = buyer_items["items"][0]
    check("accept_notif type OFFER_ACCEPTED",
          accept_notif["type"] == "OFFER_ACCEPTED" and accept_notif["user_id"] == buyer_id
          and accept_notif["actor_id"] == seller_id,
          accept_notif)

    # -------------------------------------------------------------------
    # 4. ORDER_PLACED: buyer checks out → seller gets notification
    # -------------------------------------------------------------------
    status, order = call(
        "POST", "/checkout/fixed-price",
        {"listing_id": listing["id"], "contact_email": "noti@example.com", "address": ADDR},
        token=buyer_tok,
    )
    assert status == 201, (status, order)
    status, seller_items = call("GET", "/notifications", token=seller_tok)
    check("seller got ORDER_PLACED", status == 200 and seller_items["total"] >= 2, (status, seller_items))
    order_notif = seller_items["items"][0]
    check("order_notif type ORDER_PLACED",
          order_notif["type"] == "ORDER_PLACED" and order_notif["user_id"] == seller_id,
          order_notif)

    # -------------------------------------------------------------------
    # 5. PAYMENT_SUCCEEDED: buyer pays → buyer gets notification
    # -------------------------------------------------------------------
    status, payment = call(
        "POST", f"/orders/{order['id']}/payment",
        {"idempotency_key": str(uuid.uuid4()), "simulate": "success"},
        token=buyer_tok,
    )
    assert status == 200, (status, payment)
    status, buyer_items = call("GET", "/notifications", token=buyer_tok)
    check("buyer got PAYMENT_SUCCEEDED", status == 200 and buyer_items["total"] >= 1, (status, buyer_items))
    pay_notif = buyer_items["items"][0]
    check("pay_notif type PAYMENT_SUCCEEDED",
          pay_notif["type"] == "PAYMENT_SUCCEEDED" and pay_notif["user_id"] == buyer_id,
          pay_notif)

    # -------------------------------------------------------------------
    # 6. REVIEW_RECEIVED: buyer reviews seller → seller gets notification
    # -------------------------------------------------------------------
    from sqlalchemy import text as sqlt
    db2 = SessionLocal()
    db2.execute(sqlt("UPDATE orders SET status = 'DELIVERED' WHERE id = :i"), {"i": order["id"]})
    db2.commit()
    db2.close()

    status, review = call(
        "POST", "/reviews",
        {"order_id": order["id"], "rating": 5, "comment": "Great item"},
        token=buyer_tok,
    )
    assert status == 201, (status, review)
    status, seller_items = call("GET", "/notifications", token=seller_tok)
    check("seller got REVIEW_RECEIVED", status == 200 and seller_items["total"] >= 3, (status, seller_items))
    review_notif = seller_items["items"][0]
    check("review_notif type REVIEW_RECEIVED",
          review_notif["type"] == "REVIEW_RECEIVED" and review_notif["user_id"] == seller_id,
          review_notif)

    # -------------------------------------------------------------------
    # 7. Newest first: first item should be most recent
    # -------------------------------------------------------------------
    status, all_items = call("GET", "/notifications", token=seller_tok)
    times = [i["created_at"] for i in all_items["items"]]
    check("newest first ordering", times == sorted(times, reverse=True), times)

    # -------------------------------------------------------------------
    # 8. Unread count
    # -------------------------------------------------------------------
    status, unread = call("GET", "/notifications/unread-count", token=seller_tok)
    check("unread count > 0", status == 200 and unread["count"] >= 3, (status, unread))

    # -------------------------------------------------------------------
    # 9. Mark single notification as read
    # -------------------------------------------------------------------
    target_id = seller_items["items"][0]["id"]
    status, patched = call("PATCH", f"/notifications/{target_id}/read", token=seller_tok)
    check("patch single read 200", status == 200 and patched["is_read"] is True, (status, patched))
    status, unread_after_single = call("GET", "/notifications/unread-count", token=seller_tok)
    check("unread decreased after patch", unread_after_single["count"] == unread["count"] - 1, (status, unread_after_single))

    # Patching already-read is idempotent
    status, _ = call("PATCH", f"/notifications/{target_id}/read", token=seller_tok)
    check("patch already-read is idempotent 200", status == 200, status)

    # -------------------------------------------------------------------
    # 10. Own-only constraint: cannot patch another user's notification
    # -------------------------------------------------------------------
    status, _ = call("PATCH", f"/notifications/{target_id}/read", token=buyer_tok)
    check("cannot patch another user notification", status == 403, status)

    # -------------------------------------------------------------------
    # 11. Unknown notification 404
    # -------------------------------------------------------------------
    status, _ = call("PATCH", f"/notifications/{uuid.uuid4()}/read", token=seller_tok)
    check("unknown notification 404", status == 404, status)

    # -------------------------------------------------------------------
    # 12. Mark all as read
    # -------------------------------------------------------------------
    status, _ = call("POST", "/notifications/mark-read", token=seller_tok)
    check("mark-all-read 204", status == 204, status)
    status, unread_after_all = call("GET", "/notifications/unread-count", token=seller_tok)
    check("unread is 0 after mark-all-read", unread_after_all["count"] == 0, (status, unread_after_all))

    # -------------------------------------------------------------------
    # 13. History preserved (read notifications still visible)
    # -------------------------------------------------------------------
    status, history = call("GET", "/notifications", token=seller_tok)
    check("history preserved after mark-all-read", status == 200 and history["total"] >= 3, (status, history))

    # -------------------------------------------------------------------
    # Cleanup
    # -------------------------------------------------------------------
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
                {"p": f"n%-{tag}@example.com"},
            ).all()
        ]
        if not uids:
            db.commit()
            return
        # Delete notifications first (no FK cascades from notifications to users on delete)
        for uid in uids:
            db.execute(text("DELETE FROM notifications WHERE user_id = :u OR actor_id = :u"), {"u": uid})

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
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"noticat-{tag}"})
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
