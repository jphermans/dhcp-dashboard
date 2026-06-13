#!/usr/bin/env bash

# =============================================================================
# DHCP/DNS Dashboard — Raspberry Pi 4/5 Installer
# Installs the full-stack dashboard with backend (FastAPI) and frontend (React)
# =============================================================================

set -o pipefail

# ─── Color Palette ───────────────────────────────────────────────────────────
RED='\033[0;31m'
LRED='\033[1;31m'
GREEN='\033[0;32m'
LGREEN='\033[1;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
LBLUE='\033[1;34m'
CYAN='\033[0;36m'
LCYAN='\033[1;36m'
MAGENTA='\033[0;35m'
LMAGENTA='\033[1;35m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m'          # Reset
BG_RED='\033[41m'
BG_GREEN='\033[42m'
BG_YELLOW='\033[43m'
BG_BLUE='\033[44m'
BG_CYAN='\033[46m'
BOLD='\033[1m'
DIM='\033[2m'

# ─── Symbols ────────────────────────────────────────────────────────────────
CHK="${LGREEN}✔${NC}"
CROSS="${LRED}✘${NC}"
WARN="${YELLOW}⚠${NC}"
INFO="${LCYAN}ℹ${NC}"
ARROW="${LCYAN}➤${NC}"
DOT="${GRAY}•${NC}"

# ─── Terminal Width ─────────────────────────────────────────────────────────
TERM_WIDTH=$(tput cols 2>/dev/null || echo 80)

# ─── Helper Functions ───────────────────────────────────────────────────────

# Draw a horizontal line
hr() {
    local char="${1:-─}"
    printf "${GRAY}"
    printf '%*s' "$TERM_WIDTH" '' | tr ' ' "$char"
    printf "${NC}\n"
}

# Print a centered title box
title_box() {
    local title="$1"
    local len=${#title}
    local pad=$(( (TERM_WIDTH - len - 4) / 2 ))
    [[ $pad -lt 0 ]] && pad=0
    echo ""
    printf "${BG_BLUE}${WHITE}%*s %s %*s${NC}\n" "$pad" "" "$title" "$pad" ""
    echo ""
}

# Print a warning box
warn_box() {
    local msg="$1"
    echo -e "${YELLOW}┌─ ${WARN}  WARNING ${YELLOW}─────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│${NC}  ${msg}"
    echo -e "${YELLOW}└──────────────────────────────────────────────────────────────┘${NC}"
}

# Print an info box
info_box() {
    local msg="$1"
    echo -e "${LBLUE}┌─ ${INFO}  INFO ${LBLUE}──────────────────────────────────────────────────┐${NC}"
    echo -e "${LBLUE}│${NC}  ${msg}"
    echo -e "${LBLUE}└──────────────────────────────────────────────────────────────┘${NC}"
}

# Print a success box
success_box() {
    local msg="$1"
    echo -e "${GREEN}┌─ ${CHK}  SUCCESS ${GREEN}──────────────────────────────────────────────┐${NC}"
    echo -e "${GREEN}│${NC}  ${msg}"
    echo -e "${GREEN}└──────────────────────────────────────────────────────────────┘${NC}"
}

# Print an error box
error_box() {
    local msg="$1"
    echo -e "${RED}┌─ ${CROSS}  ERROR ${RED}────────────────────────────────────────────────┐${NC}"
    echo -e "${RED}│${NC}  ${msg}"
    echo -e "${RED}└──────────────────────────────────────────────────────────────┘${NC}"
}

# Spinner animation for long commands
spinner() {
    local pid=$1
    local msg="${2:-Processing...}"
    local delay=0.1
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r  ${LCYAN}%s${NC} ${GRAY}%s${NC}" "${frames[$i]}" "$msg"
        i=$(( (i + 1) % 10 ))
        sleep "$delay"
    done
    wait "$pid"
    return $?
}

# Status line with step number
step_start() {
    local num="$1"
    local desc="$2"
    printf "\n${BOLD}${WHITE}[%s]${NC} ${CYAN}%s${NC}... " "$num" "$desc"
}

step_ok() {
    echo -e "${CHK}"
}

step_fail() {
    echo -e "${CROSS}" ; exit 1
}

step_skip() {
    echo -e "${YELLOW}skipped${NC}"
}

step_warn() {
    local msg="$1"
    echo -e "${WARN} ${YELLOW}${msg}${NC}"
}

# Progress bar
progress_bar() {
    local percent=$1
    local msg="${2:-working...}"
    local width=50
    local completed=$((percent * width / 100))
    local remaining=$((width - completed))
    printf "\r  ${GRAY}[${NC}"
    printf "${LGREEN}%-${completed}s${NC}" "" | tr ' ' '█'
    if [ $remaining -gt 0 ]; then
        printf "${GRAY}%-${remaining}s${NC}" "" | tr ' ' '░'
    fi
    printf "${GRAY}]${NC} ${BOLD}%3d%%${NC} ${LCYAN}%s${NC}" "$percent" "$msg"
}

# ─── Validation Functions ───────────────────────────────────────────────────

validate_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        local IFS=.
        local -a octets=($ip)
        for octet in "${octets[@]}"; do
            if ((octet < 0 || octet > 255)); then
                return 1
            fi
        done
        return 0
    fi
    return 1
}

