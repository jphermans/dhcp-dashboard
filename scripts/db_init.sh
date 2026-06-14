#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# DHCP Dashboard — Standalone Database Initializer
# Run independently when install script step 7 fails.
# Safe to run multiple times (idempotent).
# ──────────────────────────────────────────────────────────────

# Colors
RED='\033[0;31m';   GREEN='\033[0;32m'
YELLOW='\033[1;33m'; CYAN='\033[0;36m'
GRAY='\033[0;90m';   BOLD='\033[1m'; NC='\033[0m'

CHK="${GREEN}✔${NC}"
CROSS="${RED}✘${NC}"

echo -e "${BOLD}${CYAN}DHCP Dashboard — Database Initializer${NC}"
echo ""

# ── Settings (adjust if you customized the installer) ─────────
INSTALL_DIR="${INSTALL_DIR:-/opt/dhcpdashboard}"
DATA_DIR="${DATA_DIR:-/var/lib/dhcpdashboard}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin123}"

if [ ! -d "$INSTALL_DIR/backend" ]; then
    echo -e "${CROSS}  ${RED}Backend not found at $INSTALL_DIR/backend${NC}"
    echo -e "  ${GRAY}Run the main installer first.${NC}"
    exit 1
fi

cd "$INSTALL_DIR/backend"

# ── Check .env exists ────────────────────────────────────────
if [ ! -f .env ]; then
    echo -e "${CROSS}  ${RED}No .env file found in $(pwd)${NC}"
    exit 1
fi

# Ensure data directory exists
sudo mkdir -p "$DATA_DIR"
sudo chown -R www-data:www-data "$DATA_DIR"
echo -e "  ${CHK} Data directory: ${GREEN}$DATA_DIR${NC}"

# ── Activate virtualenv ──────────────────────────────────────
VENV_DIR="$INSTALL_DIR/backend/venv"
if [ ! -f "$VENV_DIR/bin/python" ]; then
    echo -e "${CROSS}  ${RED}Virtualenv not found at $VENV_DIR${NC}"
    exit 1
fi

export PATH="$VENV_DIR/bin:$PATH"
echo -e "  ${CHK} Python: ${GREEN}$($VENV_DIR/bin/python --version 2>&1)${NC}"

# ── Load env vars ────────────────────────────────────────────
set -a
# shellcheck disable=SC1091
source .env
set +a

# Override DATABASE_URL with async driver and absolute path
DATABASE_URL="${DATABASE_URL#*:///}"   # strip scheme
DATABASE_URL="sqlite+aiosqlite:///${DATABASE_URL}"
export DATABASE_URL

if [ -z "${SECRET_KEY:-}" ]; then
    echo -e "${CROSS}  ${RED}SECRET_KEY is empty in .env${NC}"
    exit 1
fi

echo -e "  ${CHK} DATABASE_URL: ${GRAY}${DATABASE_URL}${NC}"
echo -e "  ${CHK} SECRET_KEY: ${GRAY}$(echo "$SECRET_KEY" | head -c 12)...${NC}"

# ── Check aiosqlite is installed ─────────────────────────────
if ! "$VENV_DIR/bin/python" -c "import aiosqlite" 2>/dev/null; then
    echo -e "${CROSS}  ${RED}aiosqlite is NOT installed. Installing...${NC}"
    "$VENV_DIR/bin/pip" install aiosqlite
    echo -e "  ${CHK} aiosqlite installed.${NC}"
else
    echo -e "  ${CHK} aiosqlite: ${GREEN}installed${NC}"
fi

# ── Run database initialization ──────────────────────────────
set +e
error_output=$("$VENV_DIR/bin/python" -c "
import asyncio, sys
sys.path.insert(0, '.')

from app.db.session import engine, async_session_factory
from app.db.base import Base
from app.core.security import get_password_hash
from app.models import User
from sqlalchemy import select

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('✅ Database tables created.')

    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(User.username == '$ADMIN_USER')
        )
        existing = result.scalar_one_or_none()
        if not existing:
            new_user = User(
                username='$ADMIN_USER',
                email='$ADMIN_USER@localhost',
                full_name='Admin',
                hashed_password=get_password_hash('$ADMIN_PASS'),
                role='admin',
                is_active=True,
                password_change_required=True
            )
            session.add(new_user)
            await session.commit()
            print('✅ Admin user created.')
        else:
            print('ℹ️  Admin user already exists — skipping.')

asyncio.run(init_db())
" 2>&1)
exit_code=$?
set -e

if [ $exit_code -eq 0 ]; then
    echo ""
    echo -e "${BOLD}${GREEN}┌──────────────────────────────────────────┐${NC}"
    echo -e "${BOLD}${GREEN}│ ✅ Database initialization complete!    │${NC}"
    echo -e "${BOLD}${GREEN}└──────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "  Username: ${BOLD}${ADMIN_USER}${NC}"
    echo -e "  Password: ${BOLD}${ADMIN_PASS}${NC}"
    echo -e "  DB file:  ${GRAY}${DATA_DIR}/dhcp_dashboard.db${NC}"
    echo ""
else
    echo ""
    echo -e "${BOLD}${RED}┌──────────────────────────────────────────┐${NC}"
    echo -e "${BOLD}${RED}│ ❌ Database initialization FAILED       │${NC}"
    echo -e "${BOLD}${RED}└──────────────────────────────────────────┘${NC}"
    echo ""
    echo -e "${RED}$error_output${NC}"
    exit 1
fi
