# Architecture

## Phase 1 baseline

The application is a modular monolith. A React/Vite single-page application communicates with a FastAPI REST API. PostgreSQL is the authoritative persistent store. Docker Compose runs the three development services: `web`, `api`, and `postgres`.

```text
Browser -> React/Vite -> FastAPI -> PostgreSQL
```

The backend is organized by API, core configuration, database access/migrations, and future domain modules. Domain rules will remain in the API process rather than being split into microservices.

## Future domain boundaries

Future modules will include identity, users, catalog/listings, offers, favorites, conversations, notifications, reports, orders, auctions, payments, and administration. They may share one PostgreSQL database while owning their service-layer rules and repository access.

Listings will explicitly use `sale_type` with the values `FIXED_PRICE` and `AUCTION`. In V1, offers are allowed only for `FIXED_PRICE` listings.

## Authoritative state

The backend, not the browser, will calculate and persist prices, bid validity, current bid state, auction results, payment totals, and order transitions. Auction bids will use database transactions and row locking. A future background worker can close expired auctions idempotently.

The initial WebSocket implementation can be in-process because Phase 1 runs one API instance. Its event-publishing boundary will be isolated so Redis pub/sub can later support multi-instance fan-out. Rate limiting will likewise be added behind an application boundary; Redis is intentionally not part of V1 infrastructure.

## External integrations

File storage and payment handling will use provider interfaces. Phase 1 includes no provider implementation. Future development starts with local filesystem storage and a dummy payment provider, then can add S3, Google Cloud Storage, or real payment processors without changing domain workflows. No cloud provider is assumed.

## Configuration and migrations

Configuration comes from environment variables. `.env.example` documents safe development defaults, while `.env` is ignored by Git. Backend tools locate the repository-root `.env` when run from nested API directories; Compose injects the same settings into containers. PostgreSQL connection URLs are assembled by the backend from separate host, port, database, user, and secret password values so URL-special password characters are handled safely.

The development CORS allowlist is configured through `CORS_ORIGINS` and defaults to `http://localhost:5173`; credentialed wildcard origins are not allowed. Alembic migration scripts live in `apps/api/app/db/migrations` and use the shared `Base.metadata`. Compose runs `alembic upgrade head` before starting the API.

## Documentation index

- [DECISIONS.md](DECISIONS.md) — architecture & engineering decision record
- [FLOW.md](FLOW.md) — system and business flows
- [PHASES.md](PHASES.md) — phase roadmap and history
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — current project status
- [AI_CHANGELOG.md](AI_CHANGELOG.md) — AI-assisted development history