validate_port() {
    local port=$1
    [[ $port =~ ^[0-9]+$ ]] && ((port >= 1 && port <= 65535))
}

# ─── Trap for Clean Exit ────────────────────────────────────────────────────
trap_cleanup() {
    echo -e "\n\n${YELLOW}${WARN}  Script interrupted by user.${NC}"
    echo -e "${GRAY}  No changes were fully applied. You may need to clean up manually.${NC}\n"
    exit 130
}
trap trap_cleanup INT TERM

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          WELCOME SCREEN                                      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

clear

# Fancy header
printf "${LBLUE}╔" ; printf '═%.0s' $(seq 1 $((TERM_WIDTH - 2))) ; printf "╗${NC}\n"
printf "${LBLUE}║${NC}${WHITE}%*s${NC}${LBLUE}║${NC}\n" $((TERM_WIDTH - 2)) ""
printf "${LBLUE}║${NC}${BOLD}${WHITE}%*s${NC}${LBLUE}║${NC}\n" $(( (TERM_WIDTH - 2 + 37) / 2 )) "DHCP & DNS Dashboard Installer"
printf "${LBLUE}║${NC}${WHITE}%*s${NC}${LBLUE}║${NC}\n" $((TERM_WIDTH - 2)) ""
printf "${LBLUE}╚" ; printf '═%.0s' $(seq 1 $((TERM_WIDTH - 2))) ; printf "╝${NC}\n\n"

# Introduction
echo -e "${GRAY}This script will install the full DHCP/DNS management dashboard${NC}"
echo -e "${GRAY}on your Raspberry Pi. It includes:${NC}"
echo -e "${DOT} ${WHITE}Backend API${GRAY} (Python FastAPI)${NC}"
echo -e "${DOT} ${WHITE}Frontend UI${GRAY} (React + Tailwind)${NC}"
echo -e "${DOT} ${WHITE}SQLite database${GRAY} for persistent storage${NC}"
echo -e "${DOT} ${WHITE}Nginx${GRAY} to serve the web interface${NC}"
echo -e "${DOT} ${WHITE}Systemd${GRAY} service for auto-start on boot${NC}"

echo ""
hr

# ─── Privilege Check ────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    error_box "This script must be run as root (use sudo)."
    echo -e "${GRAY}  Please run: ${WHITE}sudo $0${NC}\n"
    exit 1
fi

# ─── System Check ────────────────────────────────────────────────────────────
info_box "Running system checks..."

