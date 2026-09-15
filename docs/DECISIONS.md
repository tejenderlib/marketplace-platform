# Architecture & Engineering Decisions

This record captures the confirmed decisions that shaped the
marketplace-platform, as supported by the repository code, migrations, and
git history. It documents *why* each choice was made so future changes stay
consistent.

Status legend: **Adopted** (implemented), **Deferred** (deliberately not
implemented in V1).

---

## 1. Frontend: React + Vite + JavaScript

**Decision.** Build the SPA with React 19, Vite, and plain JavaScript.

**Context.** Phase 1 needed a fast, lightweight frontend toolchain for a
marketplace storefront and admin panel, without imposing a type system on a
small team or AI-assisted workflow.

**Rationale.** Vite gives near-instant HMR and a static production build;
React provides a mature component ecosystem. Plain JavaScript keeps the
build simple and avoids the configuration/maintenance overhead of a
TypeScript migration mid-project.

**Current implementation.** `apps/web` is a single-page application with
hand-written CSS (`styles.css`), no UI framework, routed client-side
(hash-based routes). It talks to the API over REST; the browser never
computes prices, bid validity, or order totals.

**Future consideration.** UI/UX polish (Phase 10) may introduce a component
library or CSS framework. TypeScript remains an option but is not planned.

---

## 2. Backend: FastAPI + Python 3.12

**Decision.** Serve the API from a single FastAPI application on Python 3.12.

**Context.** The domain (catalog, offers, auctions, payments) needs strict
request validation and clear API contracts with minimal boilerplate.

**Rationale.** Pydantic models validate requests/responses declaratively,
OpenAPI docs come for free, and async support fits both REST and WebSocket
handling in one process.

**Current implementation.** `apps/api/app/main.py` exposes a versioned REST
surface under `/api/v1` (auth, catalog, offers, auctions, addresses,
checkout, orders, admin, profile, reviews, notifications, messages,
reports, support, health) plus one WebSocket route (`/api/v1/ws`).
Authentication uses PyJWT + bcrypt.

**Future consideration.** None structural; scaling concerns are handled by
the modular-monolith boundaries (see §7) rather than a framework change.

---

## 3. Database: PostgreSQL as the single authoritative store

**Decision.** PostgreSQL 17 is the only persistent store for all business
state.

**Context.** The marketplace is transactional by nature: bids, checkout
reservations, and payments race against each other and need ACID guarantees.

**Rationale.** Row locking (`SELECT ... FOR UPDATE`), native enums, JSONB,
partial unique indexes, and `TIMESTAMPTZ` cover the hard concurrency
requirements (one live order per listing, one winning bid, idempotent
payments) without a distributed coordination layer.

**Current implementation.** All domains — users, listings, offers,
auctions, bids, orders, payments, reviews, reports, tickets, notifications
— persist to PostgreSQL. No caches, queues, or secondary stores exist in V1
(see §12).

**Future consideration.** A cache (Redis) is intentionally deferred (§12);
read replicas would be a deployment-time addition requiring no schema
change.

---

## 4. ORM & migrations: SQLAlchemy 2.x + Alembic

**Decision.** Use SQLAlchemy 2.x declarative models with Alembic-managed
migrations.

**Context.** The schema evolves phase by phase and every change must be
reproducible in dev, CI-like smoke runs, and production.

**Rationale.** SQLAlchemy 2.x `Mapped`/`mapped_column` gives typed models
with Python-native column defaults; Alembic keeps a linear, reviewable
migration history (`0001`–`0017`) and supports `alembic check` drift
detection.

**Current implementation.** Shared `DeclarativeBase` (`app/db/base.py`);
each domain module owns its tables. Compose runs `alembic upgrade head`
before the API starts. Migrations use PostgreSQL-specific types
deliberately: `UUID`, `TIMESTAMPTZ`, native `ENUM`, `JSONB`, partial unique
indexes.

**Future consideration.** Autogenerate remains the workflow
(`alembic revision --autogenerate`); no additional tooling planned.

