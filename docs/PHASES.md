# Phase Roadmap & History

Phase plan for the marketplace-platform, with actual completion status.
"Working tree" means implemented but not yet committed (see
[PROJECT_STATUS.md](PROJECT_STATUS.md)).

| Phase | Name | Status |
|-------|------|--------|
| 0 | Planning & scope | Completed |
| 1 | Foundation | Completed |
| 2 | Database | Completed |
| 3 | Backend APIs | Completed |
| 4 | Admin | Completed |
| 5 | Storefront | Completed |
| 6 | Marketplace/User Interaction | Completed |
| 7 | Communication, Trust & Support | Completed (working tree) |
| 8 | Security & Reliability | **Partially complete** |
| 9 | Documentation | In progress (this task) |
| 10 | UI/UX Polish | Planned |

## Phase 0 — Planning & scope

Concept, cloud-agnostic modular-monolith architecture, India-only INR
marketplace with fixed-price + auction sales. No code.

## Phase 1 — Foundation

React 19 + Vite SPA, FastAPI app, PostgreSQL 17, Docker Compose stack,
env configuration, Alembic baseline, health endpoint, admin provisioning
script. Commit: `ea5f7e7` (2026-09-09).

## Phase 2 — Database

Full domain schema, SQLAlchemy 2.x models + 12 migrations (identity,
catalog, trading, orders/payments, INR-only currency, canonicalization
passes, settled_at, moderation audit). Conventions: UUID PKs, TIMESTAMPTZ
UTC, BIGINT minor units, PG enums, status-managed entities, immutable
snapshots/history.

## Phase 3 — Backend APIs

All domain REST endpoints: auth, catalog, offers, auctions/bids,
addresses, three checkout sources, orders + DUMMY payments +
fulfillment (ship/deliver), seller order views. Row-locked, idempotent,
server-priced. Smoke suites for every domain.

## Phase 4 — Admin

Admin read dashboards (users, listings, orders, auctions, payments,
reviews, reports, support, moderation audit) and post-publication
moderation actions (remove/restore listings) with audit trail.

## Phase 5 — Storefront

Buyer SPA: discovery, detail, favorites, checkout, payment, orders.
Seller SPA: listing management, direct-publish workflow (DRAFT -> ACTIVE
immediately; post-publication admin moderation), seller orders.
Verified manually; no automated FE tests.

## Phase 6 — Marketplace/User Interaction

Profiles (user/seller), offers UI (negotiate + offer checkout), auction
UI (panel, bidding, auction checkout). Committed through
`5a03cdd` (2026-09-14).

## Phase 7 — Communication, Trust & Support — Completed (working tree)

- 7.1 Ratings & reviews (migration 0013)
- 7.3a Notifications (migration 0014) + WebSocket live push
- 7.3b–f Messaging, reports, support (migration 0015) + notification
  wiring across domains

## Phase 8 — Security & Reliability — Completed (working tree)

| Sub-phase | Work | Status |
|-----------|------|--------|
| 8.1 | Auth hardening: refresh-token rotation with family revocation (migration 0016); register/login rate limiting | Completed |
| 8.2 | Order/checkout expiry: `checkout_expires_at`, lazy cancellation + reservation release, partial unique listing-order index, buyer cancel endpoint (migration 0017) | Completed |
| 8.3 | Auction reserve-price enforcement at settlement (no winner below reserve) | Completed |
| 8.4 | Global API hardening: security headers, Host validation (allowlist in production), 1 MiB request-body cap, safe 500/422 responses with server-only error logging | Completed |
| 8.5 | OpenAPI/health exposure: `/docs` + OpenAPI disabled in production, redoc removed; health reports only status + environment name | Completed |
| 8.6 | WebSocket auth transport: first-frame token handshake (no token in URLs/logs), policy-code closes (4401/4403) | Completed |
| 8.7 | Payment hardening: client `simulate` outcomes development-only; production forces provider-decided outcomes | Completed |
| 8.8 | Session cap: `max_active_refresh_tokens_per_user` enforced at login/refresh (oldest ACTIVE revoked beyond cap) | Completed |
| 8.9 | Email verification gate: PENDING_VERIFICATION accounts blocked from marketplace endpoints (`require_active_user`); single-use hashed verification tokens via existing `account_action_tokens` table; verify-email + resend-verification endpoints; no email infrastructure in V1 (token surfaced in register response for local use) | Completed |
| 8.10 | Hidden listing protection: public detail route serves only ACTIVE/RESERVED/SOLD; non-public statuses 404 except seller/admin; favorites restricted to public listings | Completed |
| 8.11 | Money/bid upper bounds: centralized `MAX_MONEY_MINOR` (INR 1 crore in paise) on listing prices, offers, bids, auction parameters | Completed |
| 8.12 | Auction auto-close: in-process scheduler thread (30 s cadence) closing past-due LIVE auctions via the idempotent `close_auction`; single-instance V1 limitation documented | Completed |
| 8.13 | Offer authorization: accepting an offer rejects sibling PENDING offers in the same locked transaction (at most one ACCEPTED per listing) | Completed |
| 8.14 | Input limits: message/support/report text ceilings (2000/5000/200 chars) alongside the global body cap | Completed |
| 8.15 | Bid cap: `max_bids_per_user_per_auction` enforced (429); seller self-bid remains blocked; advanced collusion detection out of V1 scope | Completed |
| 8.16 | Duplicate-message suppression: identical sender+body in a conversation/ticket inside a 15 s window returns the original row | Completed |
| 8.17 | Image metadata hardening: MIME allowlist (jpeg/png/webp/gif), 10 MiB size ceiling, 10000 px dimension caps; byte-level validation deferred to the future object-store backend | Completed |

Deferred (documented, not V1): browser token storage remains localStorage
(HttpOnly-cookie architecture rejected for V1 as a high-risk auth rewrite
given the cross-origin SPA/API split — see DECISIONS.md §16), real email
delivery, real payment provider, byte-level image validation, Redis-backed
shared rate limiting/scheduling for multi-instance deployments.

## Phase 9 — Documentation — In progress

Centralized project documentation under `docs/`: DECISIONS.md, FLOW.md,
PROJECT_STATUS.md, AI_CHANGELOG.md, PHASES.md (this file), alongside the
existing Phase 1 architecture baseline. Documentation only; no behavior
changes.

## Phase 10 — UI/UX Polish — Planned

Storefront and admin SPA polish. Not started.

## Post-V1 backlog (from [architecture.md](architecture.md))

Real object storage (S3/GCS), real payment provider behind the existing
abstraction, multi-instance deployment (Redis pub/sub for WebSockets,
shared rate limiting, leader-elected auction-close scheduling), email
delivery service, HttpOnly-cookie token architecture (if the SPA is
served same-origin), byte-level image validation, collusion detection.