# Check if running on a Pi
if grep -qi "raspberry" /proc/device-tree/model 2>/dev/null; then
    PI_MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null)
    echo -e "  ${CHK} Detected: ${GREEN}${PI_MODEL}${NC}"
else
    echo -e "  ${WARN} ${YELLOW}Not running on a Raspberry Pi${NC} (continuing anyway)"
fi

# Check internet connectivity
if ping -c 1 -W 2 8.8.8.8 &>/dev/null; then
    echo -e "  ${CHK} Internet connection: ${GREEN}OK${NC}"
else
    echo -e "  ${CROSS} No internet connection detected — script will likely fail"
    echo -e "  ${GRAY}  Check your network and try again.${NC}\n"
    exit 1
fi

# Check disk space (at least 500 MB free)
AVAIL=$(df -BM / | tail -1 | awk '{print $4}' | sed 's/M//')
if [ "$AVAIL" -lt 500 ]; then
    error_box "Less than 500 MB of free disk space (only ${AVAIL}M). Free up space first."
    exit 1
fi
echo -e "  ${CHK} Disk space: ${GREEN}${AVAIL}M available${NC}"

echo ""

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          CONFIGURATION QUESTIONS                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

title_box "CONFIGURATION"

echo -e "${GRAY}Please provide the configuration details below.${NC}"
echo -e "${GRAY}Press Enter to accept default values (shown in brackets).${NC}\n"

hr "·"
echo ""

# --- Admin Username ---
printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Admin username${NC} ${GRAY}[admin]${NC}: "
read ADMIN_USER
ADMIN_USER="${ADMIN_USER:-admin}"

# --- Admin Password (masked) ---
while true; do
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Admin password${NC} ${GRAY}[random will be generated]${NC}: "
    read -s ADMIN_PASS
    echo ""
    if [ -z "$ADMIN_PASS" ]; then
        # Generate random password
        ADMIN_PASS=$(openssl rand -base64 12 2>/dev/null || head -c 12 /dev/urandom | base64 | tr -d '+/=' 2>/dev/null || echo "changeme")
        break
    elif [ ${#ADMIN_PASS} -lt 8 ]; then
        echo -e "  ${CROSS} ${LRED}Password must be at least 8 characters.${NC}"
    else
        break
    fi
done

# --- Backend Port ---
while true; do
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Backend API port${NC} ${GRAY}[8000]${NC}: "
    read BACKEND_PORT
    BACKEND_PORT="${BACKEND_PORT:-8000}"
    if validate_port "$BACKEND_PORT"; then
        break
    fi
    echo -e "  ${CROSS} ${LRED}Invalid port (1-65535).${NC}"
done

# --- Server IP/Domain ---
printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Server IP or domain name${NC} ${GRAY}[$(hostname -I 2>/dev/null | awk '{print $1}')]${NC}: "
read SERVER_IP
SERVER_IP="${SERVER_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"

# --- Secret Key (auto-generate) ---
SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | sha256sum | cut -d' ' -f1 2>/dev/null || echo "supersecret")

echo ""
hr

# ─── Configuration Summary ──────────────────────────────────────────────────
echo -e "\n${BOLD}${WHITE}Configuration Summary:${NC}\n"
echo -e "  ${GRAY}Admin user:${NC}     ${WHITE}${ADMIN_USER}${NC}"
echo -e "  ${GRAY}Admin password:${NC}  ${WHITE}(hidden)${NC}"
echo -e "  ${GRAY}Backend port:${NC}   ${WHITE}${BACKEND_PORT}${NC}"
echo -e "  ${GRAY}Server address:${NC} ${WHITE}${SERVER_IP}${NC}"
echo ""

printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Proceed with installation?${NC} ${GRAY}[Y/n]${NC}: "
read CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]?$ ]] && [ -n "$CONFIRM" ]; then
    echo -e "\n${YELLOW}${WARN}  Installation cancelled.${NC}\n"
    exit 0
fi

echo ""
hr

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          INSTALLATION STEPS                                  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

title_box "INSTALLATION"