---

## 5. Interface: REST + WebSockets (REST-primary)

**Decision.** Business operations are REST; a single WebSocket route only
pushes real-time notification events.

**Context.** The SPA needs both request/response operations and live
updates (outbid, auction won, order shipped).

**Rationale.** Keeping WebSockets push-only means every state change flows
through the auditable, lock-protected REST path — there is no second
authoritative protocol to secure or reconcile.

**Current implementation.** Domain routers under `app/api/v1`; WebSocket
`/api/v1/ws` (auth via token query param) with an in-process
`ConnectionManager` (`app/ws/manager.py`) fanning out notification events
to the right user sockets.

**Future consideration.** Multi-instance deployment would move the fan-out
behind a Redis pub/sub boundary; the manager is isolated for exactly that
swap.

---

## 6. Runtime: Docker Compose for development

**Decision.** One command (`docker compose up --build`) runs the full dev
stack: `postgres`, `api`, `web`, plus a local Adminer.

**Context.** Phase 1 (commit `ea5f7e7`) established a reproducible
environment before any business logic existed.

**Rationale.** Compose gives every contributor an identical stack —
Postgres version, migration-on-boot, and hot reload (uvicorn `--reload`,
Vite dev server) — with configuration injected from the root `.env`
(see `.env.example`), so no cloud provider is assumed.

**Current implementation.** The API container volume-mounts source and
runs migrations before startup; the web container runs Vite on port 5173.
Backend smoke suites run inside the container
(`docker compose exec api python tests/<suite>.py`).

**Future consideration.** Production deployment artifacts are intentionally
out of scope for V1; `infra/` is reserved for reusable infrastructure
assets.

---

## 7. Architecture: modular monolith

**Decision.** One deployable API process organized by domain modules; no
microservices.

**Context.** Cross-domain flows (auction settlement touching bids, results,
orders, listings, notifications) must be atomic.

**Rationale.** A single database + in-process module boundaries
(`identity`, `catalog`, `trading`, `orders`, `admin`, `notifications`,
`messaging`, `reports`, `reviews`, `support`, `ws`) keep V1 transactions
simple — auction settlement commits atomically — while module-owned models,
schemas, and service rules preserve seams for later extraction.

**Current implementation.** Each module owns its tables and rules and
shares one PostgreSQL database; domain logic never leaves the API process.

**Future consideration.** If scale demands it, hot modules could be
extracted using the existing boundaries; that is not planned for V1.

---

## 8. IDs: application-generated UUID primary keys

**Decision.** Every table uses `UUID` primary keys generated by the
application (`default=uuid.uuid4`).

**Context.** API identifiers appear in URLs, client state, and future
integrations.

**Rationale.** Opaque non-guessable IDs avoid enumeration, allow future
distributed generation, and remove sequential-ID leakage of business volume.

**Current implementation.** All 17 migrations create `UUID` PKs; no serial
integer keys exist.

**Future consideration.** None; the convention is closed.

---

## 9. Time: UTC via TIMESTAMPTZ

**Decision.** All timestamps are `TIMESTAMPTZ` (`DateTime(timezone=True)`)
with UTC server defaults; no naive datetimes are stored.

**Context.** Auction windows, offer expiry, and checkout deadlines are
compared against wall-clock time.

**Rationale.** Timezone-aware storage prevents DST/offset ambiguity in
deadline math; UTC-aware application code (`datetime.now(timezone.utc)`)
matches the `func.now()` server default.

**Current implementation.** Every model timestamp column is timezone-aware
UTC; checkout windows (`checkout_expires_at`) and auction windows
(`starts_at`/`ends_at`) rely on it directly.

**Future consideration.** None; India-only (INR) V1 could display IST
client-side without storage changes.

---

## 10. Money: BIGINT minor units, INR only

**Decision.** Store all money as `BIGINT` minor units (paise) — never
floats — with `CHAR(3)` currency columns constrained to `'INR'`.

