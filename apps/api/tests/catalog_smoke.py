"""Catalog API smoke tests (stdlib only). Run inside the api container:

    docker compose run --rm -e PYTHONPATH=/app api python tests/catalog_smoke.py

Covers canonical listings/images/favorites: categories, pagination, detail,
filters (incl. condition), auth create, ownership, ADMIN path, images
(storage_key, primary uniqueness, hard delete), favorites (composite key),
validation, INR enforcement. Cleans up all rows created.
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
    status, body = call(
        "POST", "/auth/register", {"email": email, "password": "Catalog123"}
    )
    assert status == 201, (status, body)
    # Phase 8: marketplace actions require a verified (ACTIVE) account.
    call("POST", "/auth/verify-email", {"token": body["verification_token"]})
    status, login = call("POST", "/auth/login", {"email": email, "password": "Catalog123"})
    assert status == 200, (status, login)
    return body["id"], login["access_token"]


def main():
    tag = uuid.uuid4().hex[:8]
    seller_id, seller_tok = register(f"seller-{tag}@example.com")
    buyer_id, buyer_tok = register(f"buyer-{tag}@example.com")
    _, admin_tok = ensure_admin(tag, prefix="catadm")

    # seed categories via SQL (no category-write endpoint by design)
    from sqlalchemy import text
    from app.db.session import SessionLocal

    db = SessionLocal()
    cat1, cat2, cat3 = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'Gadgets', :slug, 'ACTIVE')"),
        {"id": cat1, "slug": f"gadgets-{tag}"},
    )
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'Wheels', :slug, 'ACTIVE')"),
        {"id": cat2, "slug": f"wheels-{tag}"},
    )
    db.execute(
        text("INSERT INTO categories (id, name, slug, status) VALUES (:id, 'Retired', :slug, 'INACTIVE')"),
        {"id": cat3, "slug": f"retired-{tag}"},
    )
    db.commit()

    # 1. public categories (ACTIVE only)
    status, cats = call("GET", "/catalog/categories")
    check("categories 200", status == 200, status)
    slugs = [c["slug"] for c in cats]
    check("active only", f"gadgets-{tag}" in slugs and f"retired-{tag}" not in slugs, slugs)

    # 2. authenticated creation (canonical fields)
    fixed = {
        "category_id": str(cat1), "sale_type": "FIXED_PRICE", "title": "Brass Diya Set of 6",
        "description": "Handcrafted.", "condition": "LIKE_NEW",
        "fixed_price_minor": 209900, "currency": "INR", "offers_enabled": True,
        "city": "Jaipur", "region": "Rajasthan", "country_code": "IN", "postal_code": "302001",
    }
    status, created = call("POST", "/catalog/listings", fixed, token=seller_tok)
    check("create 201", status == 201, (status, created))
    check("create shape", created.get("sale_type") == "FIXED_PRICE" and created["currency"] == "INR"
          and created["condition"] == "LIKE_NEW" and created["fixed_price_minor"] == 209900
          and created["city"] == "Jaipur" and created["country_code"] == "IN"
          and created["offers_enabled"] is True and created["seller"]["id"] == seller_id
          and created["status"] == "DRAFT" and created["images"] == []
          and created["auction"] is None, created)
    lid = created["id"]
    auc_payload = dict(fixed, category_id=str(cat2), sale_type="AUCTION", title="Vintage Camera Auction",
                       fixed_price_minor=None, offers_enabled=False, condition="GOOD", city="Mumbai")
    status, created_auc = call("POST", "/catalog/listings", auc_payload, token=seller_tok)
    check("create auction 201", status == 201, (status, created_auc))
    aid = created_auc["id"]

    # 3. unauthenticated create rejected
    status, _ = call("POST", "/catalog/listings", fixed)
    check("unauth create rejected", status in (401, 403), status)

    # 4. invalid data rejected (canonical matrix)
    for label, bad in [
        ("short title 422", dict(fixed, title="x")),
        ("USD rejected 422", dict(fixed, currency="USD")),
        ("FIXED w/o price 422", dict(fixed, fixed_price_minor=None, title="Free Stuff?")),
        ("AUCTION with price 422", dict(fixed, sale_type="AUCTION", title="Priced Auction")),
        ("offers on AUCTION 422", dict(fixed, sale_type="AUCTION", fixed_price_minor=None, title="Offer Auction")),
        ("bad condition 422", dict(fixed, condition="MINT", title="Mint Item")),
        ("bad country 422", dict(fixed, country_code="USA", title="Bad Country")),
        ("bad category 404", dict(fixed, category_id=str(uuid.uuid4()))),
        ("seller_id ignored", dict(fixed, title="Seller Spoof", seller_id=buyer_id)),
    ]:
        status, body = call("POST", "/catalog/listings", bad, token=seller_tok)
        if label == "seller_id ignored":
            check(label, status == 201 and body["seller"]["id"] == seller_id, (status, body))
            if status == 201:
                db.execute(text("DELETE FROM listings WHERE id = :i"), {"i": body["id"]})
                db.commit()
        elif label == "bad category 404":
            check(label, status == 404, (status, body))
        else:
            check(label, status == 422, (status, body))

    # activate both for browsing tests (canonical publish: admin approves DRAFT)
    for listing_id in (lid, aid):
        status, _ = call("PATCH", f"/catalog/listings/{listing_id}", {"status": "ACTIVE"}, token=admin_tok)
        assert status == 200, (status, listing_id)

    # 5. pagination + deterministic order
    status, page1 = call("GET", "/catalog/listings?limit=1&offset=0")
    status2, page2 = call("GET", "/catalog/listings?limit=1&offset=1")
    check("pagination 200 + total", status == 200 and page1["total"] >= 2
          and len(page1["items"]) == 1 and len(page2["items"]) == 1
          and page1["items"][0]["id"] != page2["items"][0]["id"], (page1, page2))

    # 6. detail (+404)
    status, detail = call("GET", f"/catalog/listings/{lid}")
    check("detail 200 + canonical fields", status == 200 and detail["title"] == "Brass Diya Set of 6"
          and detail["fixed_price_minor"] == 209900 and detail["condition"] == "LIKE_NEW"
          and detail["city"] == "Jaipur" and detail["offers_enabled"] is True, detail)
    status, _ = call("GET", f"/catalog/listings/{uuid.uuid4()}")
    check("detail 404", status == 404, status)

    # auction summary appears once an auction row exists (read-only join)
    db.execute(
        text("INSERT INTO auctions (id, listing_id, status, starting_bid_minor, minimum_increment_minor, starts_at, ends_at)"
             " VALUES (:id, :l, 'LIVE', 1000000, 50000, now(), now() + interval '2 days')"),
        {"id": uuid.uuid4(), "l": aid},
    )
    db.commit()
    status, adetail = call("GET", f"/catalog/listings/{aid}")
    check("auction summary", status == 200 and adetail["auction"] is not None
          and adetail["auction"]["status"] == "LIVE", adetail.get("auction"))

    # 7. filters
    status, by_cat = call("GET", f"/catalog/listings?category_id={cat1}")
    check("filter category", status == 200 and all(i["category"]["slug"] == f"gadgets-{tag}" for i in by_cat["items"]) and by_cat["total"] >= 1, by_cat.get("total"))
    status, by_type = call("GET", "/catalog/listings?sale_type=AUCTION")
    check("filter sale_type", status == 200 and all(i["sale_type"] == "AUCTION" for i in by_type["items"]), by_type.get("total"))
    status, by_cond = call("GET", "/catalog/listings?condition=LIKE_NEW")
    check("filter condition", status == 200 and all(i["condition"] == "LIKE_NEW" for i in by_cond["items"]) and by_cond["total"] >= 1, by_cond.get("total"))
    status, by_seller = call("GET", f"/catalog/listings?seller_id={seller_id}")
    check("filter seller", status == 200 and by_seller["total"] >= 2, by_seller.get("total"))
    status, by_q = call("GET", "/catalog/listings?q=diya")
    check("search q", status == 200 and any("Diya" in i["title"] for i in by_q["items"]), by_q.get("items"))
    status, bad_enum = call("GET", "/catalog/listings?sale_type=RENTAL")
    check("bad enum 422", status == 422, status)
    status, bad_cond = call("GET", "/catalog/listings?condition=MINT")
    check("bad condition 422", status == 422, status)

    # 8. ownership: buyer cannot edit; sale_type/seller immutable
    status, _ = call("PATCH", f"/catalog/listings/{lid}", {"title": "Hijacked"}, token=buyer_tok)
    check("non-owner 403", status == 403, status)
    status, edited = call(
        "PATCH", f"/catalog/listings/{lid}",
        {"title": "Brass Diya Set of 6 (Updated)", "sale_type": "AUCTION", "seller_id": buyer_id,
         "fixed_price_minor": 199900, "city": "Udaipur"},
        token=seller_tok,
    )
    check("owner edit 200, immutable kept", status == 200 and edited["title"].endswith("(Updated)")
          and edited["sale_type"] == "FIXED_PRICE" and edited["seller"]["id"] == seller_id
          and edited["fixed_price_minor"] == 199900 and edited["city"] == "Udaipur", (status, edited))
    status, _ = call("PATCH", f"/catalog/listings/{aid}",
                     {"fixed_price_minor": 500}, token=seller_tok)
    check("price onto AUCTION 422", status == 422, status)

    # 9. ADMIN privileged path
    admin_role = db.execute(text("SELECT id FROM roles WHERE name = 'ADMIN'")).scalar()
    admin_id = uuid.uuid4()
    db.execute(text("INSERT INTO users (id, email, password_hash, status) VALUES (:i, :e, 'x', 'ACTIVE')"),
               {"i": admin_id, "e": f"admin-{tag}@example.com"})
    db.execute(text("INSERT INTO user_roles (id, user_id, role_id) VALUES (:i, :u, :r)"),
               {"i": uuid.uuid4(), "u": admin_id, "r": admin_role})
    db.commit()
    db.close()
    status, alogin = call("POST", "/auth/login", {"email": f"admin-{tag}@example.com", "password": "x"})
    if status != 200:
        from app.identity.security import hash_password
        from app.db.session import SessionLocal
        db2 = SessionLocal()
        db2.execute(text("UPDATE users SET password_hash = :h WHERE id = :u"),
                    {"h": hash_password("Admin1234"), "u": admin_id})
        db2.commit()
        db2.close()
        status, alogin = call("POST", "/auth/login", {"email": f"admin-{tag}@example.com", "password": "Admin1234"})
    check("admin login", status == 200, (status, alogin))
    admin_tok = alogin.get("access_token")
    status, admin_edit = call("PATCH", f"/catalog/listings/{lid}", {"city": "Jodhpur"}, token=admin_tok)
    check("admin edit other's listing 200", status == 200 and admin_edit["city"] == "Jodhpur", (status, admin_edit))

    # 10. images (storage_key, primary uniqueness, hard delete)
    img_payload = {"storage_key": "listings/abc/1.jpg", "content_type": "image/jpeg",
                   "byte_size": 102400, "width": 900, "height": 600, "is_primary": True}
    status, img1 = call("POST", f"/catalog/listings/{lid}/images", img_payload, token=seller_tok)
    check("image add 201 primary", status == 201 and img1["sort_order"] == 0 and img1["is_primary"] is True, (status, img1))
    status, img2 = call("POST", f"/catalog/listings/{lid}/images",
                        {"storage_key": "listings/abc/2.jpg", "content_type": "image/jpeg", "byte_size": 51200},
                        token=seller_tok)
    check("image auto sort_order 1", status == 201 and img2["sort_order"] == 1 and img2["is_primary"] is False, (status, img2))
    status, dup_primary = call("POST", f"/catalog/listings/{lid}/images",
                               {"storage_key": "listings/abc/3.jpg", "content_type": "image/jpeg",
                                "byte_size": 100, "is_primary": True}, token=seller_tok)
    # cleanup the auto-created third row if the guard missed (partial unique is the backstop)
    if dup_primary.get("id"):
        call("DELETE", f"/catalog/listings/{lid}/images/{dup_primary['id']}", token=seller_tok)
    check("dup primary 409", status == 409, (status, dup_primary))
    status, listed = call("GET", f"/catalog/listings/{lid}/images")
    check("images list ordered", status == 200 and [i["sort_order"] for i in listed] == [0, 1], listed)
    status, _ = call("POST", f"/catalog/listings/{lid}/images", img_payload, token=buyer_tok)
    check("non-owner image add 403", status == 403, status)
    status, _ = call("DELETE", f"/catalog/listings/{lid}/images/{img1['id']}", token=seller_tok)
    check("image hard delete 200", status == 200, status)
    status, listed2 = call("GET", f"/catalog/listings/{lid}/images")
    check("deleted gone", status == 200 and len(listed2) == 1, listed2)
    status, _ = call("DELETE", f"/catalog/listings/{lid}/images/{uuid.uuid4()}", token=seller_tok)
    check("remove missing 404", status == 404, status)

    # 11. favorites (composite key, hard delete)
    status, fav = call("POST", f"/catalog/listings/{lid}/favorite", token=buyer_tok)
    check("favorite 201", status == 201 and fav["user_id"] == buyer_id and fav["listing_id"] == lid, (status, fav))
    status, _ = call("POST", f"/catalog/listings/{lid}/favorite", token=buyer_tok)
    check("duplicate favorite 409", status == 409, status)
    status, favs = call("GET", "/catalog/favorites", token=buyer_tok)
    check("favorites list", status == 200 and len(favs) == 1 and favs[0]["listing"]["id"] == lid, favs)
    status, _ = call("POST", f"/catalog/listings/{uuid.uuid4()}/favorite", token=buyer_tok)
    check("favorite missing listing 404", status == 404, status)
    status, _ = call("POST", f"/catalog/listings/{lid}/favorite")
    check("unauth favorite rejected", status in (401, 403), status)
    status, _ = call("DELETE", f"/catalog/listings/{lid}/favorite", token=buyer_tok)
    check("unfavorite 200", status == 200, (status, _))
    status, _ = call("DELETE", f"/catalog/listings/{lid}/favorite", token=buyer_tok)
    check("unfavorite again 404", status == 404, status)
    status, refav = call("POST", f"/catalog/listings/{lid}/favorite", token=buyer_tok)
    check("refavorite after unfav 201", status == 201, (status, refav))

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
                text("SELECT id FROM users WHERE email LIKE :p"), {"p": f"%-{tag}@example.com"}
            ).all()
        ]
        for uid in uids:
            db.execute(text("DELETE FROM favorites WHERE user_id = :u"), {"u": uid})
        lids = [
            r[0]
            for r in db.execute(
                text("SELECT id FROM listings WHERE seller_id IN (SELECT id FROM users WHERE email LIKE :p)"),
                {"p": f"%-{tag}@example.com"},
            ).all()
        ]
        for lid in lids:
            db.execute(text("DELETE FROM favorites WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listing_images WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM auctions WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM orders WHERE listing_id = :l"), {"l": lid})
            db.execute(text("DELETE FROM listings WHERE id = :l"), {"l": lid})
        for slug in (f"gadgets-{tag}", f"wheels-{tag}", f"retired-{tag}"):
            db.execute(text("DELETE FROM categories WHERE slug = :s"), {"s": slug})
        for email in (f"seller-{tag}@example.com", f"buyer-{tag}@example.com", f"admin-{tag}@example.com"):
            uid = db.execute(text("SELECT id FROM users WHERE email = :e"), {"e": email}).scalar()
            if uid is None:
                continue
            db.execute(text("DELETE FROM auth_refresh_tokens WHERE user_id = :u"), {"u": uid})
            db.execute(text("DELETE FROM user_roles WHERE user_id = :u"), {"u": uid})
            db.execute(text("DELETE FROM user_profiles WHERE user_id = :u"), {"u": uid})
            db.execute(text("DELETE FROM users WHERE id = :u"), {"u": uid})
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