# Paths
INSTALL_DIR="/opt/dhcpdashboard"
VENV_DIR="$INSTALL_DIR/backend/venv"
DATA_DIR="/var/lib/dhcpdashboard"
STATIC_DIR="/var/www/dhcpdashboard"

# ─── Step 1: System Package Update ────────────────────────────────────────
step_start "1" "Updating system packages"
apt-get update -qq &>/dev/null &
spinner $! "Updating package lists"
apt-get upgrade -y -qq &>/dev/null &
spinner $! "Upgrading packages"
step_ok

# ─── Step 2: Install Required Packages ────────────────────────────────────
step_start "2" "Installing system dependencies (python3, nginx, git, curl)"
DEPS="python3 python3-venv python3-pip git curl nginx openssl"
apt-get install -y $DEPS &>/dev/null &
spinner $! "Installing system packages"
# Verify key binaries
if ! command -v python3 &>/dev/null; then
    step_fail
fi
step_ok

# ─── Step 3: Install Node.js (NodeSource Node 20 LTS) ─────────────────────
step_start "3" "Installing Node.js 20.x LTS"
if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "\n  ${CHK} Node.js already installed: ${GREEN}${NODE_VERSION}${NC}"
    step_skip
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - &>/dev/null &
    spinner $! "Adding NodeSource repository"
    apt-get install -y nodejs &>/dev/null &
    spinner $! "Installing Node.js"
    if ! command -v node &>/dev/null; then
        step_fail
    fi
    step_ok
fi

# ─── Step 4: Create directories ───────────────────────────────────────────
step_start "4" "Creating application directories"
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$STATIC_DIR"
step_ok

# ─── Step 5: Copy backend code ────────────────────────────────────────────
step_start "5" "Setting up backend application"
if [ ! -d "$INSTALL_DIR/backend" ]; then
    # Copy from current directory (assumes script is in project root)
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &>/dev/null && pwd )"
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    cp -r "$PROJECT_ROOT/backend" "$INSTALL_DIR/"
fi
# Create .env file interactively
cat > "$INSTALL_DIR/backend/.env" <<EOF
# DHCH Dashboard Backend Configuration
DATABASE_URL=sqlite:///$DATA_DIR/dhcp_dashboard.db
SECRET_KEY=$SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
FIRST_SUPERUSER=$ADMIN_USER
FIRST_SUPERUSER_PASSWORD=$ADMIN_PASS
BACKEND_HOST=0.0.0.0
BACKEND_PORT=$BACKEND_PORT
FRONTEND_URL=http://$SERVER_IP
ENVIRONMENT=production
EOF
chmod 600 "$INSTALL_DIR/backend/.env"
step_ok

# ─── Step 6: Create Python virtual environment and install dependencies ───
step_start "6" "Installing Python dependencies (virtualenv)"
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR" &>/dev/null
fi
# Activate and install
"$VENV_DIR/bin/pip" install --upgrade pip &>/dev/null &
spinner $! "Upgrading pip"
"$VENV_DIR/bin/pip" install -r "$INSTALL_DIR/backend/requirements.txt" &>/dev/null &
spinner $! "Installing Python packages"
if ! "$VENV_DIR/bin/pip" freeze | grep -q fastapi; then
    step_fail
fi
step_ok

# ─── Step 7: Initialize database ──────────────────────────────────────────
step_start "7" "Initializing database and admin user"
export DATABASE_URL="sqlite:///$DATA_DIR/dhcp_dashboard.db"
"$VENV_DIR/bin/python" -c "
import os, sys
sys.path.insert(0, '$INSTALL_DIR/backend')
from app.db.session import engine
from app.db.base import Base
Base.metadata.create_all(bind=engine)
print('Database tables created.')

