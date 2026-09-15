"""Phase 8.3 auction reserve-price enforcement smoke tests (stdlib only):

    docker compose exec -T -e PYTHONPATH=/app:/app/tests api python /app/tests/auction_reserve_smoke.py

Covers settlement for: highest bid below reserve (no winner, NO_BIDS, no
checkout/order state), exactly-at-reserve (winner), above-reserve
(winner), no bids (unchanged), multiple bids with highest below reserve
(still no winner, no WON flips), NULL reserve (unrestricted), and
concurrent/duplicate close safety (exactly one result row). Cleans up.
"""

from __future__ import annotations

import json
import sys
import threading
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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Rsv12345"})
    assert status == 201, (status, body)
    # Phase 8: marketplace actions require a verified (ACTIVE) account.
    status, _v = call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    assert status == 200, (status, _v)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Rsv12345"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


ADDR = {
    "recipient_name": "Reserve Buyer", "line1": "5 Reserve Street", "city": "Jodhpur",
    "region": "Rajasthan", "postal_code": "342001", "country": "IN",
}


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def db_session():
    from app.db.session import SessionLocal

    return SessionLocal()


def make_auction(cat, seller_tok, admin_tok, bidder_toks, *, reserve_minor,
                  amounts, title):
    """Full cycle: AUCTION listing + auction (reserve) -> publish -> LIVE ->
    bids (amounts, one per bidder token, bid order preserved) -> close.
    Returns (listing_id, auction_id, result)."""

    from sqlalchemy import text

    status, listing = call("POST", "/catalog/listings",
                           {"category_id": str(cat), "sale_type": "AUCTION",
                            "title": title, "condition": "GOOD", "currency": "INR",
                            "city": "Jodhpur", "country_code": "IN"},
                           token=seller_tok)
    assert status == 201, (status, listing)
    lid = listing["id"]
    # Two-step workflow: the auction row must exist before submit/approve.
    now = datetime.now(timezone.utc)
    payload = {
        "listing_id": lid, "starting_bid_minor": 10000,
        "minimum_increment_minor": 1000, "currency": "INR",
        "starts_at": iso(now - timedelta(hours=2)),
        "ends_at": iso(now + timedelta(hours=2)),
    }
    if reserve_minor is not None:
        payload["reserve_minor"] = reserve_minor
    status, auc = call("POST", "/auctions", payload, token=seller_tok)
    assert status == 201, (status, auc)
    aid = auc["id"]
    check(f"{title}: reserve persisted", auc["reserve_minor"] == reserve_minor,
          auc.get("reserve_minor"))
    activate_listing(seller_tok, admin_tok, lid)
    assert call("POST", f"/auctions/{aid}/schedule", token=seller_tok)[0] == 200
    assert call("POST", f"/auctions/{aid}/start", token=seller_tok)[0] == 200
    for tok, amount in zip(bidder_toks, amounts):
        status, bid = call("POST", f"/auctions/{aid}/bids",
                           {"amount_minor": amount, "currency": "INR",
                            "request_id": str(uuid.uuid4())},
                           token=tok)
        assert status == 201, (status, bid)
    db = db_session()
    db.execute(text("UPDATE auctions SET ends_at = now() - interval '1 minute' WHERE id = :i"),
               {"i": aid})
    db.commit()
    db.close()
    status, res = call("POST", f"/auctions/{aid}/close", token=seller_tok)
    assert status == 200, (status, res)
    return lid, aid, res


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"rseller-{tag}@example.com")
    b1_id, b1_tok = register(f"rbidder1-{tag}@example.com")
    b2_id, b2_tok = register(f"rbidder2-{tag}@example.com")
    _, admin_tok = ensure_admin(tag, prefix="radmin")

    from sqlalchemy import text

    db = db_session()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'RsvCat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"rsvcat-{tag}"},
    )
    db.commit()
    db.close()

    # -----------------------------------------------------------------
    # 1. highest bid BELOW reserve -> no winner, no checkout state
    # -----------------------------------------------------------------
    lid1, aid1, res1 = make_auction(
        cat, seller_tok, admin_tok, [b1_tok], reserve_minor=50000,
        amounts=[30000], title="Below Reserve Rug",
    )
    check("below reserve -> NO_BIDS", res1["status"] == "NO_BIDS", res1)
    check("below reserve -> no winner fields",
          res1["winning_bid_id"] is None and res1["winner_id"] is None
          and res1["final_price_minor"] is None, res1)
    status, auction1 = call("GET", f"/auctions/{aid1}", token=seller_tok)
    check("below reserve -> auction ENDED", auction1["status"] == "ENDED", auction1.get("status"))
    status, ldet1 = call("GET", f"/catalog/listings/{lid1}")
    check("below reserve -> listing stays ACTIVE (no reservation)",
          ldet1["status"] == "ACTIVE", ldet1.get("status"))
    status, bids1 = call("GET", f"/auctions/{aid1}/bids")
    won1 = [b for b in bids1["items"] if b["status"] == "WON"]
    check("below reserve -> no bid flipped WON",
          len(won1) == 0 and all(b["status"] in ("WINNING", "OUTBID")
                                 for b in bids1["items"]),
          [(b["amount_minor"], b["status"]) for b in bids1["items"]])
    # no winner checkout state: checkout must 409 and no order may exist
    status, _ = call("POST", "/checkout/auction",
                     {"auction_result_id": res1["id"], "contact_email": "b@b.com",
                      "address": ADDR}, token=b1_tok)
    check("below reserve -> winner checkout 409", status == 409, status)
    db = db_session()
    orders1 = db.execute(text("SELECT count(*) FROM orders WHERE listing_id = :l"),
                         {"l": lid1}).scalar()
    result_row1 = db.execute(
        text("SELECT winning_bid_id, winner_id, final_price_minor, checkout_expires_at "
             "FROM auction_results WHERE id = :r"), {"r": res1["id"]}).first()
    won_rows1 = db.execute(text("SELECT count(*) FROM bids WHERE auction_id = :a AND status = 'WON'"),
                           {"a": aid1}).scalar()
    db.close()
    check("below reserve -> zero order rows", orders1 == 0, orders1)
    check("below reserve -> result row has no winner/checkout fields",
          result_row1 == (None, None, None, None), result_row1)
    check("below reserve -> zero WON bid rows", won_rows1 == 0, won_rows1)
    # idempotent re-close returns the same NO_BIDS result
    status, again1 = call("POST", f"/auctions/{aid1}/close", token=seller_tok)
    check("below reserve -> close idempotent", status == 200
          and again1["id"] == res1["id"] and again1["status"] == "NO_BIDS", (status, again1))

    # -----------------------------------------------------------------
    # 2. highest bid EXACTLY at reserve -> winner (existing flow)
    # -----------------------------------------------------------------
    lid2, aid2, res2 = make_auction(
        cat, seller_tok, admin_tok, [b1_tok], reserve_minor=50000,
        amounts=[50000], title="At Reserve Lamp",
    )
    check("at reserve -> AWAITING_CHECKOUT", res2["status"] == "AWAITING_CHECKOUT", res2)
    check("at reserve -> winner is bidder",
          res2["winner_id"] == b1_id and res2["winning_bid_id"] is not None
          and res2["final_price_minor"] == 50000
          and res2["checkout_expires_at"] is not None, res2)
    status, bids2 = call("GET", f"/auctions/{aid2}/bids")
    check("at reserve -> bid WON", any(
        b["status"] == "WON" and b["amount_minor"] == 50000 for b in bids2["items"]),
        [(b["amount_minor"], b["status"]) for b in bids2["items"]])
    # full winner flow works: checkout + payment settle
    status, order2 = call("POST", "/checkout/auction",
                          {"auction_result_id": res2["id"],
                           "contact_email": "b1@example.com", "address": ADDR},
                          token=b1_tok)
    check("at reserve -> winner checkout 201", status == 201
          and order2["source"] == "AUCTION_WIN" and order2["buyer_id"] == b1_id
          and order2["total_minor"] == 50000, (status, order2))
    status, pay2 = call("POST", f"/orders/{order2['id']}/payment",
                        {"idempotency_key": str(uuid.uuid4())}, token=b1_tok)
    check("at reserve -> payment settles", status == 200
          and pay2["order"]["status"] == "PAID", (status, pay2))
    status, res2b = call("GET", f"/auctions/{aid2}/result", token=seller_tok)
    check("at reserve -> result PAYMENT_COMPLETED", res2b["status"] == "PAYMENT_COMPLETED", res2b)

    # -----------------------------------------------------------------
    # 3. highest bid ABOVE reserve -> winner (existing flow)
    # -----------------------------------------------------------------
    lid3, aid3, res3 = make_auction(
        cat, seller_tok, admin_tok, [b1_tok, b2_tok], reserve_minor=50000,
        amounts=[55000, 70000], title="Above Reserve Carpet",
    )
    check("above reserve -> AWAITING_CHECKOUT", res3["status"] == "AWAITING_CHECKOUT", res3)
    check("above reserve -> highest bidder wins",
          res3["winner_id"] == b2_id and res3["final_price_minor"] == 70000, res3)
    status, bids3 = call("GET", f"/auctions/{aid3}/bids")
    won3 = [b for b in bids3["items"] if b["status"] == "WON"]
    check("above reserve -> exactly one WON (highest)",
          len(won3) == 1 and won3[0]["amount_minor"] == 70000
          and won3[0]["bidder_id"] == b2_id,
          [(b["amount_minor"], b["status"]) for b in bids3["items"]])
    status, order3 = call("POST", "/checkout/auction",
                          {"auction_result_id": res3["id"],
                           "contact_email": "b2@example.com", "address": ADDR},
                          token=b2_tok)
    check("above reserve -> winner checkout 201", status == 201
          and order3["buyer_id"] == b2_id and order3["total_minor"] == 70000,
          (status, order3))

    # -----------------------------------------------------------------
    # 4. NO bids (with reserve set) -> unchanged NO_BIDS behavior
    # -----------------------------------------------------------------
    lid4, aid4, res4 = make_auction(
        cat, seller_tok, admin_tok, [], reserve_minor=50000,
        amounts=[], title="No Bids Throne",
    )
    check("no bids -> NO_BIDS", res4["status"] == "NO_BIDS"
          and res4["winning_bid_id"] is None and res4["winner_id"] is None
          and res4["final_price_minor"] is None, res4)
    status, ldet4 = call("GET", f"/catalog/listings/{lid4}")
    check("no bids -> listing stays ACTIVE", ldet4["status"] == "ACTIVE", ldet4.get("status"))

    # -----------------------------------------------------------------
    # 5. multiple bids, highest below reserve -> still no winner
    # -----------------------------------------------------------------
    lid5, aid5, res5 = make_auction(
        cat, seller_tok, admin_tok, [b1_tok, b2_tok, b1_tok], reserve_minor=90000,
        amounts=[20000, 30000, 40000], title="Multi Below Reserve Vase",
    )
    check("multi below reserve -> NO_BIDS", res5["status"] == "NO_BIDS", res5)
    check("multi below reserve -> no winner fields",
          res5["winning_bid_id"] is None and res5["winner_id"] is None
          and res5["final_price_minor"] is None, res5)
    status, bids5 = call("GET", f"/auctions/{aid5}/bids")
    won5 = [b for b in bids5["items"] if b["status"] == "WON"]
    check("multi below reserve -> no WON flips", len(won5) == 0,
          [(b["amount_minor"], b["status"]) for b in bids5["items"]])
    status, _ = call("POST", "/checkout/auction",
                     {"auction_result_id": res5["id"], "contact_email": "b@b.com",
                      "address": ADDR}, token=b2_tok)
    check("multi below reserve -> checkout 409", status == 409, status)
    db = db_session()
    orders5 = db.execute(text("SELECT count(*) FROM orders WHERE listing_id = :l"),
                         {"l": lid5}).scalar()
    db.close()
    check("multi below reserve -> zero order rows", orders5 == 0, orders5)

    # -----------------------------------------------------------------
    # 6. NULL reserve -> unrestricted (existing behavior preserved)
    # -----------------------------------------------------------------
    lid6, aid6, res6 = make_auction(
        cat, seller_tok, admin_tok, [b1_tok], reserve_minor=None,
        amounts=[12000], title="Null Reserve Chair",
    )
    check("null reserve -> low bid still wins", res6["status"] == "AWAITING_CHECKOUT"
          and res6["winner_id"] == b1_id and res6["final_price_minor"] == 12000, res6)

    # -----------------------------------------------------------------
    # 7. concurrent close on a below-reserve auction -> exactly one result
    # -----------------------------------------------------------------
    status, listing7 = call("POST", "/catalog/listings",
                            {"category_id": str(cat), "sale_type": "AUCTION",
                             "title": "Race Below Reserve Table", "condition": "GOOD",
                             "currency": "INR", "city": "Jodhpur", "country_code": "IN"},
                            token=seller_tok)
    assert status == 201, (status, listing7)
    lid7 = listing7["id"]
    now = datetime.now(timezone.utc)
    status, auc7 = call("POST", "/auctions",
                        {"listing_id": lid7, "starting_bid_minor": 10000,
                         "minimum_increment_minor": 1000, "reserve_minor": 80000,
                         "currency": "INR",
                         "starts_at": iso(now - timedelta(hours=2)),
                         "ends_at": iso(now + timedelta(hours=2))},
                        token=seller_tok)
    assert status == 201, (status, auc7)
    a7 = auc7["id"]
    activate_listing(seller_tok, admin_tok, lid7)
    call("POST", f"/auctions/{a7}/schedule", token=seller_tok)
    call("POST", f"/auctions/{a7}/start", token=seller_tok)
    status, _ = call("POST", f"/auctions/{a7}/bids",
                     {"amount_minor": 25000, "currency": "INR",
                      "request_id": str(uuid.uuid4())}, token=b1_tok)
    assert status == 201, status
    db = db_session()
    db.execute(text("UPDATE auctions SET ends_at = now() - interval '1 minute' WHERE id = :i"),
               {"i": a7})
    db.commit()
    db.close()

    barrier = threading.Barrier(4)
    outcomes = []

    def _close():
        barrier.wait()
        s, b = call("POST", f"/auctions/{a7}/close", token=seller_tok)
        outcomes.append((s, b.get("id"), b.get("status")))

    threads = [threading.Thread(target=_close) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    ids = {o[1] for o in outcomes}
    check("concurrent close -> all succeed, one result id",
          all(s == 200 for s, _, _ in outcomes) and len(ids) == 1, outcomes)
    check("concurrent close -> below reserve stays NO_BIDS",
          all(st == "NO_BIDS" for _, _, st in outcomes), outcomes)
    db = db_session()
    result_count = db.execute(
        text("SELECT count(*) FROM auction_results WHERE auction_id = :a"), {"a": a7}
    ).scalar()
    db.close()
    check("concurrent close -> exactly one result row", result_count == 1, result_count)

    # -----------------------------------------------------------------
    # 8. no winner notification for the below-reserve top bidder
    # -----------------------------------------------------------------
    status, notifs = call("GET", "/notifications", token=b1_tok)
    won_notifs = [n for n in notifs["items"] if n["type"] == "AUCTION_WON"]
    won_auctions = {n.get("link") for n in won_notifs}
    check("below-reserve bidder never told AUCTION_WON",
          all("Below Reserve Rug" not in (n.get("body") or "")
              and "Multi Below Reserve Vase" not in (n.get("body") or "")
              and "Race Below Reserve Table" not in (n.get("body") or "")
              for n in won_notifs),
          [n.get("body") for n in won_notifs])

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
                {"p": f"r%-{tag}@example.com"},
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
            db.execute(text("DELETE FROM listings WHERE id = :l"), {"l": lid})
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"rsvcat-{tag}"})
        for prefix in ("rseller-", "rbidder1-", "rbidder2-", "radmin-"):
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
