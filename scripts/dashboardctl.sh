#!/usr/bin/env bash

# =============================================================================
# DHCP/DNS Dashboard — Service Control Script
# Manages the backend (systemd) and frontend (nginx) services
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
NC='\033[0m'
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

# ─── Configuration ──────────────────────────────────────────────────────────
BACKEND_SERVICE="dhcpdashboard-backend"
FRONTEND_SERVICE="nginx"
API_PORT=8000
INSTALL_DIR="/opt/dhcpdashboard"

# ─── Helper Functions ───────────────────────────────────────────────────────

hr() {
    local char="${1:-─}"
    printf "${GRAY}"
    printf '%*s' "$TERM_WIDTH" '' | tr ' ' "$char"
    printf "${NC}\n"
}

# Print box with colored border
box() {
    local color="$1"
    local icon="$2"
    local title="$3"
    local msg="$4"
    echo -e "${color}┌─ ${icon}  ${title} ${color}──────────────────────────────────────────────┐${NC}"
    echo -e "${color}│${NC}  ${msg}"
    echo -e "${color}└──────────────────────────────────────────────────────────────┘${NC}"
}

error_box() { box "${RED}" "${CROSS}" "ERROR" "$1"; }
success_box() { box "${GREEN}" "${CHK}" "SUCCESS" "$1"; }
warn_box() { box "${YELLOW}" "${WARN}" "WARNING" "$1"; }
info_box() { box "${LBLUE}" "${INFO}" "INFO" "$1"; }

# Spinner for async operations
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

# Check service status
service_status() {
    local service="$1"
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        echo -e "  ${CHK} ${WHITE}${service}${NC}: ${GREEN}running${NC}"
        return 0
    else
        echo -e "  ${CROSS} ${WHITE}${service}${NC}: ${LRED}stopped${NC}"
        return 1
    fi
}

# Check if service is enabled at boot
service_enabled() {
    local service="$1"
    if systemctl is-enabled --quiet "$service" 2>/dev/null; then
        echo -e "    ${GRAY}↳ enabled at boot${NC}"
    else
        echo -e "    ${GRAY}↳ NOT enabled at boot${NC}"
    fi
}

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                               MAIN LOGIC                                      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# Show usage
usage() {
    echo ""
    echo -e "${BOLD}Usage:${NC} ${WHITE}$0${NC} ${LCYAN}{start|stop|restart|status|enable|disable}${NC}"
    echo ""
    echo -e "${BOLD}Commands:${NC}"
    echo -e "  ${GREEN}start${NC}    Start backend and frontend services"
    echo -e "  ${RED}stop${NC}     Stop backend and frontend services"
    echo -e "  ${YELLOW}restart${NC}  Restart both services"
    echo -e "  ${LCYAN}status${NC}   Show current service status"
    echo -e "  ${MAGENTA}enable${NC}   Enable auto-start on boot"
    echo -e "  ${GRAY}disable${NC}  Disable auto-start on boot"
    echo ""
    exit 1
}

# Require root for control commands
require_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "\n${CROSS} ${LRED}This command requires root privileges.${NC}"
        echo -e "${GRAY}  Please run: ${WHITE}sudo $0 $1${NC}\n"
        exit 1
    fi
}

# Check if services are installed
check_installed() {
    local missing=0
    if ! systemctl cat "$BACKEND_SERVICE" &>/dev/null; then
        echo -e "  ${CROSS} Backend service (${WHITE}${BACKEND_SERVICE}${NC}) not found."
        missing=1
    fi
    if ! command -v nginx &>/dev/null; then
        echo -e "  ${CROSS} Nginx not installed."
        missing=1
    fi
    if [ $missing -eq 1 ]; then
        error_box "Dashboard is not installed. Run the installation script first."
        echo ""
        exit 1
    fi
}