from app.core.security import get_password_hash
from app.models import User
from app.db.session import SessionLocal
session = SessionLocal()
try:
    existing = session.query(User).filter_by(username='$ADMIN_USER').first()
    if not existing:
        new_user = User(
            username='$ADMIN_USER',
            email='$ADMIN_USER@localhost',
            full_name='Admin',
            hashed_password=get_password_hash('$ADMIN_PASS'),
            role='admin',
            is_active=True
        )
        session.add(new_user)
        session.commit()
        print('Admin user created.')
    else:
        print('Admin user already exists — skipping.')
finally:
    session.close()
" 2>&1 | while read line; do echo -e "  ${DOT} ${GRAY}$line${NC}"; done
if [ $? -ne 0 ]; then
    step_fail
fi
step_ok

# ─── Step 8: Build Frontend (production) ──────────────────────────────────
step_start "8" "Building frontend (React production build)"
FRONTEND_SRC="$INSTALL_DIR/frontend"
if [ ! -d "$FRONTEND_SRC" ]; then
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &>/dev/null && pwd )"
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    cp -r "$PROJECT_ROOT/frontend" "$FRONTEND_SRC"
fi
cd "$FRONTEND_SRC"
echo -e "  ${DOT} Installing Node dependencies (this may take a while)..."
# Set production API URL via .env
cat > "$FRONTEND_SRC/.env" <<EOF
VITE_API_URL=http://$SERVER_IP:$BACKEND_PORT
EOF
npm install --no-audit --no-fund &>/dev/null &
spinner $! "Installing frontend packages"
echo -e "  ${DOT} Creating production build..."
npm run build &>/dev/null &
spinner $! "Building frontend"
if [ ! -d "$FRONTEND_SRC/dist" ]; then
    step_fail
fi
# Move built files to static directory
rm -rf "$STATIC_DIR/*" 2>/dev/null
cp -r "$FRONTEND_SRC/dist/"* "$STATIC_DIR/"
cd -
step_ok

# ─── Step 9: Configure Nginx ──────────────────────────────────────────────
step_start "9" "Configuring Nginx web server"

