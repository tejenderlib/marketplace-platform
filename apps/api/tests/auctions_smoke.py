"""Auctions + bids API smoke tests (stdlib only). Run inside the api container:

    docker compose run --rm -e PYTHONPATH=/app api python tests/auctions_smoke.py

Covers creation, retrieval, discovery, lifecycle, bidding rules, idempotency
(serial + concurrent), competing-bid concurrency, close/winner, results
visibility. Cleans up all rows created.
"""

from __future__ import annotations

import json
import sys
import threading
import urllib.error
import urllib.request
import uuid
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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Bid12345"})
    assert status == 201, (status, body)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Bid12345"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"aseller-{tag}@example.com")
    b1_id, b1_tok = register(f"bidder1-{tag}@example.com")
    b2_id, b2_tok = register(f"bidder2-{tag}@example.com")
    b3_id, b3_tok = register(f"bidder3-{tag}@example.com")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'AuctionCat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"auctioncat-{tag}"},
    )
    db.commit()

    def make_listing(token, **over):
        payload = {
            "category_id": str(cat), "sale_type": "AUCTION", "title": "Bronze Nandi Statue",
            "condition": "GOOD", "currency": "INR", "city": "Jaipur", "country_code": "IN",
        }
        payload.update(over)
        status, body = call("POST", "/catalog/listings", payload, token=token)
        assert status == 201, (status, body)
        status, active = call("PATCH", f"/catalog/listings/{body['id']}", {"status": "ACTIVE"}, token=token)
        assert status == 200, (status, active)
        return body["id"]

    now = datetime.now(timezone.utc)
    fixed_id = make_listing(seller_tok, sale_type="FIXED_PRICE", title="Fixed Item",
                            fixed_price_minor=50000)
    auc_listing = make_listing(seller_tok)

    def auction_payload(**over):
        payload = {
            "listing_id": auc_listing, "starting_bid_minor": 100000,
            "minimum_increment_minor": 5000, "currency": "INR",
            "starts_at": iso(now - timedelta(hours=1)),
            "ends_at": iso(now + timedelta(hours=2)),
        }
        payload.update(over)
        return payload

    # 1. auction creation
    status, auc = call("POST", "/auctions", auction_payload(), token=seller_tok)
    check("create 201 DRAFT", status == 201 and auc["status"] == "DRAFT"
          and auc["minimum_increment_minor"] == 5000 and auc["bid_count"] == 0
          and auc["current_winner_id"] is None, (status, auc))
    aid = auc["id"]
    status, _ = call("POST", "/auctions", auction_payload(), token=seller_tok)
    check("duplicate auction 409", status == 409, status)
    status, _ = call("POST", "/auctions",
                     {"listing_id": fixed_id, "starting_bid_minor": 10,
                      "minimum_increment_minor": 1, "currency": "INR",
                      "starts_at": iso(now), "ends_at": iso(now + timedelta(hours=1))},
                     token=seller_tok)
    check("fixed-price rejected 422", status == 422, status)
    status, _ = call("POST", "/auctions", auction_payload(), token=b1_tok)
    check("non-owner 403", status == 403, status)
    status, _ = call("POST", "/auctions", auction_payload())
    check("unauth create rejected", status in (401, 403), status)
    for label, bad in [
        ("ends<=starts 422", auction_payload(starts_at=iso(now + timedelta(hours=2)),
                                             ends_at=iso(now + timedelta(hours=1)))),
        ("increment 0 422", auction_payload(minimum_increment_minor=0)),
        ("USD 422", auction_payload(currency="USD")),
        ("missing listing 404", auction_payload(listing_id=str(uuid.uuid4()))),
    ]:
        # use a fresh listing for dup-free attempts where needed
        if label == "ends<=starts 422":
            lid = make_listing(seller_tok, title="Window Item")
            bad["listing_id"] = lid
        status, _ = call("POST", "/auctions", bad, token=seller_tok)
        check(label, status in (404, 422), (label, status))

    # 2. retrieval + discovery
    status, got = call("GET", f"/auctions/{aid}")
    check("retrieve 200", status == 200 and got["id"] == aid and got["bid_count"] == 0, status)
    status, _ = call("GET", f"/auctions/{uuid.uuid4()}")
    check("retrieve 404", status == 404, status)
    status, listed = call("GET", "/auctions?limit=5")
    check("list auctions", status == 200 and listed["total"] >= 1, listed.get("total"))
    status, _ = call("GET", "/auctions?phase=bogus")
    check("bad phase 422", status == 422, status)

    # 3. lifecycle DRAFT -> SCHEDULED -> LIVE, guards
    status, _ = call("POST", f"/auctions/{aid}/schedule", token=b1_tok)
    check("non-seller schedule 403", status == 403, status)
    status, sch = call("POST", f"/auctions/{aid}/schedule", token=seller_tok)
    check("schedule SCHEDULED", status == 200 and sch["status"] == "SCHEDULED", (status, sch))
    status, _ = call("POST", f"/auctions/{aid}/schedule", token=seller_tok)
    check("re-schedule 409", status == 409, status)
    future_listing = make_listing(seller_tok, title="Future Item")
    status, future_auc = call("POST", "/auctions",
                              {"listing_id": future_listing, "starting_bid_minor": 1000,
                               "minimum_increment_minor": 100, "currency": "INR",
                               "starts_at": iso(now + timedelta(hours=5)),
                               "ends_at": iso(now + timedelta(hours=6))},
                              token=seller_tok)
    assert status == 201, (status, future_auc)
    fid = future_auc["id"]
    call("POST", f"/auctions/{fid}/schedule", token=seller_tok)
    status, _ = call("POST", f"/auctions/{fid}/start", token=seller_tok)
    check("cannot start before starts_at 409", status == 409, status)
    status, live = call("POST", f"/auctions/{aid}/start", token=seller_tok)
    check("start LIVE", status == 200 and live["status"] == "LIVE", (status, live))
    status, _ = call("POST", f"/auctions/{aid}/close", token=seller_tok)
    check("cannot end early 409", status == 409, status)

    # 4. bidding rules
    req1 = str(uuid.uuid4())
    status, bid1 = call("POST", f"/auctions/{aid}/bids",
                        {"amount_minor": 100000, "currency": "INR", "request_id": req1},
                        token=b1_tok)
    check("first bid 201 WINNING", status == 201 and bid1["status"] == "WINNING"
          and bid1["bidder_id"] == b1_id, (status, bid1))
    status, detail = call("GET", f"/auctions/{aid}", token=seller_tok)
    check("current updated", detail["current_bid_minor"] == 100000
          and detail["current_winning_bid_id"] == bid1["id"]
          and detail["current_winner_id"] == b1_id and detail["bid_count"] == 1, detail)
    status, _ = call("POST", f"/auctions/{aid}/bids",
                     {"amount_minor": 104000, "currency": "INR", "request_id": str(uuid.uuid4())},
                     token=b2_tok)
    check("insufficient 422", status == 422, status)
    req2 = str(uuid.uuid4())
    status, bid2 = call("POST", f"/auctions/{aid}/bids",
                        {"amount_minor": 105000, "currency": "INR", "request_id": req2},
                        token=b2_tok)
    check("higher bid 201", status == 201, (status, bid2))
    status, hist = call("GET", f"/auctions/{aid}/bids")
    by_id = {b["id"]: b["status"] for b in hist["items"]}
    check("prev OUTBID/new WINNING", by_id.get(bid1["id"]) == "OUTBID"
          and by_id.get(bid2["id"]) == "WINNING" and hist["bid_count"] == 2, by_id)
    status, _ = call("POST", f"/auctions/{fid}/bids",
                     {"amount_minor": 5000, "currency": "INR", "request_id": str(uuid.uuid4())},
                     token=b1_tok)
    check("not LIVE 409", status == 409, status)
    status, _ = call("POST", f"/auctions/{aid}/bids",
                     {"amount_minor": 200000, "currency": "INR", "request_id": str(uuid.uuid4())},
                     token=seller_tok)
    check("seller cannot bid 403", status == 403, status)
    status, _ = call("POST", f"/auctions/{aid}/bids",
                     {"amount_minor": 200000, "currency": "INR", "request_id": str(uuid.uuid4())})
    check("unauth bid rejected", status in (401, 403), status)
    status, _ = call("POST", f"/auctions/{aid}/bids",
                     {"amount_minor": 200000, "currency": "USD", "request_id": str(uuid.uuid4())},
                     token=b3_tok)
    check("wrong currency 422", status == 422, status)
    db.execute(text("UPDATE users SET status = 'SUSPENDED' WHERE id = :u"), {"u": b3_id})
    db.commit()
    status, _ = call("POST", "/auth/login", {"email": f"bidder3-{tag}@example.com", "password": "Bid12345"})
    check("suspended login blocked", status == 403, status)
    db.execute(text("UPDATE users SET status = 'ACTIVE' WHERE id = :u"), {"u": b3_id})
    db.commit()

    # window: backdate ends_at on a scratch auction, bid must fail
    scratch_listing = make_listing(seller_tok, title="Scratch Item")
    status, scratch = call("POST", "/auctions",
                           {"listing_id": scratch_listing, "starting_bid_minor": 1000,
                            "minimum_increment_minor": 100, "currency": "INR",
                            "starts_at": iso(now - timedelta(hours=2)),
                            "ends_at": iso(now + timedelta(hours=2))},
                           token=seller_tok)
    assert status == 201, (status, scratch)
    sid = scratch["id"]
    call("POST", f"/auctions/{sid}/schedule", token=seller_tok)
    call("POST", f"/auctions/{sid}/start", token=seller_tok)
    db.execute(text("UPDATE auctions SET ends_at = now() - interval '1 minute' WHERE id = :i"), {"i": sid})
    db.commit()
    status, _ = call("POST", f"/auctions/{sid}/bids",
                     {"amount_minor": 5000, "currency": "INR", "request_id": str(uuid.uuid4())},
                     token=b1_tok)
    check("bid after end 409", status == 409, status)

    # 5. idempotency: same request twice + concurrent same request
    req_same = str(uuid.uuid4())
    payload = {"amount_minor": 110000, "currency": "INR", "request_id": req_same}
    status, first = call("POST", f"/auctions/{aid}/bids", payload, token=b1_tok)
    status2, second = call("POST", f"/auctions/{aid}/bids", payload, token=b1_tok)
    check("retry returns existing", status == 201 and status2 == 200
          and first["id"] == second["id"], (status, status2))
    req_race = str(uuid.uuid4())
    barrier = threading.Barrier(2)
    results = []

    def _race():
        barrier.wait()
        s, b = call("POST", f"/auctions/{aid}/bids",
                    {"amount_minor": 120000, "currency": "INR", "request_id": req_race},
                    token=b3_tok)
        results.append((s, b.get("id")))

    threads = [threading.Thread(target=_race) for _ in range(2)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    check("concurrent same request once", sorted(s for s, _ in results) == [200, 201]
          and results[0][1] == results[1][1], results)

    # 6. competing bids concurrency: invariants must hold regardless of order.
    # Floor at this point is 125000 (120k race winner + 5k increment).
    status, before = call("GET", f"/auctions/{aid}/bids?limit=100")
    accepted_before = len(before["items"])
    barrier2 = threading.Barrier(4)
    outcomes = []
    toks = [b1_tok, b2_tok, b3_tok, b1_tok]
    amounts = [130000, 140000, 150000, 160000]

    def _compete(i):
        barrier2.wait()
        s, b = call("POST", f"/auctions/{aid}/bids",
                    {"amount_minor": amounts[i], "currency": "INR",
                     "request_id": str(uuid.uuid4())},
                    token=toks[i])
        outcomes.append((s, b.get("id"), amounts[i]))

    workers = [threading.Thread(target=_compete, args=(i,)) for i in range(4)]
    [t.start() for t in workers]
    [t.join() for t in workers]
    check("only 201/422 outcomes", all(s in (201, 422) for s, _, _ in outcomes), outcomes)
    accepted = sorted(a for s, _, a in outcomes if s == 201)
    status, final = call("GET", f"/auctions/{aid}", token=seller_tok)
    check("authoritative highest wins", final["current_bid_minor"] == max(accepted)
          and final["bid_count"] == accepted_before + len(accepted), (final, accepted))
    status, full_hist = call("GET", f"/auctions/{aid}/bids?limit=100")
    winning = [b for b in full_hist["items"] if b["status"] == "WINNING"]
    check("exactly one WINNING", len(winning) == 1 and winning[0]["amount_minor"] == max(accepted)
          and winning[0]["id"] == final["current_winning_bid_id"], [(b["amount_minor"], b["status"]) for b in full_hist["items"]])
    top_amount = max(accepted)

    # 7. close: no-bids auction + auction with bids
    db.execute(text("UPDATE auctions SET ends_at = now() - interval '1 minute' WHERE id = :i"), {"i": sid})
    db.commit()
    status, close_empty = call("POST", f"/auctions/{sid}/close", token=seller_tok)
    check("close scratch NO_BIDS", status == 200 and close_empty["status"] == "NO_BIDS",
          (status, close_empty))
    # dedicated no-bid auction
    nb_listing = make_listing(seller_tok, title="No Bid Item")
    status, nb = call("POST", "/auctions",
                      {"listing_id": nb_listing, "starting_bid_minor": 5000,
                       "minimum_increment_minor": 500, "currency": "INR",
                       "starts_at": iso(now - timedelta(hours=3)),
                       "ends_at": iso(now + timedelta(hours=1))},
                      token=seller_tok)
    assert status == 201, (status, nb)
    nbid = nb["id"]
    call("POST", f"/auctions/{nbid}/schedule", token=seller_tok)
    call("POST", f"/auctions/{nbid}/start", token=seller_tok)
    db.execute(text("UPDATE auctions SET ends_at = now() - interval '1 minute' WHERE id = :i"), {"i": nbid})
    db.commit()
    status, nores = call("POST", f"/auctions/{nbid}/close", token=seller_tok)
    check("NO_BIDS result", status == 200 and nores["status"] == "NO_BIDS"
          and nores["winning_bid_id"] is None and nores["winner_id"] is None
          and nores["final_price_minor"] is None, (status, nores))
    status, nores2 = call("POST", f"/auctions/{nbid}/close", token=seller_tok)
    check("close idempotent", status == 200 and nores2["id"] == nores["id"], (status, nores2))

    # close the main auction (has bids)
    db.execute(text("UPDATE auctions SET ends_at = now() - interval '1 minute' WHERE id = :i"), {"i": aid})
    db.commit()
    status, res = call("POST", f"/auctions/{aid}/close", token=seller_tok)
    check("AWAITING_CHECKOUT", status == 200 and res["status"] == "AWAITING_CHECKOUT"
          and res["final_price_minor"] == top_amount and res["currency"] == "INR"
          and res["winner_id"] is not None and res["checkout_expires_at"] is not None,
          (status, res))
    status, bids_after = call("GET", f"/auctions/{aid}/bids?limit=100")
    won = [b for b in bids_after["items"] if b["status"] == "WON"]
    check("winner WON", len(won) == 1 and won[0]["id"] == res["winning_bid_id"]
          and won[0]["bidder_id"] == res["winner_id"], [(b["id"], b["status"]) for b in bids_after["items"]])
    status, res2 = call("POST", f"/auctions/{aid}/close", token=seller_tok)
    check("close idempotent w/ bids", status == 200 and res2["id"] == res["id"], (status, res2))
    n_results = db.execute(text("SELECT count(*) FROM auction_results WHERE auction_id = :i"), {"i": aid}).scalar()
    check("exactly one result", n_results == 1, n_results)

    # 8. result visibility
    status, pub = call("GET", f"/auctions/{aid}/result")
    check("stranger sees status only", status == 200 and pub["status"] == "AWAITING_CHECKOUT"
          and "winner_id" not in pub, pub)
    winner_tok = b1_tok if res["winner_id"] == b1_id else (b2_tok if res["winner_id"] == b2_id else b3_tok)
    status, full = call("GET", f"/auctions/{aid}/result", token=winner_tok)
    check("winner full entitlement", status == 200 and full.get("winner_id") == res["winner_id"]
          and full.get("final_price_minor") == top_amount, full)
    status, sell = call("GET", f"/auctions/{aid}/result", token=seller_tok)
    check("seller full result", status == 200 and sell.get("winner_id") is not None, sell)
    status, _ = call("GET", f"/auctions/{fid}/result", token=seller_tok)
    check("no result 404", status == 404, status)

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
        lids += [
            r[0]
            for r in db.execute(
                text("SELECT id FROM listings WHERE seller_id IN (SELECT id FROM users WHERE email LIKE :p)"),
                {"p": f"bidder%-{tag}@example.com"},
            ).all()
        ]
        for lid in lids:
            for aid in [r[0] for r in db.execute(text("SELECT id FROM auctions WHERE listing_id = :l"), {"l": lid}).all()]:
                db.execute(text("DELETE FROM auction_results WHERE auction_id = :a"), {"a": aid})
                db.execute(text("UPDATE auctions SET current_bid_id=NULL, current_winning_bid_id=NULL WHERE id = :a"), {"a": aid})
                db.execute(text("DELETE FROM bids WHERE auction_id = :a"), {"a": aid})
                db.execute(text("DELETE FROM auctions WHERE id = :a"), {"a": aid})
            db.execute(text("DELETE FROM offers WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM favorites WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listing_images WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listings WHERE id = :l"), {"l": lid})
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"auctioncat-{tag}"})
        for prefix in ("aseller-", "bidder1-", "bidder2-", "bidder3-"):
            for (uid,) in db.execute(
                text("SELECT id FROM users WHERE email LIKE :p"), {"p": f"{prefix}{tag}@example.com"}
            ).all():
                db.execute(text("DELETE FROM bids WHERE bidder_id = :u"), {"u": uid})
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
