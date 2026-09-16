# Marketplace Platform

Cloud-agnostic marketplace with fixed-price listings, offers, and live
auctions. Implemented through Phases 0–10 at `HEAD`: React 19 + Vite SPA,
FastAPI modular monolith, PostgreSQL 17, Docker Compose dev stack, 17
Alembic migrations, 18 backend smoke suites, JWT auth with email
verification, direct-publish catalog with post-publication admin
moderation, three-source checkout with expiry, DUMMY payments, order
fulfillment, reviews, notifications with WebSocket live push, messaging,
reports, support tickets, admin dashboards, and Phase 8 security hardening.

India-only V1: INR-only currency enforced at the schema level.

## Prerequisites

- Docker Engine with Docker Compose v2

For local, non-containerized frontend development, Node.js 20+ is recommended. For local API development, use Python 3.12+.

## Quick start

1. Create your local configuration:

   ```bash
   cp .env.example .env
   ```

2. Change `POSTGRES_PASSWORD` in `.env` to a local secret. Special characters
   are supported because the API constructs its PostgreSQL URL safely from
   individual connection settings.

3. Build and start the development stack:

   ```bash
   docker compose up --build
   ```

4. Open the frontend at `http://localhost:5173` and the API health endpoint at `http://localhost:8000/api/v1/health`.

Use `docker compose down` to stop the stack. Add `-v` only when you explicitly want to remove the local PostgreSQL data volume.

## Useful commands

```bash
# Show running services
docker compose ps

# Follow API logs
docker compose logs -f api

# Run pending database migrations
docker compose exec api alembic upgrade head

# Create a future migration after models are added
docker compose exec api alembic revision --autogenerate -m "describe_change"

# Confirm database metadata has no pending migrations
docker compose exec api alembic check

# Run a backend smoke suite against the live stack
docker compose exec -e PYTHONPATH=/app api python tests/catalog_smoke.py

# Build the frontend
npm run build --prefix apps/web
```

## Local development admin account

Development provisioning only — never use this in production.

Create (or upgrade) a local admin account interactively. The command prompts
for the admin email and a hidden password; it never prints credentials:

```bash
docker compose exec api python -m app.scripts.create_admin
```

If the account does not exist it is created with the ADMIN role (existing
roles are never removed when upgrading an existing account). Afterwards,
sign in through the marketplace login page at `http://localhost:5173/#/login`
and open the admin panel at `http://localhost:5173/#/admin`.

Accounts register as PENDING_VERIFICATION and must verify via
`POST /api/v1/auth/verify-email` (the raw token is returned by
register/resend for local activation; production needs a mailer) before
using marketplace endpoints. Login stays allowed so users can reach
verification.

## Features by phase

- **Phases 2–3:** full domain schema (17 migrations) + REST APIs — auth,
  catalog, offers, auctions/bids, addresses, three checkout sources
  (fixed-price / accepted-offer / auction-win), orders + DUMMY payments +
  ship/deliver, seller order views.
- **Phase 4:** admin read dashboards + moderation (remove/restore listings,
  suspend/reactivate users, remove reviews, resolve reports, manage tickets)
  with audit trail.
- **Phase 5–6:** buyer storefront (discovery, detail, favorites, checkout,
  payment, orders) + seller listing management + offers/auction UI + user
  and seller profiles.
- **Phase 7:** reviews on DELIVERED orders, notifications with WebSocket
  live push (first-frame auth handshake), messaging, reports, support
  tickets with threads.
- **Phase 8:** security hardening 8.1–8.17 — refresh rotation with family
  revocation, rate limits, session cap (10), checkout expiry with lazy
  cancellation, reserve enforcement, security headers/Host check/body cap,
  prod-off docs, payment simulation gated to development, hidden-listing
  protection, money bounds (INR 1 crore), 30 s auction auto-close scheduler
  (single-instance), sibling-offer rejection, input ceilings, bid cap (200),
  duplicate-message suppression, image metadata validation.
- **Phase 10:** storefront/admin UI polish — sell wizard, account workspace,
  category browse/mega-menu, checkout components, chat/support components,
  admin UI polish, styles rewrite. Frontend-only; no migration beyond 0017.

## Listing lifecycle

Sellers publish DRAFT → ACTIVE immediately via
`POST /catalog/listings/{id}/submit` (validated). No approval queue.
Moderation is post-publication: ADMIN ACTIVE ↔ REMOVED (remove/restore with
reason + audit row + seller notification). `PENDING_REVIEW` / `REJECTED`
enum values are retained for historical rows only.

## Test status

Backend: 18 stdlib HTTP smoke suites run against the live Docker stack
(`auth`, `auth_hardening`, `catalog`, `offers`, `auctions`, `checkout`,
`offer_checkout`, `auction_checkout`, `seller_workflow`, `admin`,
`admin_moderation`, `profile`, `reviews`, `notifications`,
`phase7_remaining`, `order_expiry`, `auction_reserve`, `phase8_final`) —
all report `FAILURES: none`. Frontend: no automated suite;
`npm run build` passes, verification is manual through the SPA.

See `docs/PROJECT_STATUS.md` for known limitations (single-instance,
localStorage tokens, no mailer, DUMMY PSP, metadata-only images, no CI).

## Project layout

```text
apps/api/       FastAPI modular-monolith backend
  app/{identity,catalog,trading,orders,admin,notifications,messaging,
       reports,reviews,support,ws}/  domain modules
  app/db/migrations/versions/        Alembic migrations 0001–0017
  tests/                             18 smoke suites + helpers.py
apps/web/       React + Vite frontend (pages, components, admin, hooks)
docs/           Project documentation (decisions, flows, phases, status)
infra/          Reserved for reusable infrastructure assets
compose.yaml    Local development stack
```

See [architecture.md](docs/architecture.md) for boundaries and future-ready
integration seams, [DECISIONS.md](docs/DECISIONS.md) for the decision
record, [FLOW.md](docs/FLOW.md) for system and business flows,
[PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for current status, and
[PHASES.md](docs/PHASES.md) for the phase roadmap.