cat > /etc/nginx/sites-available/dhcpdashboard <<EOF
server {
    listen 80;
    server_name $SERVER_IP localhost;

    root $STATIC_DIR;
    index index.html;

    # Serve static files
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket support
    location /ws/ {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";

    access_log /var/log/nginx/dhcpdashboard_access.log;
    error_log /var/log/nginx/dhcpdashboard_error.log;
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/dhcpdashboard /etc/nginx/sites-enabled/
# Remove default if it exists
if [ -f /etc/nginx/sites-enabled/default ]; then
    rm -f /etc/nginx/sites-enabled/default
fi

# Test configuration
nginx -t &>/dev/null
if [ $? -ne 0 ]; then
    echo -e "  ${CROSS} Nginx configuration test failed. Check /var/log/nginx/"
    step_warn "Continuing, but you may need to fix nginx config manually"
else
    step_ok
fi

# ─── Step 10: Create systemd service for backend ──────────────────────────
step_start "10" "Creating systemd service for backend"

cat > /etc/systemd/system/dhcpdashboard-backend.service <<EOF
[Unit]
Description=DHCP Dashboard Backend API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$INSTALL_DIR/backend
Environment="PATH=$VENV_DIR/bin:/usr/bin"
Environment="DATABASE_URL=sqlite:///$DATA_DIR/dhcp_dashboard.db"
ExecStart=$VENV_DIR/bin/uvicorn app.main:app --host 127.0.0.1 --port $BACKEND_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload &>/dev/null
systemctl enable dhcpdashboard-backend.service &>/dev/null
step_ok

# ─── Step 11: Start services ──────────────────────────────────────────────
step_start "11" "Starting services"

systemctl restart dhcpdashboard-backend.service &>/dev/null
sleep 2
if systemctl is-active --quiet dhcpdashboard-backend.service; then
    echo -e "  ${CHK} Backend service: ${GREEN}running${NC}"
else
    echo -e "  ${CROSS} Backend service failed to start. Check logs: sudo journalctl -u dhcpdashboard-backend"
    step_warn "Backend not running"
fi

systemctl restart nginx &>/dev/null
sleep 1
if systemctl is-active --quiet nginx; then
    echo -e "  ${CHK} Nginx: ${GREEN}running${NC}"
else
    echo -e "  ${CROSS} Nginx failed to start."
    step_warn "Nginx not running"
fi

step_ok

# ─── Step 12: Final verification ──────────────────────────────────────────
step_start "12" "Verifying installation"

# Test backend health endpoint
sleep 2
if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$BACKEND_PORT/health" 2>/dev/null | grep 200 &>/dev/null; then
    echo -e "  ${CHK} Backend API: ${GREEN}healthy (http://127.0.0.1:$BACKEND_PORT)${NC}"
else
    echo -e "  ${WARN} Backend health check failed. It may still be starting."
fi

# Check frontend via localhost
if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/" 2>/dev/null | grep 200 &>/dev/null; then
    echo -e "  ${CHK} Frontend: ${GREEN}serving (http://127.0.0.1)${NC}"
else
    echo -e "  ${WARN} Frontend not reachable on port 80."
fi

step_ok

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          INSTALLATION COMPLETE                               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

clear

printf "${BG_GREEN}${WHITE}"
printf "%*s" "$TERM_WIDTH" ""
printf "${NC}\n"
printf "${BG_GREEN}${WHITE}%*s${NC}\n" $(( (TERM_WIDTH + 18) / 2 )) "INSTALLATION SUCCESSFUL!"
printf "${BG_GREEN}${WHITE}%*s${NC}\n" "$TERM_WIDTH" ""
printf "${BG_GREEN}${NC}\n"

echo ""
echo -e "${BOLD}${WHITE}Your DHCP Dashboard is now installed and running!${NC}"
echo ""

# Display access information
echo -e "${BOLD}${LCYAN}  Access the dashboard:${NC}"
echo -e "  ${GRAY}➤${NC} URL:  ${WHITE}http://${SERVER_IP}${NC}"
echo -e "  ${GRAY}➤${NC} User: ${WHITE}${ADMIN_USER}${NC}"
echo -e "  ${GRAY}➤${NC} Pass: ${WHITE}${ADMIN_PASS}${NC}"
echo ""
echo -e "${BOLD}${LCYAN}  API documentation:${NC}"
echo -e "  ${GRAY}➤${NC} Swagger: ${WHITE}http://${SERVER_IP}:${BACKEND_PORT}/api/docs${NC}"
echo ""

hr

echo -e "${BOLD}${LCYAN}  Useful commands:${NC}"
echo -e "  ${GRAY}•${NC} Check backend status: ${WHITE}sudo systemctl status dhcpdashboard-backend${NC}"
echo -e "  ${GRAY}•${NC} View backend logs:    ${WHITE}sudo journalctl -u dhcpdashboard-backend -f${NC}"
echo -e "  ${GRAY}•${NC} Restart dashboard:   ${WHITE}sudo systemctl restart dhcpdashboard-backend nginx${NC}"
echo -e "  ${GRAY}•${NC} Configuration file:  ${WHITE}${INSTALL_DIR}/backend/.env${NC}"
echo ""

echo -e "${BOLD}${LCYAN}  Installed locations:${NC}"
echo -e "  ${GRAY}•${NC} Backend:  ${WHITE}${INSTALL_DIR}/backend${NC}"
echo -e "  ${GRAY}•${NC} Frontend: ${WHITE}${STATIC_DIR}${NC}"
echo -e "  ${GRAY}•${NC} Database: ${WHITE}${DATA_DIR}/dhcp_dashboard.db${NC}"
echo -e "  ${GRAY}•${NC} Logs:     ${WHITE}/var/log/nginx/dhcpdashboard_*.log${NC}"
echo ""

hr

echo -e "\n${GRAY}  Thank you for installing the DHCP Dashboard!${NC}\n"

exit 0
