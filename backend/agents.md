# Backend

## Purpose
Python 3.12+ FastAPI server providing REST and WebSocket APIs for the DHCP Dashboard.

## Ownership
Owned by the root AGENTS.md. All backend code must comply with project-wide standards and the DOX framework.

## Local Contracts
- Database: SQLite by default, PostgreSQL optional via `DATABASE_URL` env var.
- Authentication: JWT access tokens issued by `POST /api/v1/auth/login`, Argon2 password hashing, role-based access (admin, operator, read-only).
- API base path: `/api/v1`.
- WebSocket endpoint: `/api/v1/ws` for real-time dashboard updates.
- All endpoints return JSON; errors follow `{ "detail": "..." }` format.
- Configuration loaded from `.env` via Pydantic settings.
- Background tasks for monitoring, alerts, and DHCP lease scans.

## Work Guidance
- New endpoints go in `app/api/endpoints/` with route prefix from `app/main.py`.
- Business logic belongs in `app/services/`, not in route handlers.
- Integration adapters (Pi-hole, dnsmasq, Kea, Bind9, etc.) go in `app/integrations/`.
- SQLAlchemy models go in `app/models/`, Pydantic schemas in `app/schemas/`.
- Use Alembic for database migrations.
- Run with `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- OpenAPI docs available at `/api/docs`.

## Verification
- `pytest` tests in `tests/` must pass.
- `uvicorn app.main:app` must start without import errors.
- `/api/docs` must serve interactive API documentation.
- `/health` endpoint must return 200.
- Login endpoint must return JWT and reject invalid credentials.

## Child DOX Index
No child DOX files — subdirectories (app, tests, data, migrations) are structural, not independent domains.
