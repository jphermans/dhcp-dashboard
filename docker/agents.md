# Docker

## Purpose
Docker and Docker Compose configuration for building, running, and deploying the DHCP Dashboard on any Linux host, including Raspberry Pi 4/5 (ARM64).

## Ownership
Owned by the root AGENTS.md. All Docker configuration must comply with project-wide standards and the DOX framework.

## Local Contracts
- Multi-stage builds: one stage for the backend (Python + FastAPI), one for the frontend (Node.js build + Nginx).
- Docker Compose orchestrates backend (port 8000), frontend (port 80), and optional PostgreSQL.
- All images must support `linux/amd64` and `linux/arm64` platforms.
- Volumes for persistent data (SQLite database, logs) must be declared in docker-compose.yml.
- Environment variables passed via `.env` file, not hardcoded in Dockerfile.
- Reverse proxy via Nginx with WebSocket upgrade support.

## Work Guidance
- Build backend: `docker build -t dhcp-dashboard-backend -f docker/Dockerfile.backend .`
- Build frontend: `docker build -t dhcp-dashboard-frontend -f docker/Dockerfile.frontend .`
- Start stack: `docker compose up -d`
- For development, use bind mounts to reflect code changes without rebuild.
- Use `.dockerignore` to exclude node_modules, __pycache__, .venv, and git artifacts.
- Keep images small; prefer `alpine` or `slim` base images where possible.

## Verification
- `docker compose config` must validate successfully.
- `docker compose up` must start all services without errors.
- Backend must respond on `http://localhost:8000/health`.
- Frontend must serve on `http://localhost` and proxy API requests to backend.
- Cross-platform builds: `docker buildx build --platform linux/amd64,linux/arm64 .` must succeed.

## Child DOX Index
No child DOX files — this folder contains only Docker/Compose configuration, no further nested domains.