**Context.** Prices move between listings, offers, auction results, orders,
and payments, and each hop must stay exact.

**Rationale.** Integer minor units eliminate floating-point rounding
errors; a pinned currency keeps tax/display logic single-currency for V1.
Schema-level checks (`ck_*_currency_inr`, migration 0006) make the policy
enforceable by the database, not just application discipline.

**Current implementation.** Prices always come from locked server-side
rows (listing, offer, or auction result); clients never send amounts that
get trusted. No `NUMERIC`/float money columns exist.

**Future consideration.** Multi-currency would require relaxing the check
constraints and a currency-aware payment abstraction; explicitly out of
scope for V1.

---

## 11. Data model: PostgreSQL enums + status-managed entities

**Decision.** (a) Business-critical states are native PostgreSQL enums.
(b) Major entities transition through status fields and are never
hard-deleted when they carry business history.

**Context.** Invalid states and lost history are the two most expensive
classes of marketplace bugs.

**Rationale.** Native enums reject invalid states at the database, not
just the API. Status management preserves audit trail and references:
cross-entity links use `RESTRICT`; subordinate snapshot/history rows use
`CASCADE`. Immutable snapshots (order shipping address, order status
history, listing title snapshots, payments) record what happened at the
time rather than referencing mutable data.

**Current implementation.** Enums include `listing_status`, `offer_status`,
`auction_status`, `bid_status`, `auction_result_status`, `order_status`,
`order_source`, `shipment_status`, `payment_status`, `payment_provider`,
`address_status`, plus review/report/support/notification enums. Managed
entities: listings, offers, orders, reviews, tickets, notifications.

**Future consideration.** Adding enum values requires Alembic migrations
(`ALTER TYPE ... ADD VALUE`) — an accepted cost for database-level
integrity.

---

## 12. Infrastructure: cloud-agnostic, Redis intentionally deferred

**Decision.** No cloud provider is assumed, and Redis is deliberately not
part of V1.

**Context.** V1 runs a single API instance with no background workers.

**Rationale.** The in-process WebSocket manager and in-process fixed-window
rate limiters (`app/ws/manager.py`, `app/core/rate_limit.py`) are sufficient
for one instance. Expiry of offers, auction checkout windows, and orders is
**lazy** — flips happen inside the request that touches the row, under row
locks, which also removes any need for a scheduler in V1. Storage and
payments sit behind provider abstractions (§13, §14) so nothing is
cloud-specific.

**Current implementation.** Compose injects env-only configuration; no
Redis, queues, or schedulers exist in the stack or codebase.

**Future consideration.** Scaling beyond one instance would add Redis
pub/sub for WebSocket fan-out and shared rate-limit counters — the
boundaries are isolated so it can be added without redesign. A background
auction-close scheduler could remove the manual close endpoint. Local
filesystem storage and the dummy provider (§13, §14) are the V1 backing
implementations.

---

## 13. Files: storage abstraction (local storage today, S3/GCS later)

**Decision.** Image uploads register `storage_key` references in the
database; the V1 backing store is local, with the domain schema designed
for a future object store.

**Context.** Image bytes flowing through the API would couple request
sizing, validation, and storage I/O before the real provider choice is
made.

**Rationale.** Decoupling metadata (content type, byte size, dimensions in
`listing_images`) from byte storage means the future S3/GCS backend is a
swap behind the existing registration seam, not a schema change.

**Current implementation.** The image API registers references — "resolved
by the future storage backend" (`app/api/v1/catalog.py`); no bytes flow
through the current API.

**Future consideration.** Implement a real object-storage backend
(post-V1) that resolves the recorded `storage_key` values.

---

## 14. Payments: provider abstraction with DummyPaymentProvider

**Decision.** Payments run behind a `PaymentProviderBase` protocol; V1 ships
`DummyPaymentProvider`.

**Context.** Real PSP integration (Stripe/Razorpay) is a future phase and
must not reshape order workflows.

