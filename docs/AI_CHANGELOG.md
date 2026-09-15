# AI-Assisted Development Changelog

Chronological record of the major AI-assisted implementation work on the
marketplace-platform, reconstructed from the repository, migration
headers, test suites, and git history. Dates come from git where
available; work performed in the uncommitted working tree after the
last commit (2026-09-14) is marked "(working tree)". Exact per-change
authorship within phases is not tracked.

## Phase 0 — Planning & scope

- Defined the marketplace concept: India-only (INR) marketplace with
  fixed-price listings and live auctions, built as a cloud-agnostic
  modular monolith.
- Established the phase roadmap (0–10) that this changelog follows.
- No code in this phase.

## Phase 1 — Foundation (commit `ea5f7e7`, 2026-09-09)

- Scaffolded the monorepo: `apps/api` (FastAPI), `apps/web`
  (React 19 + Vite), root Docker Compose (postgres, api, web, adminer).
- Env-driven configuration (`.env.example`), safely assembled
  PostgreSQL URL, CORS allowlist, health endpoint.
- Alembic baseline migration `20260909_0001` and the shared
  declarative `Base`.
- Local admin provisioning script (`app/scripts/create_admin.py`).
- Verified: `docker compose up --build` brings the stack healthy.

## Phase 2 — Database (migrations 0002–0012, 2026-09-10)

- **2A Identity** (`0002`): users, roles, user_roles, user_profiles;
  bcrypt password hashing, PyJWT helpers.
- **2B Marketplace** (`0003`, canonicalized in `0007`): categories,
  listings, listing_images, favorites with the full listing lifecycle
  statuses.
- **2C Trading** (`0004`, canonicalized in `0008`/`0009`): offers,
  auctions (starting bid, minimum increment, reserve, checkout window),
  bids, auction results with their status enums.
- **2D Orders/Payments** (`0005`, canonicalized in `0010`): user
  addresses, orders (three sources via consistency checks), immutable
  shipping snapshots, shipments, order_status_history, payments with
  idempotency keys and partial unique indexes.
- **INR-only** (`0006`): currency check constraints pinned to INR
  across all money tables (BIGINT minor units only).
- Settlement timestamp (`0011`): auctions.settled_at.
- Moderation audit (`0012`): admin role, moderation_actions table.
- Important fixes: the canonicalization migrations (0007–0010)
  realigned early table drafts with the final conventions (status
  management, checks, index naming).

## Phase 3 — Backend APIs (through 2026-09-14)

- Auth: register/login/refresh/logout with role seeding; admin
  activation of user profiles.
- Catalog: listing CRUD with lifecycle maps for sellers, canonical
  submit→review publishing, images (storage_key references, primary
  image invariant), favorites.
- Offers: idempotent creation (request_id), accept/reject/withdraw with
  lazy EXPIRED flips, per-listing/buyer uniqueness.
- Auctions: create/schedule/start, row-locked idempotent bidding with
  WINNING demotion, authoritative close service with exactly one
  result row, winner-visibility rules.
- Checkout: fixed-price, accepted-offer, auction-winner endpoints —
  all server-priced, row-locked, one order per listing/offer/result.
- Orders: buyer/seller/admin reads, DUMMY payment processing with
  idempotency, retry, atomic auction settlement on payment success.
- Address book: owned addresses with single-default flipping.
- Test suites added: auth, catalog, offers, auctions, checkout,
  offer_checkout, auction_checkout, seller_workflow — all green.

## Phase 4 — Admin (through 2026-09-14)

- Read dashboards: users, listings, orders, auctions (with settlement
  state), payments (filterable), reviews, reports, support tickets,
  moderation audit history.
- Moderation actions: approve/reject/remove/restore listings,
  suspend/reactivate users, remove reviews, update report status,
  assign/advance support tickets — each writing audit rows to
  moderation_actions.
- Test suites: admin, admin_moderation — green.

## Phase 5 — Storefront (through 2026-09-14)

- SPA routing, auth context, API client with typed error handling.
- Buyer: discovery, listing detail, favorites, fixed-price checkout
  (address selection), payment page, order history.
- Seller: listing management with draft/submit workflow, seller
  orders view.
- Layout: header/footer, listing cards/grid, hero, category grid.
- Verified manually against the running stack (no automated FE tests).

## Phase 6 — Marketplace/User Interaction (commits `d251f5b`→`5a03cdd`,
2026-09-11 → 2026-09-14)

- Profile v1 (user + seller profiles, display names) — three commits.
- Offers UI: buyer/seller offer pages, offer modals, accept/reject/withdraw,
  offer checkout.
- Auctions UI: auction panel with live bid state, auction checkout page,
  winner flow.
- Fixed: multiple iterations on profile data and cleanup before the
  final "complete phase 6 user interaction" commit.

## Phase 7 — Communication, Trust & Support (working tree, uncommitted)

- **7.1 Ratings & reviews** (migration `0013`): reviews on DELIVERED
  orders only, one per order, 1–5 rating, admin soft-removal; seller
  profile aggregates. Suite: reviews_smoke (27 checks).
- **7.3a Notifications** (migration `0014`): notifications table with
  the event-type enum, unread counts, mark-read; fire-and-forget
  `notify()` helper used across domains. Suite: notifications_smoke.
- **7.3b–f Messaging, reports, support** (migration `0015`):
  buyer–seller conversations (append-only messages, participant
  checks), user reports on listings/users with admin status flow,
  support tickets with threads, priorities, and admin handling;
  additional notification event types wired into domain endpoints
  (outbid, auction won/ended, order placed/shipped/delivered, listing
  moderation).
- WebSocket live push: `/api/v1/ws` with in-process connection manager;
  NotificationBell/Panel in the SPA.
