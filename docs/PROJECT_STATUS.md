# Project Status

Snapshot as of the Phase 9 documentation task (2026-09-15).

## Completed phases

- **Phase 0** — planning/scope of the marketplace platform.
- **Phase 1 Foundation** — React/Vite web app, FastAPI API, PostgreSQL,
  Docker Compose stack, env configuration, Alembic baseline, health
  endpoint, local admin provisioning script.
- **Phase 2 Database** — full domain schema via 17 Alembic migrations:
  identity (users/roles/profiles/refresh tokens), catalog (categories,
  listings, images, favorites), trading (offers, auctions, bids,
  auction results), orders (addresses, orders, shipping snapshots,
  shipments, status history, payments), notifications, messaging,
  reports, reviews, support, moderation actions.
- **Phase 3 Backend APIs** — all domain REST endpoints: auth (with 8.1
  hardening), catalog, offers, auctions/bids, addresses, checkout
  (fixed-price/offer/auction), orders + dummy payments + ship/deliver,
  seller order views.
- **Phase 4 Admin** — admin read dashboards (users, listings, orders,
  auctions, payments, reviews, reports, support, moderation audit) and
  moderation actions (remove/restore listings post-publication,
  suspend/reactivate users, remove reviews, resolve reports, manage
  tickets).
- **Phase 5 Storefront** — buyer-facing SPA: listing discovery, detail,
  favorites, fixed-price checkout, payment, orders; seller listing
  management with direct-publish workflow (listing goes live immediately).
- **Phase 6 Marketplace/User Interaction** — offers (make/accept/reject/
  withdraw/counter-offer checkout), auction browsing/bidding/auction
  checkout, user profiles, seller profiles (committed:
  `5a03cdd feat: complete phase 6 user interaction`).
- **Phase 7 Communication, Trust & Support** — ratings/reviews on
  DELIVERED orders (one per order, admin soft-removal), in-app
  notifications with WebSocket live push, buyer-seller messaging,
  content/user reports, support tickets with message threads and admin
  handling.

## Current phase

**Phase 8 Security & Reliability — completed** (working tree, uncommitted
on top of Phase 6 commit `5a03cdd`; Phases 7–9 are also uncommitted).

- 8.1 Auth hardening (refresh-token rotation with family revocation,
  auth rate limiting)
- 8.2 Order/checkout expiry (deadline stamping, lazy cancellation,
  reservation release, buyer cancel endpoint)
- 8.3 Auction reserve-price enforcement at settlement
- 8.4–8.17 remaining hardening: global API middleware (security
  headers, Host validation, body cap, safe error responses),
  production-off docs/OpenAPI, WS first-frame auth handshake,
  payment simulation gated to development, session cap enforcement,
  email-verification gate for marketplace actions, hidden-listing
  protection, centralized money upper bounds, in-process auction
  auto-close scheduler, sibling-offer rejection on accept, text input
  ceilings, per-user bid cap, duplicate-message suppression, image
  metadata validation (MIME/size/dimensions).
- Phase 9 (documentation) is complete in the working tree.

Deferred beyond V1 (documented in DECISIONS.md §16): localStorage token
storage (HttpOnly cookies), real email delivery, real PSP, byte-level
image validation, multi-instance infrastructure.

## Documentation map

- [DECISIONS.md](DECISIONS.md) — architecture & engineering decision record
- [FLOW.md](FLOW.md) — system and business flows (Mermaid diagrams)
- [PHASES.md](PHASES.md) — phase roadmap and history
- [AI_CHANGELOG.md](AI_CHANGELOG.md) — AI-assisted development history
- [architecture.md](architecture.md) — Phase 1 architecture baseline

## Major implemented features

- Auth: JWT access (15 min) + rotating hashed refresh tokens (30 d,
  family revocation, session cap of 10 ACTIVE tokens), bcrypt,
  register/login rate limits, suspension, email-verification gate
  (PENDING_VERIFICATION accounts cannot use marketplace endpoints).
- Catalog: lifecycle-managed listings with direct publish
  (DRAFT→ACTIVE via POST /submit, validated) and post-publication
  admin moderation (ACTIVE↔REMOVED), images (storage_key references),
  favorites. PENDING_REVIEW/REJECTED are legacy states kept for
  historical rows only.