**Rationale.** A protocol returning a frozen `PaymentResult` makes payment
success/failure a testable seam; the dummy provider settles locally with
generated references and a `simulate` outcome for success/failure testing,
and no card data ever flows through the API.

**Current implementation.** `app/orders/provider.py` defines the protocol;
the `payments` table records the provider and `provider_reference`.
Swapping in a real PSP later means implementing the protocol, not changing
order workflows.

**Future consideration.** Real PSP integration post-V1 behind the existing
protocol (see `docs/architecture.md` backlog).

---

## 15. Authority: backend-authoritative pricing, bids, orders, payment state

**Decision.** The backend — never the browser — calculates and persists
prices, bid validity, current-bid state, auction results, payment totals,
and order transitions.

**Context.** Marketplace clients (SPA, future mobile) cannot be trusted
with money math or state transitions.

**Rationale.** Every mutation re-validates state under `SELECT ... FOR
UPDATE` row locks, and idempotency comes from unique keys (offer/bid
`request_id`, payment `idempotency_key`, one result row per auction, one
live order per listing) rather than client cooperation. This makes races
between bidding, checkout, and payment safe by construction.

**Current implementation.** Checkout prices come only from locked listing,
offer, or auction-result rows; bid placement validates amount floors
against locked auction state; settlement and payment flip statuses
atomically with listing/order/result rows.

**Future consideration.** None; this is a closed architectural invariant.

---

## 16. Security & lifecycle decisions (Phase 8)

**Decision.** A layered hardening set adopted across Phase 8 (8.1–8.17),
plus explicit deferrals for the few items whose correct fix exceeds V1.

**Context.** Phases 1–7 shipped functionality; Phase 8 addresses the
known security and reliability gaps before polish and production
readiness. 8.1–8.3 landed first (auth rotation/rate limits, checkout
expiry, reserve enforcement); the remaining audit items were completed
after a Phase 9 documentation snapshot.

**Rationale & current implementation.**

- **Refresh-token rotation with family revocation** (8.1): refresh tokens
  are one-time-use rows storing only a hash; each refresh issues a new
  token in a `family_id`, and reusing a rotated token revokes the whole
  family. `ACTIVE`/`REVOKED` states, `auth_refresh_tokens` table
  (migration 0016).
- **Auth rate limiting** (8.1): fixed-window in-process limiters —
  per-IP on register/login, per-account counting *failed* logins only
  (successful login clears the counter), configurable via `AUTH_*`
  settings.
- **Session cap** (8.8): `max_active_refresh_tokens_per_user` (10) is
  enforced at login/refresh; the oldest ACTIVE tokens are revoked
  beyond the cap, bounding concurrent sessions without touching
  family replay detection or logout.
- **Order/checkout expiry** (8.2): every checkout stamps
  `orders.checkout_expires_at`; past-due unpaid orders are lazily
  cancelled on read or payment attempt, releasing the `RESERVED` listing
  back to `ACTIVE` (migration 0017). The one-order-per-listing rule
  became a partial unique index excluding `CANCELLED` rows so a released
  listing can be purchased again.
- **Auction reserve-price enforcement** (8.3): settlement compares the
  top bid against `reserve_minor` inside the locked close transaction;
  below-reserve closes produce the canonical `NO_BIDS` result with no
  winner and no checkout state. The reserve is intentionally *visible*
  (not blind) in V1.
- **Auction auto-close** (8.12): an in-process daemon thread (30 s
  cadence, started via FastAPI lifespan) closes past-due LIVE auctions
  by calling the same idempotent, row-locked `close_auction` used by the
  manual endpoint. Idempotency makes overlapping manual/automatic closes
  safe; single-instance scope matches the rest of the V1 deployment
  (WebSocket manager, rate limiters). Multi-instance deployments need
  exactly one closer (leader election) — post-V1.
- **Payment authority** (8.7): the dummy provider's `simulate` outcome
  is a development affordance only. `payments_allow_simulated_outcomes`
  (or `ENVIRONMENT=production`) closes the gate: the server overrides
  the client value and the provider decides — a client cannot force a
  successful payment in production.