# ─── Command: status ────────────────────────────────────────────────────────
cmd_status() {
    clear

    # Header
    printf "${LBLUE}╔" ; printf '═%.0s' $(seq 1 $((TERM_WIDTH - 2))) ; printf "╗${NC}\n"
    printf "${LBLUE}║${NC}${WHITE}%*s${NC}${LBLUE}║${NC}\n" $((TERM_WIDTH - 2)) ""
    printf "${LBLUE}║${NC}${BOLD}${WHITE}%*s${NC}${LBLUE}║${NC}\n" $(( (TERM_WIDTH - 2 + 29) / 2 )) "DHCP Dashboard — Service Status"
    printf "${LBLUE}║${NC}${WHITE}%*s${NC}${LBLUE}║${NC}\n" $((TERM_WIDTH - 2)) ""
    printf "${LBLUE}╚" ; printf '═%.0s' $(seq 1 $((TERM_WIDTH - 2))) ; printf "╝${NC}\n\n"

    check_installed

    echo -e "${BOLD}${LCYAN}  Service Status:${NC}\n"

    # Backend service
    service_status "$BACKEND_SERVICE"
    if [ $? -eq 0 ]; then
        service_enabled "$BACKEND_SERVICE"
        # Check API health
        if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${API_PORT}/health" 2>/dev/null | grep -q "200"; then
            echo -e "    ${GRAY}↳ API health: ${GREEN}OK${NC} (http://127.0.0.1:${API_PORT})"
        else
            echo -e "    ${GRAY}↳ API health: ${YELLOW}not responding${NC}"
        fi
    fi

    # Frontend (nginx)
    service_status "$FRONTEND_SERVICE"
    if [ $? -eq 0 ]; then
        service_enabled "$FRONTEND_SERVICE"
        if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/" 2>/dev/null | grep -q "200"; then
            echo -e "    ${GRAY}↳ Web UI: ${GREEN}OK${NC} (http://127.0.0.1)"
        else
            echo -e "    ${GRAY}↳ Web UI: ${YELLOW}not responding${NC}"
        fi
    fi

    echo ""
    hr

    # Show recent logs (last 5 lines)
    echo -e "\n${BOLD}${LCYAN}  Recent Backend Logs:${NC}\n"
    if systemctl cat "$BACKEND_SERVICE" &>/dev/null; then
        journalctl -u "$BACKEND_SERVICE" -n 5 --no-pager 2>/dev/null | while IFS= read -r line; do
            echo -e "  ${GRAY}${line}${NC}"
        done || echo -e "  ${GRAY}(no logs available)${NC}"
    fi

    echo ""
}

# ─── Command: start ─────────────────────────────────────────────────────────
cmd_start() {
    echo ""
    require_root "start"
    check_installed

    echo -e "${CYAN}  Starting DHCP Dashboard...${NC}\n"

    # Start backend
    printf "  ${ARROW} Starting backend... "
    systemctl start "$BACKEND_SERVICE" 2>/dev/null &
    spinner $! "Starting backend"
    sleep 2
    if systemctl is-active --quiet "$BACKEND_SERVICE"; then
        echo -e "\r  ${CHK} Backend: ${GREEN}started${NC}"
    else
        echo -e "\r  ${CROSS} Backend failed to start"
    fi

    # Start nginx
    printf "  ${ARROW} Starting frontend... "
    systemctl start "$FRONTEND_SERVICE" 2>/dev/null &
    spinner $! "Starting frontend"
    sleep 1
    if systemctl is-active --quiet "$FRONTEND_SERVICE"; then
        echo -e "\r  ${CHK} Frontend: ${GREEN}started${NC}"
    else
        echo -e "\r  ${CROSS} Frontend failed to start"
    fi

    echo ""

    # Final status
    if systemctl is-active --quiet "$BACKEND_SERVICE" && systemctl is-active --quiet "$FRONTEND_SERVICE"; then
        success_box "Dashboard is now running! Access at http://$(hostname -I | awk '{print $1}')"
    else
        warn_box "Some services may not be running. Check status with: sudo $0 status"
    fi
    echo ""
}

# ─── Command: stop ──────────────────────────────────────────────────────────
cmd_stop() {
    echo ""
    require_root "stop"
    check_installed

    echo -e "${YELLOW}  Stopping DHCP Dashboard...${NC}\n"

    # Stop nginx first
    printf "  ${ARROW} Stopping frontend... "
    systemctl stop "$FRONTEND_SERVICE" 2>/dev/null &
    spinner $! "Stopping frontend"
    sleep 1
    if ! systemctl is-active --quiet "$FRONTEND_SERVICE"; then
        echo -e "\r  ${CHK} Frontend: ${YELLOW}stopped${NC}"
    else
        echo -e "\r  ${WARN} Frontend may still be running"
    fi

    # Stop backend
    printf "  ${ARROW} Stopping backend... "
    systemctl stop "$BACKEND_SERVICE" 2>/dev/null &
    spinner $! "Stopping backend"
    sleep 2
    if ! systemctl is-active --quiet "$BACKEND_SERVICE"; then
        echo -e "\r  ${CHK} Backend: ${YELLOW}stopped${NC}"
    else
        echo -e "\r  ${WARN} Backend may still be running"
    fi

    echo ""
    success_box "Dashboard has been stopped."
    echo ""
}