- Trading: offers with expiry; authoritative auctions (DRAFT→SCHEDULED→
  LIVE→ENDED/SETTLED) with row-locked idempotent bidding; settlement
  honors reserve price; winner checkout window.
- Orders: three sources (FIXED_PRICE/ACCEPTED_OFFER/AUCTION_WIN),
  server-side pricing only, DUMMY payment provider abstraction,
  checkout-window expiry, buyer cancel, ship/deliver fulfillment,
  immutable history + address snapshots.
- Trust & comms: reviews, notifications (+WS push), messaging,
  reports, support tickets; admin moderation with audit trail.

## Test status

**Backend (all passing; stdlib HTTP smoke suites run against the live
Docker stack, `docker compose exec -e PYTHONPATH=/app api python
tests/<suite>.py`):**

- auth, auth_hardening, catalog, offers, auctions, checkout,
  offer_checkout, auction_checkout, seller_workflow, admin,
  admin_moderation, profile, reviews, notifications, phase7_remaining
  (messaging/reports/support), order_expiry (8.2),
  auction_reserve (8.3), **phase8_final** (8.4–8.17: payment gating,
  session cap, verification gate, hidden listings, money bounds,
  auto-close, sibling offers, input limits, bid cap, duplicate
  messages, image validation) — all suites report `FAILURES: none`.

**Frontend:** no automated frontend test suite exists (no test runner
in `apps/web/package.json`); `npm run build` passes and verification is
manual through the running SPA.

## Known limitations

- India-only marketplace: INR-only currency enforced at the schema level.
- Single API instance: in-process WebSocket manager, in-process rate
  limiters, in-process lazy expiry, and an in-process auction auto-close
  scheduler thread (30 s cadence) — Redis or similar needed only for
  multi-instance deployments.
- No email infrastructure: verification tokens are returned by the
  register/resend endpoints for local activation; production needs a
  mailer.
- Browser tokens (access + refresh) are stored in localStorage; the
  HttpOnly-cookie alternative requires a same-origin SPA/API redesign
  (deferred, see DECISIONS.md §16).
- Image uploads register `storage_key` references with validated
  metadata (MIME allowlist, 10 MiB, 10000 px); no object-store backend
  exists yet, so byte-level validation is deferred to that backend.
- Payment is the local DummyPaymentProvider only; no real PSP. Client
  `simulate` outcomes are development-only (forced provider-decided in
  production).
- No automated frontend tests; no CI configuration in the repo.
- Auction close automation is a single-process scheduler; multi-instance
  deployments need leader election or sharding (documented).
- Below-reserve/NO_BIDS auctions leave the listing ACTIVE for the
  seller to re-list manually; no automatic relist.
- Advanced shill/collusion detection is out of V1 scope; a per-user bid
  cap (200/auction, 429 beyond) and the seller self-bid block are the
  practical safeguards.

## Uncommitted work (confirmed from git status)

The working tree contains **uncommitted Phase 7/8/9 work on top of the
last commit (`5a03cdd`, Phase 6)**:

- Modified: auth/orders/checkout/auctions/offers/admin/profile endpoints,
  models and schemas for orders + admin, identity models, core config
  (rate limits), main.py router registration, web SPA pages/styles,
  compose.yaml, .env.example.
- New (untracked): notifications/messaging/reviews/reports/support/ws
  backend modules and their routers, migrations 0013–0017
  (reviews, notifications, messaging/reports/support,
  refresh rotation, order checkout expiry), rate_limit core module,
  smoke suites (reviews, notifications, phase7_remaining,
  auth_hardening, order_expiry, auction_reserve), the Phase 9
  documentation files, and a stray `apps/web/dist2/` build output
  directory (not part of app source).
- Nothing has been committed or pushed for Phases 7–9.

## Remaining roadmap

- Phase 9: documentation — completed (centralized under `docs/`:
  DECISIONS.md, FLOW.md, PROJECT_STATUS.md, AI_CHANGELOG.md, PHASES.md).
- Phase 10: UI/UX polish of the storefront and admin SPA.
- Later (post-V1, per architecture doc): real object storage (with
  byte-level image validation), real payment provider, email delivery,
  multi-instance deployment concerns (Redis pub/sub, shared rate
  limiting, leader-elected auction closing), HttpOnly-cookie token
  architecture if the SPA moves same-origin.