- **Email verification gate** (8.9): accounts register as
  PENDING_VERIFICATION and cannot use marketplace endpoints
  (`require_active_user`, 403) until verified; login itself stays
  allowed so users can reach verification. Tokens are single-use,
  SHA-256-hashed rows in the pre-existing `account_action_tokens`
  table (no migration), looked up by hash only (no account
  enumeration), 7-day TTL, resend cooldown. No email infrastructure
  exists in V1, so register/resend return the raw token for local
  activation — production needs a mailer (post-V1).
- **Hidden-listing protection** (8.10): the public detail route serves
  only ACTIVE/RESERVED/SOLD listings; DRAFT/PENDING_REVIEW/REJECTED/
  REMOVED/ARCHIVED return 404 unless the caller is the seller or an
  admin. Favorites are likewise restricted to public listings. The
  anonymous viewer dependency downgrades only *missing* credentials to
  anonymous; presented-but-invalid tokens still 401.
- **Money upper bounds** (8.11): a single `MAX_MONEY_MINOR`
  (1_000_000_000 paise = INR 1 crore) caps listing prices, offers,
  bids, starting bids, increments, and reserves at the schema layer,
  preserving BIGINT storage and stopping overflow/absuse while leaving
  legitimate use untouched.
- **Offer authorization** (8.13): accepting an offer requires an ACTIVE
  listing and, inside the same locked transaction, rejects all sibling
  PENDING offers on that listing — at most one offer can ever reach
  ACCEPTED/checkout per listing (the one-order-per-listing partial
  unique index remains the backstop).
- **Input limits** (8.14): messaging/support/report text ceilings
  (2000-char message bodies, 5000-char ticket descriptions, 200-char
  subjects/reasons) join the existing schema bounds; the global 1 MiB
  request-body cap from 8.4 stops wholesale payload abuse.
- **Bid cap & shill safeguards** (8.15): `max_bids_per_user_per_auction`
  (200) returns 429 when exceeded; the seller self-bid block (403)
  remains. Advanced collusion detection is explicitly out of V1 scope.
- **Duplicate-message suppression** (8.16): an identical body from the
  same sender in the same conversation/ticket within 15 seconds returns
  the original row instead of creating a duplicate — accidental
  double-submits stay harmless while genuinely different content always
  creates new rows.
- **Image metadata hardening** (8.17): MIME allowlist (jpeg/png/webp/
  gif, case-normalized), 10 MiB byte-size ceiling, 10000 px dimension
  caps, enforced on registration. The API never receives file bytes in
  V1; the future object-store backend must re-validate real uploads
  against the same policy — metadata alone proves nothing about bytes.
- **Concurrency discipline throughout**: bid placement, checkout,
  payment, cancel, and auction close take row locks and re-validate
  state under the lock (see §15).
- **Authorization is server-side only**: ADMIN privilege always comes
  from role rows joined in the backend (`app/catalog/dependencies.py`),
  never from client claims; suspended users cannot authenticate.

**Deliberate deferrals (documented, not silently missing).**

- **Browser token storage stays localStorage.** Moving to HttpOnly
  cookies requires same-origin SPA/API serving plus CSRF protection —
  a full auth-architecture rewrite that risks breaking the working
  cross-origin Vite/FastAPI split for marginal V1 gain. Deferred to a
  dedicated post-V1 task; 15-minute access tokens + rotating refresh
  families bound the blast radius of token theft in the meantime.
- **Host validation default-off**: the empty `ALLOWED_HOSTS` allowlist
  disables Host checking locally (Docker/Vite bind many hostnames);
  production deployments must pin hosts via `ALLOWED_HOSTS`.
- **Health endpoint exposes the environment *name*** (`development`/
  `production`) — an operational signal, not a secret; no config values
  are leaked.
- Real email delivery, real PSP, byte-level image validation,
  Redis-backed shared limiting/scheduling, collusion detection:
  post-V1 backlog (see PROJECT_STATUS.md).