# ─── Command: restart ───────────────────────────────────────────────────────
cmd_restart() {
    echo ""
    require_root "restart"
    check_installed

    echo -e "${MAGENTA}  Restarting DHCP Dashboard...${NC}\n"

    # Restart backend
    printf "  ${ARROW} Restarting backend... "
    systemctl restart "$BACKEND_SERVICE" 2>/dev/null &
    spinner $! "Restarting backend"
    sleep 2
    if systemctl is-active --quiet "$BACKEND_SERVICE"; then
        echo -e "\r  ${CHK} Backend: ${GREEN}restarted${NC}"
    else
        echo -e "\r  ${CROSS} Backend failed to restart"
        error_box "Check logs: journalctl -u ${BACKEND_SERVICE} -n 20"
        exit 1
    fi

    # Restart nginx
    printf "  ${ARROW} Restarting frontend... "
    systemctl restart "$FRONTEND_SERVICE" 2>/dev/null &
    spinner $! "Restarting frontend"
    sleep 1
    if systemctl is-active --quiet "$FRONTEND_SERVICE"; then
        echo -e "\r  ${CHK} Frontend: ${GREEN}restarted${NC}"
    else
        echo -e "\r  ${CROSS} Frontend failed to restart"
        error_box "Check logs: journalctl -u ${FRONTEND_SERVICE} -n 20"
        exit 1
    fi

    echo ""

    # Quick health check
    sleep 1
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${API_PORT}/health" 2>/dev/null | grep -q "200"; then
        success_box "Dashboard restarted successfully! API is healthy."
    else
        warn_box "Dashboard restarted but API health check failed. It may be starting..."
    fi
    echo ""
}

# ─── Command: enable ────────────────────────────────────────────────────────
cmd_enable() {
    echo ""
    require_root "enable"
    check_installed

    echo -e "${LCYAN}  Enabling auto-start on boot...${NC}\n"

    systemctl enable "$BACKEND_SERVICE" 2>/dev/null
    if systemctl is-enabled --quiet "$BACKEND_SERVICE"; then
        echo -e "  ${CHK} Backend: ${GREEN}enabled${NC}"
    else
        echo -e "  ${CROSS} Failed to enable backend"
    fi

    systemctl enable "$FRONTEND_SERVICE" 2>/dev/null
    if systemctl is-enabled --quiet "$FRONTEND_SERVICE"; then
        echo -e "  ${CHK} Frontend: ${GREEN}enabled${NC}"
    else
        echo -e "  ${CROSS} Failed to enable frontend"
    fi

    echo ""
    success_box "Dashboard will auto-start on system boot."
    echo ""
}

# ─── Command: disable ───────────────────────────────────────────────────────
cmd_disable() {
    echo ""
    require_root "disable"
    check_installed

    echo -e "${GRAY}  Disabling auto-start on boot...${NC}\n"

    systemctl disable "$BACKEND_SERVICE" 2>/dev/null
    if ! systemctl is-enabled --quiet "$BACKEND_SERVICE"; then
        echo -e "  ${CHK} Backend: ${GRAY}disabled${NC}"
    else
        echo -e "  ${CROSS} Failed to disable backend"
    fi

    systemctl disable "$FRONTEND_SERVICE" 2>/dev/null
    if ! systemctl is-enabled --quiet "$FRONTEND_SERVICE"; then
        echo -e "  ${CHK} Frontend: ${GRAY}disabled${NC}"
    else
        echo -e "  ${CROSS} Failed to disable frontend"
    fi

    echo ""
    info_box "Dashboard will NOT auto-start on system boot."
    echo ""
}

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          COMMAND DISPATCH                                    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

case "${1:-}" in
    status)
        cmd_status
        ;;
    start)
        cmd_start
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        cmd_restart
        ;;
    enable)
        cmd_enable
        ;;
    disable)
        cmd_disable
        ;;
    *)
        usage
        ;;
esac

exit 0
