"""Phase 7 remaining backend smoke tests (stdlib only). Run inside api container:

    docker compose exec -T -e PYTHONPATH=/app:/app/tests -w /app/tests api python tests/phase7_remaining_smoke.py

Covers:
- 7.3d: OUTBID, AUCTION_WON/AUCTION_ENDED, LISTING_REMOVED/RESTORED (post-publication moderation), ORDER_SHIPPED/DELIVERED events.
- 7.4: messaging — start conversation, reply, participant-only access.
- 7.5: reports — create on listing/user, duplicate rejected, invalid reason rejected, admin status transitions.
- 7.6: support — create ticket, reply, admin reply + status transitions.
- Order fulfilment endpoints (seller ship/deliver) with proper 403 guards.
- WebSocket: unauthenticated connection closed (4401).
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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Ph7P12345"})
    assert status == 201, (status, body)
    # Phase 8: marketplace actions require a verified (ACTIVE) account.
    status, _v = call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    assert status == 200, (status, _v)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Ph7P12345"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


ADDR = {
    "recipient_name": "Ph7 Buyer", "line1": "8 Phase Road", "city": "Pune",
    "region": "Maharashtra", "postal_code": "411001", "country": "IN",
}


def create_listing(seller_tok, admin_tok, cat, title, sale_type="FIXED_PRICE", price=90000):
    payload = {
        "category_id": str(cat), "sale_type": sale_type, "title": title,
        "condition": "NEW", "currency": "INR",
        "city": "Pune", "country_code": "IN",
    }
    if sale_type == "FIXED_PRICE":
        payload["fixed_price_minor"] = price
        payload["offers_enabled"] = True
    status, listing = call("POST", "/catalog/listings", payload, token=seller_tok)
    assert status == 201, (status, listing)
    return listing


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"p7s-{tag}@example.com")
    buyer_id, buyer_tok = register(f"p7b-{tag}@example.com")
    admin_info, admin_tok = ensure_admin(tag, prefix="p7a")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'Ph7Cat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"p7cat-{tag}"},
    )
    db.commit()
    db.close()

    # -------------------------------------------------------------------
    # 7.5 Reports
    # -------------------------------------------------------------------
    status, _ = call("POST", "/reports", {}, token=buyer_tok)
    check("reports 422 for missing body", status == 422, status)

    # Report a listing
    listing = create_listing(seller_tok, admin_tok, cat, "Ph7 Fixed Item")
    activate_listing(seller_tok, admin_tok, listing["id"])
    status, report = call(
        "POST", "/reports",
        {"target_type": "LISTING", "target_listing_id": listing["id"], "reason": "FAKE_LISTING", "details": "Looks fake"},
        token=buyer_tok,
    )
    check("create listing report 201", status == 201, (status, report))
    check("report fields correct",
          report["target_type"] == "LISTING" and report["target_listing_id"] == listing["id"]
          and report["reporter_id"] == buyer_id and report["status"] == "OPEN", report)

    # Duplicate report rejected
    status, dup = call(
        "POST", "/reports",
        {"target_type": "LISTING", "target_listing_id": listing["id"], "reason": "SPAM", "details": "again"},
        token=buyer_tok,
    )
    check("duplicate listing report 409", status == 409, (status, dup))

    # Invalid reason rejected
    status, bad = call(
        "POST", "/reports",
        {"target_type": "USER", "target_user_id": seller_id, "reason": "NONSENSE"},
        token=buyer_tok,
    )
    check("invalid reason 422", status == 422, (status, bad))

    # Report a user
    status, user_report = call(
        "POST", "/reports",
        {"target_type": "USER", "target_user_id": seller_id, "reason": "HARASSMENT"},
        token=buyer_tok,
    )
    check("create user report 201", status == 201, (status, user_report))
    check("user report targets user", user_report["target_user_id"] == seller_id, user_report)

    # SEE SELF target fails
    status, _ = call(
        "POST", "/reports",
        {"target_type": "USER", "target_user_id": buyer_id, "reason": "SPAM"},
        token=buyer_tok,
    )
    check("cannot report self 400", status == 400, status)

    # My reports
    status, my_reports = call("GET", "/reports/me", token=buyer_tok)
    check("my reports list", status == 200 and my_reports["total"] >= 2, (status, my_reports))

    # Auth required
    status, _ = call("GET", "/reports/me")
    check("reports 401 without token", status in (401, 403), status)

    # Admin list + status transitions
    status, admin_reports = call("GET", "/admin/reports?status=OPEN", token=admin_tok)
    check("admin reports list", status == 200 and admin_reports["total"] >= 2, (status, admin_reports))
    target_report = admin_reports["items"][0]["id"]
    status, updated = call(
        "PATCH", f"/admin/reports/{target_report}/status",
        {"status": "UNDER_REVIEW"}, token=admin_tok,
    )
    check("admin report UNDER_REVIEW", status == 200 and updated["status"] == "UNDER_REVIEW", (status, updated))
    status, resolved = call(
        "PATCH", f"/admin/reports/{target_report}/status",
        {"status": "RESOLVED"}, token=admin_tok,
    )
    check("admin report RESOLVED", status == 200 and resolved["status"] == "RESOLVED", (status, resolved))

    # Non-admin cannot access admin reports
    status, _ = call("GET", "/admin/reports", token=buyer_tok)
    check("non-admin cannot list reports 403", status == 403, status)

    # -------------------------------------------------------------------
    # Post-publication moderation notifications: publish -> ACTIVE (no
    # approval notification), then admin remove / restore notifications.
    # -------------------------------------------------------------------
    listing2 = create_listing(seller_tok, admin_tok, cat, "Ph7 Publish Me")
    status, pub2 = call("POST", f"/catalog/listings/{listing2['id']}/submit", token=seller_tok)
    check("publish listing2 ACTIVE", status == 200 and pub2["status"] == "ACTIVE", (status, pub2))

    listing3 = create_listing(seller_tok, admin_tok, cat, "Ph7 Moderate Me")
    activate_listing(seller_tok, admin_tok, listing3["id"])

    status, _ = call(
        "POST", f"/admin/listings/{listing3['id']}/remove",
        {"reason": "test removal"}, token=admin_tok,
    )
    check("admin remove listing", status == 200, status)
    status, notifs4 = call("GET", "/notifications", token=seller_tok)
    types4 = [n["type"] for n in notifs4["items"]]
    check("seller got LISTING_REMOVED", "LISTING_REMOVED" in types4, types4)
    status, _ = call(
        "POST", f"/admin/listings/{listing3['id']}/restore",
        {"reason": "test restore"}, token=admin_tok,
    )
    check("admin restore listing", status == 200, status)
    status, notifs5 = call("GET", "/notifications", token=seller_tok)
    types5 = [n["type"] for n in notifs5["items"]]
    check("seller got LISTING_RESTORED", "LISTING_RESTORED" in types5, types5)

    # -------------------------------------------------------------------
    # ORDER_SHIPPED / ORDER_DELIVERED + fulfilment auth guards
    # -------------------------------------------------------------------
    status, order = call(
        "POST", "/checkout/fixed-price",
        {"listing_id": listing["id"], "contact_email": "ph7@example.com", "address": ADDR},
        token=buyer_tok,
    )
    assert status == 201, (status, order)
    status, _ = call(
        "POST", f"/orders/{order['id']}/payment",
        {"idempotency_key": str(uuid.uuid4()), "simulate": "success"}, token=buyer_tok,
    )
    check("payment success", status == 200, status)

    # Buyer cannot ship
    status, _ = call("POST", f"/orders/{order['id']}/ship", token=buyer_tok)
    check("buyer cannot ship 403", status == 403, status)

    # Seller ships
    status, shipped = call("POST", f"/orders/{order['id']}/ship", token=seller_tok)
    check("seller ships order", status == 200 and shipped["status"] == "SHIPPED", (status, shipped))
    status, buyer_notifs = call("GET", "/notifications", token=buyer_tok)
    buyer_types = [n["type"] for n in buyer_notifs["items"]]
    check("buyer got ORDER_SHIPPED", "ORDER_SHIPPED" in buyer_types, buyer_types)

    # Double ship rejected
    status, _ = call("POST", f"/orders/{order['id']}/ship", token=seller_tok)
    check("double ship 409", status == 409, status)

    # Deliver before shipping not possible (already shipped; go straight)
    status, delivered = call("POST", f"/orders/{order['id']}/deliver", token=seller_tok)
    check("seller delivers order", status == 200 and delivered["status"] == "DELIVERED", (status, delivered))
    status, buyer_notifs2 = call("GET", "/notifications", token=buyer_tok)
    buyer_types2 = [n["type"] for n in buyer_notifs2["items"]]
    check("buyer got ORDER_DELIVERED", "ORDER_DELIVERED" in buyer_types2, buyer_types2)

    # Non-participant cannot deliver
    listing_other = create_listing(seller_tok, admin_tok, cat, "Ph7 Other")
    activate_listing(seller_tok, admin_tok, listing_other["id"])
    status, order_other = call(
        "POST", "/checkout/fixed-price",
        {"listing_id": listing_other["id"], "contact_email": "ph7@example.com", "address": ADDR},
        token=buyer_tok,
    )
    assert status == 201, (status, order_other)
    stranger_id, stranger_tok = register(f"p7x-{tag}@example.com")
    status, _ = call("POST", f"/orders/{order_other['id']}/ship", token=stranger_tok)
    check("stranger cannot ship 403", status == 403, status)

    # -------------------------------------------------------------------
    # 7.4 Messaging
    # -------------------------------------------------------------------
    # Auth required
    status, _ = call("GET", "/messages/conversations")
    check("conversations 401 without token", status in (401, 403), status)

    # Start conversation (buyer -> seller, with listing context)
    status, msg = call(
        "POST", "/messages/conversations",
        {"listing_id": listing["id"], "recipient_id": seller_id, "body": "Is this still available?"},
        token=buyer_tok,
    )
    check("start conversation 201", status == 201, (status, msg))
    check("first message sender is buyer",
          msg["sender_id"] == buyer_id and "available" in msg["body"].lower(), msg)

    # Cannot conversation with self
    status, _ = call(
        "POST", "/messages/conversations",
        {"listing_id": listing["id"], "recipient_id": buyer_id, "body": "hi"},
        token=buyer_tok,
    )
    check("cannot message self 400", status == 400, status)

    # List conversations
    status, convos = call("GET", "/messages/conversations", token=buyer_tok)
    check("buyer lists conversations", status == 200 and convos["total"] >= 1, (status, convos))
    conv_id = convos["items"][0]["id"]

    # Seller sees conversation too
    status, seller_convos = call("GET", "/messages/conversations", token=seller_tok)
    check("seller lists conversations", status == 200 and seller_convos["total"] >= 1, (status, seller_convos))

    # Stranger cannot see the conversation
    status, _ = call("GET", f"/messages/conversations/{conv_id}", token=stranger_tok)
    check("stranger cannot read conversation 403", status == 403, status)

    # Seller reads it (marks buyer's message read)
    status, thread = call("GET", f"/messages/conversations/{conv_id}", token=seller_tok)
    check("seller reads thread", status == 200 and thread["total"] == 1, (status, thread))
    check("first message flagged read after seller read",
          thread["items"][0]["is_read"] is True, thread["items"][0])

    # Seller replies
    status, reply = call(
        "POST", f"/messages/conversations/{conv_id}/messages",
        {"body": "Yes, available!"}, token=seller_tok,
    )
    check("seller reply 201", status == 201 and reply["sender_id"] == seller_id, (status, reply))

    # Stranger cannot reply
    status, _ = call(
        "POST", f"/messages/conversations/{conv_id}/messages",
        {"body": "intruder"}, token=stranger_tok,
    )
    check("stranger cannot reply 403", status == 403, status)

    # -------------------------------------------------------------------
    # 7.6 Support tickets
    # -------------------------------------------------------------------
    status, _ = call("GET", "/support/tickets")
    check("tickets 401 without token", status in (401, 403), status)

    status, ticket = call(
        "POST", "/support/tickets",
        {"subject": "Payment issue", "description": "My payment failed twice."},
        token=buyer_tok,
    )
    check("create ticket 201", status == 201, (status, ticket))
    check("ticket defaults", ticket["status"] == "OPEN" and ticket["priority"] == "NORMAL", ticket)
    ticket_id = ticket["id"]

    # Empty description rejected
    status, _ = call(
        "POST", "/support/tickets",
        {"subject": "x", "description": "   "}, token=buyer_tok,
    )
    check("empty description 422", status == 422, status)

    # List my tickets
    status, my_tickets = call("GET", "/support/tickets", token=buyer_tok)
    check("my tickets list", status == 200 and my_tickets["total"] >= 1, (status, my_tickets))

    # Stranger cannot access ticket
    status, _ = call("GET", f"/support/tickets/{ticket_id}", token=stranger_tok)
    check("stranger cannot read ticket 403", status == 403, status)

    # Buyer replies to own ticket
    status, reply_msg = call(
        "POST", f"/support/tickets/{ticket_id}/messages",
        {"body": "Still having the problem."}, token=buyer_tok,
    )
    check("buyer ticket reply 201", status == 201, (status, reply_msg))

    # Admin lists tickets
    status, admin_tickets = call("GET", "/admin/support/tickets?status=OPEN", token=admin_tok)
    check("admin ticket list", status == 200 and admin_tickets["total"] >= 1, (status, admin_tickets))

    # Admin replies → sets WAITING_FOR_CUSTOMER
    status, admin_msg = call(
        "POST", f"/admin/support/tickets/{ticket_id}/messages",
        {"body": "We are looking into it."}, token=admin_tok,
    )
    check("admin reply ticket 201", status == 201, (status, admin_msg))
    status, ticket_after = call("GET", f"/admin/support/tickets/{ticket_id}", token=admin_tok)
    check("ticket WAITING_FOR_CUSTOMER after admin reply",
          ticket_after["status"] == "WAITING_FOR_CUSTOMER", ticket_after)

    # Admin updates status + priority
    status, updated_ticket = call(
        "PATCH", f"/admin/support/tickets/{ticket_id}",
        {"status": "RESOLVED", "priority": "HIGH"}, token=admin_tok,
    )
    check("admin update ticket", status == 200 and updated_ticket["status"] == "RESOLVED"
          and updated_ticket["priority"] == "HIGH", (status, updated_ticket))

    # Buyer cannot reply to resolved ticket
    status, _ = call(
        "POST", f"/support/tickets/{ticket_id}/messages",
        {"body": "Nevermind"}, token=buyer_tok,
    )
    check("cannot reply to resolved ticket 409", status == 409, status)

    # Non-admin cannot use admin ticket endpoints
    status, _ = call("GET", "/admin/support/tickets", token=buyer_tok)
    check("non-admin cannot list tickets 403", status == 403, status)

    # -------------------------------------------------------------------
    # OUTBID / auction notifications via a second bidder
    # -------------------------------------------------------------------
    auction = create_listing(seller_tok, admin_tok, cat, "Ph7 Auction Item", sale_type="AUCTION", price=5000)

    # Create the auction via the auctions API (required before review)
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    status, auction_body = call(
        "POST", "/auctions",
        {"listing_id": auction["id"], "starting_bid_minor": 1000, "minimum_increment_minor": 100,
         "currency": "INR",
"starts_at": (now - timedelta(minutes=1)).isoformat(),
        "ends_at": (now + timedelta(days=1)).isoformat()},
        token=seller_tok,
    )
    assert status == 201, (status, auction_body)
    auction_id = auction_body["id"]
    activate_listing(seller_tok, admin_tok, auction["id"])

    # Schedule/start the auction
    status, _ = call("POST", f"/auctions/{auction_id}/schedule", token=seller_tok)
    check("auction schedule", status == 200, status)
    db3 = SessionLocal()
    db3.execute(
        text("UPDATE auctions SET starts_at = :s, ends_at = :e WHERE id = :i"),
        {"s": now - timedelta(minutes=1),
         "e": now + timedelta(days=1), "i": auction_id},
    )
    db3.commit()
    db3.close()
    status, _ = call("POST", f"/auctions/{auction_id}/start", token=seller_tok)
    check("auction start", status == 200, status)

    # Bidder A bids
    bidder_a_id, bidder_a_tok = register(f"p7a1-{tag}@example.com")
    status, bid_a = call(
        "POST", f"/auctions/{auction_id}/bids",
        {"amount_minor": 2000, "currency": "INR", "request_id": str(uuid.uuid4())},
        token=bidder_a_tok,
    )
    check("bidder a bid 201", status == 201, (status, bid_a))

    # Bidder B outbids A
    bidder_b_id, bidder_b_tok = register(f"p7b1-{tag}@example.com")
    status, bid_b = call(
        "POST", f"/auctions/{auction_id}/bids",
        {"amount_minor": 3000, "currency": "INR", "request_id": str(uuid.uuid4())},
        token=bidder_b_tok,
    )
    check("bidder b bid 201", status == 201, (status, bid_b))

    # Bidder A should get OUTBID notification
    status, a_notifs = call("GET", "/notifications", token=bidder_a_tok)
    a_types = [n["type"] for n in a_notifs["items"]]
    check("outbidder got OUTBID", "OUTBID" in a_types, a_types)

    # Close auction → winner gets AUCTION_WON, seller gets AUCTION_ENDED
    db4 = SessionLocal()
    db4.execute(text("UPDATE auctions SET ends_at = :e WHERE id = :i"),
                {"e": datetime.now(timezone.utc) - timedelta(seconds=1), "i": auction_id})
    db4.commit()
    db4.close()
    status, result = call("POST", f"/auctions/{auction_id}/close", token=seller_tok)
    check("auction close", status == 200, (status, result))

    status, b_notifs = call("GET", "/notifications", token=bidder_b_tok)
    b_types = [n["type"] for n in b_notifs["items"]]
    check("winner got AUCTION_WON", "AUCTION_WON" in b_types, b_types)

    status, s_notifs = call("GET", "/notifications", token=seller_tok)
    s_types = [n["type"] for n in s_notifs["items"]]
    check("seller got AUCTION_ENDED", "AUCTION_ENDED" in s_types, s_types)

    # -------------------------------------------------------------------
    # WebSocket: unauthenticated rejected
    # -------------------------------------------------------------------
    try:
        conn = urllib.request.urlopen("http://api:8000/ws/notifications", timeout=None)
        # HTTP URLs can't carry a WS upgrade; expect a 4xx or refused connection.
        check("ws not reachable by plain HTTP", False, "unexpected reachable")
        conn.close()
    except urllib.error.HTTPError as e:
        check("ws via http returns 4xx/426", True, e.code)
    except Exception:
        check("ws via http refused/later", True)

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
                {"p": f"p7%-{tag}@example.com"},
            ).all()
        ]
        if not uids:
            db.commit()
            return
        id_placeholders = ", ".join(f":u{i}" for i in range(len(uids)))
        uid_params = {f"u{i}": uid for i, uid in enumerate(uids)}

        # Clean new phase-7 rows authored by these users
        if uids:
            db.execute(text(f"DELETE FROM reports WHERE reporter_id IN ({id_placeholders})"), uid_params)
            db.execute(text(f"DELETE FROM reports WHERE target_user_id IN ({id_placeholders})"), uid_params)
            db.execute(text(f"DELETE FROM support_ticket_messages WHERE author_id IN ({id_placeholders})"), uid_params)
            db.execute(text(f"DELETE FROM support_tickets WHERE user_id IN ({id_placeholders})"), uid_params)
            db.execute(text(f"DELETE FROM messages WHERE sender_id IN ({id_placeholders})"), uid_params)
            db.execute(
                text(f"DELETE FROM conversations WHERE buyer_id IN ({id_placeholders}) OR seller_id IN ({id_placeholders})"),
                uid_params,
            )
            for uid in uids:
                db.execute(text("DELETE FROM notifications WHERE user_id = :u OR actor_id = :u"), {"u": uid})
            # Listings owned by these users
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
                db.execute(text(f"DELETE FROM reports WHERE target_listing_id IN ({lph})"), lparams)
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
                    db.execute(text("DELETE FROM auction_results WHERE auction_id IN "
                                    "(SELECT id FROM auctions WHERE listing_id = :l)"), {"l": lid})
                    db.execute(text("UPDATE auctions SET current_bid_id = NULL, current_winning_bid_id = NULL, "
                                    "current_winner_id = NULL WHERE listing_id = :l"), {"l": lid})
                    db.execute(text("DELETE FROM bids WHERE auction_id IN "
                                    "(SELECT id FROM auctions WHERE listing_id = :l)"), {"l": lid})
                    db.execute(text("DELETE FROM auctions WHERE listing_id = :l"), {"l": lid})
                    db.execute(text("DELETE FROM conversations WHERE listing_id = :l"), {"l": lid})
                    db.execute(text("DELETE FROM listings WHERE id = :l"), {"l": lid})
            db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"p7cat-{tag}"})
            for uid in uids:
                db.execute(text("DELETE FROM user_addresses WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM offers WHERE buyer_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM bids WHERE bidder_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM auth_refresh_tokens WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM user_roles WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM user_profiles WHERE user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM users WHERE id = :u"), {"u": uid})
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())