- Suite: phase7_remaining_smoke (66 checks) — all green.

## Phase 8 — Security & Reliability (working tree, uncommitted; partial)

- **8.1 Auth hardening** (migration `0016`):
  - Refresh-token rotation: hashed one-time-use rows with family IDs;
    reuse of a rotated token revokes the entire family.
  - Fixed-window auth rate limiting (in-process): per-IP register/login
    limits, per-account failed-login limiter (success resets).
  - Suite: auth_hardening_smoke (24 checks) — green.
- **8.2 Order/checkout expiry** (migration `0017`):
  - `orders.checkout_expires_at` stamped at every checkout source.
  - Lazy cancellation of past-due unpaid orders on read/payment
    (row-locked), releasing the RESERVED listing; abandoned reservations
    are released for the next buyer at checkout time.
  - `uq_orders_listing_id` became a partial unique index
    (`status <> 'CANCELLED'`) so a cancelled order frees the listing.
  - Buyer cancel endpoint (`POST /orders/{id}/cancel`, unpaid orders
    only); AUCTION_WIN cancels flip the result to PAYMENT_EXPIRED.
  - `checkout_expires_at` exposed in OrderOut.
  - Suite: order_expiry_smoke (28 checks) — green. Fixed during work:
    abandoned-reservation release 500'd until the unique constraint was
    made partial; cleanup helper extended for moderation audit rows.
- **8.3 Auction reserve-price enforcement**:
  - Settlement now compares the top bid against `reserve_minor` inside
    the locked close transaction; below-reserve closes produce the
    canonical NO_BIDS result (no winner, no WON flips, no checkout
    state, no false AUCTION_WON notification). At/above reserve, and
    NULL reserve, behave exactly as before.
  - No migration needed — `reserve_minor` existed since migration 0004.
  - Suite: auction_reserve_smoke (34 checks) — green.
- **Remaining Phase 8 security work: not completed.**

## Phase 8 completion — Security & Reliability (working tree, uncommitted)

Completed the remaining Phase 8 audit items (8.4–8.17; 8.4–8.6 were
already present from the earlier interrupted session but untested):

- **8.4 Global API hardening** (`app/core/security_http.py`): security
  headers, Host validation (`ALLOWED_HOSTS`, default-off locally), 1 MiB
  body cap (413), generic 500s with server-only logging, sanitized 422
  echo (validation-error ctx objects stripped — fixed a 500 discovered
  during image MIME testing).
- **8.5 Docs/health exposure**: `/docs` + OpenJSON off in production,
  redoc removed; health returns only status + environment name.
- **8.6 WebSocket auth transport**: first-frame `{"type":"auth"}`
  handshake replaces URL tokens; 10 s auth timeout; 4401/4403 closes.
- **8.7 Payment hardening**: client `simulate` outcomes are
  development-only; production overrides the client value so the
  provider decision is authoritative.
- **8.8 Session cap**: `max_active_refresh_tokens_per_user` (10)
  enforced at login/refresh; oldest ACTIVE tokens revoked beyond cap.
- **8.9 Email verification gate**: `require_active_user` (403) on all
  marketplace endpoints; PENDING_VERIFICATION accounts can log in and
  reach verification only. Single-use hashed tokens in the existing
  `account_action_tokens` table (no migration); `POST /auth/verify-email`
  and `POST /auth/resend-verification` (generic, rate-limited, cooldown).
  No mailer in V1: the raw token is returned by register/resend for
  local activation (SPA Register page shows a verify-and-continue step).
- **8.10 Hidden-listing protection**: public listing detail serves
  ACTIVE/RESERVED/SOLD only; other statuses 404 except seller/admin.
  Favorites restricted to public listings. Anonymous access preserved
  (`get_optional_current_user`: missing credentials = anonymous,
  presented-but-invalid = 401).
- **8.11 Money upper bounds**: centralized `MAX_MONEY_MINOR` (INR 1
  crore in paise) on prices/offers/bids/auction parameters.
- **8.12 Auction auto-close**: in-process scheduler thread (30 s
  cadence, FastAPI lifespan) invoking the idempotent `close_auction`;
  manual close preserved; single-instance limitation documented.
- **8.13 Offer authorization**: accepting an offer rejects sibling
  PENDING offers in the same locked transaction; second accept 409s.
- **8.14 Input limits**: message bodies 2000, ticket descriptions 5000,
  subjects/reasons 200 chars.
- **8.15 Bid cap**: 200 bids/user/auction (429 beyond); seller self-bid
  403 preserved; collusion detection documented out of scope.
- **8.16 Duplicate-message suppression**: same sender+body within 15 s
  returns the original row (conversations + support replies).
- **8.17 Image metadata hardening**: MIME allowlist, 10 MiB, 10000 px
  caps on registration; byte-level validation deferred to the
  object-store backend.
- **Deferred (documented in DECISIONS §16)**: localStorage token
  storage (HttpOnly cookie rewrite rejected as high-risk), real email,
  real PSP, byte-level image checks, multi-instance infra.

Suites: all existing suites updated to activate accounts through the
new verification flow; **phase8_final_smoke** (55 checks) covers
8.7–8.17. Full regression: 19/19 suites `FAILURES: none`.
`npm run build` green. No new migrations (0017 remains head).

## Phase 9 — Documentation (working tree, current task)

- Created at the project root, then centralized under `docs/`:
  DECISIONS.md, FLOW.md, PROJECT_STATUS.md, AI_CHANGELOG.md, PHASES.md.
- DECISIONS.md restructured into formal decision records; FLOW.md
  rewritten with Mermaid diagrams.
- Documentation-only change: no application behavior touched.

## Phase 10 — UI/UX polish

- Not started (planned).
