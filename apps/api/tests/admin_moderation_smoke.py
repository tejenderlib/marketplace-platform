"""Admin moderation smoke tests (stdlib only). Run inside the api container:

    docker compose run --rm -e PYTHONPATH=/app api python tests/admin_moderation_smoke.py

Covers authZ matrix, user suspend/reactivate (+sessions, self-guard),
listing approve/reject/remove/restore (+invalid transitions), audit
exactness/immutability/reads, and concurrent-suspend safety. Cleans up.
"""

from __future__ import annotations

import json
import sys
import threading
import urllib.error
import urllib.request
import uuid

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
    status, body = call("POST", "/auth/register", {"email": email, "password": "Mod12345"})
    assert status == 201, (status, body)
    # Phase 8: marketplace actions require a verified (ACTIVE) account.
    status, _v = call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    assert status == 200, (status, _v)
    status, login = call("POST", "/auth/login", {"email": email, "password": "Mod12345"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"], login["refresh_token"]


def grant_admin(email):
    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        role = db.execute(text("SELECT id FROM roles WHERE name = 'ADMIN'")).scalar()
        uid = db.execute(text("SELECT id FROM users WHERE email = :e"), {"e": email}).scalar()
        db.execute(text("INSERT INTO user_roles (id, user_id, role_id) VALUES (:i, :u, :r)"),
                   {"i": uuid.uuid4(), "u": uid, "r": role})
        db.commit()
    finally:
        db.close()


def audit_count(**filters):
    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        where = " AND ".join(f"{k} = :{k}" if v is not None else f"{k} IS NULL" for k, v in filters.items())
        params = {k: (str(v) if isinstance(v, uuid.UUID) else v) for k, v in filters.items() if v is not None}
        return db.execute(text(f"SELECT count(*) FROM moderation_actions WHERE {where}"), params).scalar()
    finally:
        db.close()


def main():
    tag = uuid.uuid4().hex[:8]
    admin_id, admin_tok, _ = register(f"madmin-{tag}@example.com")
    grant_admin(f"madmin-{tag}@example.com")
    buyer_id, buyer_tok, _ = register(f"mbuyer-{tag}@example.com")
    seller_id, seller_tok, _ = register(f"mseller-{tag}@example.com")
    susp_id, susp_tok, _ = register(f"msusp-{tag}@example.com")
    grant_admin(f"msusp-{tag}@example.com")
    gone_id, gone_tok, _ = register(f"mgone-{tag}@example.com")
    grant_admin(f"mgone-{tag}@example.com")

    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    db.execute(text("UPDATE users SET status = 'SUSPENDED' WHERE id = :u"), {"u": susp_id})
    db.execute(text("UPDATE users SET status = 'DELETED' WHERE id = :u"), {"u": gone_id})
    cat = uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'ModCat', :slug, 'ACTIVE')"),
        {"id": cat, "slug": f"modcat-{tag}"},
    )
    db.commit()
    db.close()

    rid = str(uuid.uuid4())
    # 1. authZ matrix on mutations (random id -> admin reaches 404/409, proving auth passed)
    for route in (f"/admin/users/{rid}/suspend", f"/admin/listings/{rid}/remove",
                  "/admin/moderation"):
        s_anon, _ = call("POST" if "moderation" not in route else "GET", route,
                         {"reason": "x"} if "moderation" not in route else None)
        s_buyer, _ = call("POST" if "moderation" not in route else "GET", route,
                          {"reason": "x"} if "moderation" not in route else None, token=buyer_tok)
        s_admin, _ = call("POST" if "moderation" not in route else "GET", route,
                          {"reason": "x"} if "moderation" not in route else None, token=admin_tok)
        s_susp, _ = call("POST" if "moderation" not in route else "GET", route,
                         {"reason": "x"} if "moderation" not in route else None, token=susp_tok)
        s_gone, _ = call("POST" if "moderation" not in route else "GET", route,
                         {"reason": "x"} if "moderation" not in route else None, token=gone_tok)
        ok = (s_anon in (401, 403) and s_buyer == 403 and s_admin in (200, 404, 409)
              and s_susp == 403 and s_gone == 403)
        if not ok:
            print("  matrix", route, s_anon, s_buyer, s_admin, s_susp, s_gone)
    check("authZ matrix mutations+audit", ok)
    status, _ = call("POST", f"/admin/users/{admin_id}/suspend",
                     {"reason": "self test"}, token=admin_tok)
    check("self-suspend 403", status == 403, status)

    # 2. user suspend/reactivate (+ sessions + history preservation)
    status, listing = call("POST", "/catalog/listings",
                           {"category_id": str(cat), "sale_type": "FIXED_PRICE",
                            "title": "Mod Victim Item", "condition": "GOOD",
                            "fixed_price_minor": 10000, "currency": "INR",
                            "city": "Jaipur", "country_code": "IN"},
                           token=seller_tok)
    assert status == 201, (status, listing)
    victim_lid = listing["id"]
    before = audit_count(target_user_id=seller_id)
    status, act = call("POST", f"/admin/users/{seller_id}/suspend",
                       {"reason": "test suspension", "metadata": {"case": "42"}},
                       token=admin_tok)
    check("suspend 200 + audit", status == 200 and act["action_type"] == "USER_SUSPENDED"
          and act["target_user_id"] == seller_id and act["admin_id"] == admin_id
          and act["reason"] == "test suspension" and act["created_at"] is not None, (status, act))
    check("exactly one audit row", audit_count(target_user_id=seller_id) == before + 1,
          audit_count(target_user_id=seller_id))
    db2 = SessionLocal()
    st = db2.execute(text("SELECT status FROM users WHERE id = :u"), {"u": seller_id}).scalar()
    sess = db2.execute(text("SELECT count(*) FROM auth_refresh_tokens WHERE user_id = :u AND status = 'ACTIVE'"),
                       {"u": seller_id}).scalar()
    lst = db2.execute(text("SELECT status FROM listings WHERE id = :l"), {"l": victim_lid}).scalar()
    db2.close()
    check("status SUSPENDED + sessions revoked + listing kept", st == "SUSPENDED" and sess == 0
          and lst == "DRAFT", (st, sess, lst))
    status, _ = call("POST", f"/admin/users/{seller_id}/suspend",
                     {"reason": "again"}, token=admin_tok)
    check("duplicate suspend 409", status == 409, status)
    check("no audit on no-op", audit_count(target_user_id=seller_id) == before + 1)
    status, login_try = call("POST", "/auth/login",
                             {"email": f"mseller-{tag}@example.com", "password": "Mod12345"})
    check("suspended login 403", status == 403, status)
    status, reac = call("POST", f"/admin/users/{seller_id}/reactivate",
                        {"reason": "appeal granted"}, token=admin_tok)
    check("reactivate ACTIVE", status == 200 and reac["action_type"] == "USER_REACTIVATED", (status, reac))
    status, _ = call("POST", f"/admin/users/{seller_id}/reactivate",
                     {"reason": "again"}, token=admin_tok)
    check("reactivate non-suspended 409", status == 409, status)
    # deleted user cannot be reactivated
    db3 = SessionLocal()
    db3.execute(text("UPDATE users SET status = 'DELETED' WHERE id = :u"), {"u": buyer_id})
    db3.commit()
    db3.close()
    status, _ = call("POST", f"/admin/users/{buyer_id}/reactivate",
                     {"reason": "x"}, token=admin_tok)
    check("deleted reactivate 409", status == 409, status)
    db4 = SessionLocal()
    db4.execute(text("UPDATE users SET status = 'ACTIVE' WHERE id = :u"), {"u": buyer_id})
    db4.commit()
    db4.close()
    # reason required
    status, _ = call("POST", f"/admin/users/{seller_id}/suspend", {}, token=admin_tok)
    check("reason required 422", status == 422, status)

    # 3. listing moderation across states
    def seed_listing(title, to_status):
        # Canonical seeding: submit as seller, approve as admin, then admin
        # sets terminal states (sellers can no longer PATCH arbitrarily).
        s, body = call("POST", "/catalog/listings",
                       {"category_id": str(cat), "sale_type": "FIXED_PRICE",
                        "title": title, "condition": "GOOD",
                        "fixed_price_minor": 5000, "currency": "INR",
                        "city": "Jaipur", "country_code": "IN"},
                       token=seller_tok)
        assert s == 201, (s, body)
        lid = body["id"]
        if to_status == "DRAFT":
            return lid
        s, _ = call("POST", f"/catalog/listings/{lid}/submit", token=seller_tok)
        assert s == 200, (s, lid)
        if to_status == "PENDING_REVIEW":
            return lid
        s, _ = call("POST", f"/admin/listings/{lid}/approve",
                    {"reason": "seed approval"}, token=admin_tok)
        assert s == 200, (s, lid)
        if to_status == "ACTIVE":
            return lid
        s, _ = call("PATCH", f"/catalog/listings/{lid}", {"status": to_status}, token=admin_tok)
        assert s == 200, (s, lid)
        return lid

    pend1 = seed_listing("Mod Pending One", "PENDING_REVIEW")
    status, ap = call("POST", f"/admin/listings/{pend1}/approve",
                      {"reason": "looks good"}, token=admin_tok)
    check("approve ACTIVE", status == 200 and ap["action_type"] == "LISTING_APPROVED", (status, ap))
    status, _ = call("POST", f"/admin/listings/{pend1}/approve",
                     {"reason": "again"}, token=admin_tok)
    check("approve active 409", status == 409, status)
    pend2 = seed_listing("Mod Pending Two", "PENDING_REVIEW")
    status, rj = call("POST", f"/admin/listings/{pend2}/reject",
                      {"reason": "counterfeit"}, token=admin_tok)
    check("reject REJECTED", status == 200 and rj["action_type"] == "LISTING_REJECTED", (status, rj))
    act1 = seed_listing("Mod Active One", "ACTIVE")
    status, rm = call("POST", f"/admin/listings/{act1}/remove",
                      {"reason": "policy violation"}, token=admin_tok)
    check("remove REMOVED", status == 200 and rm["action_type"] == "LISTING_REMOVED", (status, rm))
    sold1 = seed_listing("Mod Sold One", "SOLD")
    status, _ = call("POST", f"/admin/listings/{sold1}/remove",
                     {"reason": "x"}, token=admin_tok)
    check("remove SOLD 409", status == 409, status)
    exp1 = seed_listing("Mod Expired One", "EXPIRED")
    status, _ = call("POST", f"/admin/listings/{exp1}/remove",
                     {"reason": "x"}, token=admin_tok)
    check("remove EXPIRED 409", status == 409, status)
    status, rs = call("POST", f"/admin/listings/{act1}/restore",
                      {"reason": "appeal won"}, token=admin_tok)
    check("restore ACTIVE", status == 200 and rs["action_type"] == "LISTING_RESTORED", (status, rs))
    status, _ = call("POST", f"/admin/listings/{sold1}/restore",
                     {"reason": "x"}, token=admin_tok)
    check("restore SOLD 409", status == 409, status)
    status, _ = call("POST", f"/admin/listings/{pend1}/restore",
                     {"reason": "x"}, token=admin_tok)
    check("restore ACTIVE 409", status == 409, status)
    # audit rows for listing targets
    check("listing audit exact", audit_count(target_listing_id=pend1) == 1
          and audit_count(target_listing_id=act1) == 3, "")
    # invalid UUID-ish + missing
    status, _ = call("POST", f"/admin/listings/{uuid.uuid4()}/remove",
                     {"reason": "x"}, token=admin_tok)
    check("remove missing 404", status == 404, status)
    status, _ = call("PATCH", f"/admin/moderation/{uuid.uuid4()}", {}, token=admin_tok)
    check("audit immutable (405)", status == 405, status)

    # 4. audit reads + filters
    status, feed = call("GET", "/admin/moderation?limit=5", token=admin_tok)
    check("audit list", status == 200 and feed["total"] >= 5, feed.get("total"))
    status, filt = call("GET", "/admin/moderation?action_type=LISTING_REMOVED", token=admin_tok)
    check("audit action filter", status == 200 and all(i["action_type"] == "LISTING_REMOVED" for i in filt["items"]), filt.get("total"))
    status, by_admin = call("GET", f"/admin/moderation?admin_id={admin_id}", token=admin_tok)
    check("audit admin filter", status == 200 and by_admin["total"] >= 5, by_admin.get("total"))
    status, by_target = call("GET", f"/admin/moderation?target_listing_id={act1}", token=admin_tok)
    check("audit target filter", status == 200 and by_target["total"] == 3, by_target)
    status, one = call("GET", f"/admin/moderation/{rm['id']}", token=admin_tok)
    check("audit detail", status == 200 and one["reason"] == "policy violation"
          and one["admin_id"] == admin_id and one["created_at"] is not None, one)
    status, _ = call("GET", "/admin/moderation", token=buyer_tok)
    check("non-admin audit 403", status == 403, status)

    # 5. concurrent suspends: one 200, one 409, exactly one audit row
    db5 = SessionLocal()
    race_uid = uuid.uuid4()
    db5.execute(text("INSERT INTO users (id, email, password_hash, status) VALUES (:i, :e, 'x', 'ACTIVE')"),
                {"i": race_uid, "e": f"race-{tag}@example.com"})
    db5.commit()
    db5.close()
    barrier = threading.Barrier(2)
    results = []

    def _race():
        barrier.wait()
        s, _ = call("POST", f"/admin/users/{race_uid}/suspend",
                    {"reason": "race"}, token=admin_tok)
        results.append(s)

    threads = [threading.Thread(target=_race) for _ in range(2)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    check("concurrent one success", sorted(results) == [200, 409], results)
    check("single audit row", audit_count(target_user_id=race_uid) == 1,
          audit_count(target_user_id=race_uid))

    _cleanup(tag)
    print("FAILURES:", FAILURES if FAILURES else "none")
    return 1 if FAILURES else 0


def _cleanup(tag):
    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        db.execute(
            text("DELETE FROM moderation_actions WHERE admin_id IN "
                 "(SELECT id FROM users WHERE email LIKE :p)"),
            {"p": f"m%-{tag}@example.com"},
        )
        db.execute(
            text("DELETE FROM moderation_actions WHERE target_user_id IN "
                 "(SELECT id FROM users WHERE email LIKE :p)"),
            {"p": f"m%-{tag}@example.com"},
        )
        db.execute(
            text("DELETE FROM moderation_actions WHERE id IN (SELECT id FROM moderation_actions WHERE target_user_id IN "
                 "(SELECT id FROM users WHERE email LIKE :p))"),
            {"p": f"race-{tag}@example.com"},
        )
        lids = [
            r[0]
            for r in db.execute(
                text("SELECT id FROM listings WHERE seller_id IN (SELECT id FROM users WHERE email LIKE :p)"),
                {"p": f"m%-{tag}@example.com"},
            ).all()
        ]
        for lid in lids:
            db.execute(text("DELETE FROM moderation_actions WHERE target_listing_id = :l"), {"l": lid})
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
        db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": f"modcat-{tag}"})
        for prefix in ("madmin-", "mbuyer-", "mseller-", "msusp-", "mgone-", "race-"):
            for (uid,) in db.execute(
                text("SELECT id FROM users WHERE email LIKE :p"), {"p": f"{prefix}{tag}@example.com"}
            ).all():
                db.execute(text("DELETE FROM moderation_actions WHERE target_user_id = :u"), {"u": uid})
                db.execute(text("DELETE FROM moderation_actions WHERE admin_id = :u"), {"u": uid})
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
