# Marketplace Platform

Foundation for a cloud-agnostic marketplace with fixed-price listings and live auctions. Phase 1 provides the development platform only: React/Vite, FastAPI, PostgreSQL, Docker Compose, environment configuration, and database migrations.

Business features—including authentication, listings, offers, auctions, payments, messaging, and administration—are intentionally not implemented yet.

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
```

## Project layout

```text
apps/api/       FastAPI modular-monolith backend
apps/web/       React + Vite frontend
docs/           Architecture and development documentation
infra/          Reserved for reusable infrastructure assets
compose.yaml    Local development stack
```

See [architecture.md](docs/architecture.md) for boundaries and future-ready integration seams.
