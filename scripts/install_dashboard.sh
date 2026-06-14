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

# ─── Wi-Fi Configuration ─────────────────────────────────────────────────────
configure_wifi() {
    # Detect wireless interfaces
    local wlan_iface=""
    if command -v iw &>/dev/null; then
        wlan_iface=$(iw dev 2>/dev/null | awk '/Interface/{print $2}' | head -1)
    fi
    if [ -z "$wlan_iface" ] && command -v iwconfig &>/dev/null; then
        wlan_iface=$(iwconfig 2>/dev/null | grep -o '^[a-z0-9]*' | head -1)
    fi
    if [ -z "$wlan_iface" ]; then
        wlan_iface=$(ls /sys/class/net/ 2>/dev/null | grep -E '^wl' | head -1)
    fi

    if [ -z "$wlan_iface" ]; then
        echo -e "  ${GRAY}No wireless interface detected — skipping Wi-Fi setup.${NC}"
        return 0
    fi

    echo -e "  ${CHK} Wireless interface: ${GREEN}${wlan_iface}${NC}"

    # Ask if user wants to configure Wi-Fi
    if [ "$TEST_MODE" -eq 1 ]; then
        echo -e "  ${INFO} [DRY RUN] Would ask to configure Wi-Fi"
        return 0
    fi

    printf "\n  ${BOLD}${LCYAN}  ➤${NC} ${WHITE}Configure Wi-Fi on ${wlan_iface}?${NC} ${GRAY}[y/N]${NC}: "
    read -r CONFIG_WIFI
    if [[ ! "$CONFIG_WIFI" =~ ^[Yy]$ ]]; then
        echo -e "  ${GRAY}Skipping Wi-Fi configuration.${NC}"
        return 0
    fi

    # Scan for SSIDs
    echo ""
    echo -e "  ${LCYAN}Scanning for Wi-Fi networks...${NC}"
    local scan_file="/tmp/wifi_scan_$$.txt"
    if command -v nmcli &>/dev/null; then
        nmcli -t -f SSID dev wifi list ifname "$wlan_iface" 2>/dev/null | grep -v '^$' | sort -u > "$scan_file"
    elif $SUDO iwlist "$wlan_iface" scan 2>/dev/null | grep 'ESSID:' | sed 's/.*ESSID:"//;s/"$//' | grep -v '^$' | sort -u > "$scan_file"; then
        true
    else
        echo -e "  ${CROSS} Failed to scan for networks. Check that ${wlan_iface} is up."
        return 1
    fi

    local ssid_count=$(wc -l < "$scan_file")
    if [ "$ssid_count" -eq 0 ]; then
        echo -e "  ${WARN} No networks found."
        rm -f "$scan_file"
        return 1
    fi

    # Display numbered list
    echo -e "\n  ${WHITE}Available networks:${NC}"
    local i=1
    while IFS= read -r ssid; do
        printf "  ${LCYAN}%2d)${NC} %s\n" "$i" "$ssid"
        ((i++))
    done < "$scan_file"

    # Pick network
    echo ""
    while true; do
        printf "  ${BOLD}${LCYAN}  ➤${NC} ${WHITE}Select network${NC} ${GRAY}[1-${ssid_count}]${NC}: "
        read -r SSID_NUM
        if [[ "$SSID_NUM" =~ ^[0-9]+$ ]] && [ "$SSID_NUM" -ge 1 ] && [ "$SSID_NUM" -le "$ssid_count" ]; then
            SELECTED_SSID=$(sed -n "${SSID_NUM}p" "$scan_file")
            break
        fi
        echo -e "  ${CROSS} ${LRED}Invalid selection. Choose 1-${ssid_count}.${NC}"
    done
    rm -f "$scan_file"

    echo -e "  ${CHK} Selected: ${GREEN}${SELECTED_SSID}${NC}"

    # Get password
    printf "  ${BOLD}${LCYAN}  ➤${NC} ${WHITE}Wi-Fi password for '${SELECTED_SSID}'${NC}: "
    read -s WIFI_PASS
    echo ""
    while [ -z "$WIFI_PASS" ]; do
        echo -e "  ${CROSS} ${LRED}Password cannot be empty.${NC}"
        printf "  ${BOLD}${LCYAN}  ➤${NC} ${WHITE}Wi-Fi password${NC}: "
        read -s WIFI_PASS
        echo ""
    done

    # Ask for country code
    echo ""
    while true; do
        printf "  ${BOLD}${LCYAN}  ➤${NC} ${WHITE}Two-letter country code (e.g., US, DE, GB)${NC} ${GRAY}[US]${NC}: "
        read -r WIFI_COUNTRY
        WIFI_COUNTRY="${WIFI_COUNTRY:-US}"
        WIFI_COUNTRY=$(echo "$WIFI_COUNTRY" | tr '[:lower:]' '[:upper:]')
        if [[ "$WIFI_COUNTRY" =~ ^[A-Z]{2}$ ]]; then
            break
        else
            echo -e "  ${CROSS} ${LRED}Invalid country code. Use exactly two letters.${NC}"
        fi
    done

    # Write wpa_supplicant.conf
    echo -e "  ${INFO} Writing Wi-Fi configuration..."
    $SUDO tee /etc/wpa_supplicant/wpa_supplicant.conf > /dev/null << WPAEOF
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1
country=${WIFI_COUNTRY}

network={
    ssid="${SELECTED_SSID}"
    psk="${WIFI_PASS}"
}
WPAEOF
    echo -e "  ${CHK} Wi-Fi credentials written to /etc/wpa_supplicant/wpa_supplicant.conf"

    # Ask about static IP
    echo ""
    printf "  ${BOLD}${LCYAN}  ➤${NC} ${WHITE}Set static IP address for ${wlan_iface}?${NC} ${GRAY}[y/N]${NC}: "
    read -r SET_STATIC
    if [[ "$SET_STATIC" =~ ^[Yy]$ ]]; then
        # Get current IP info as defaults
        local current_ip=$(ip -4 addr show "$wlan_iface" 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)
        local current_netmask=$(ip -4 addr show "$wlan_iface" 2>/dev/null | grep -oP '(?<=/)\d+' | head -1)
        current_netmask="${current_netmask:-24}"
        local current_gateway=$(ip route show default 2>/dev/null | awk '{print $3}' | head -1)
        local current_dns="8.8.8.8"

        echo -e "  ${GRAY}Press Enter to accept defaults (detected values).${NC}\n"

        printf "  ${BOLD}${LCYAN}  ➤${NC} ${WHITE}Static IP address${NC} ${GRAY}[${current_ip}]${NC}: "
        read -r STATIC_IP
        STATIC_IP="${STATIC_IP:-${current_ip}}"

        printf "  ${BOLD}${LCYAN}  ➤${NC} ${WHITE}Netmask (CIDR)${NC} ${GRAY}[${current_netmask}]${NC}: "
        read -r STATIC_NETMASK
        STATIC_NETMASK="${STATIC_NETMASK:-${current_netmask}}"

        printf "  ${BOLD}${LCYAN}  ➤${NC} ${WHITE}Gateway${NC} ${GRAY}[${current_gateway}]${NC}: "
        read -r STATIC_GATEWAY
        STATIC_GATEWAY="${STATIC_GATEWAY:-${current_gateway}}"

        printf "  ${BOLD}${LCYAN}  ➤${NC} ${WHITE}DNS server${NC} ${GRAY}[${current_dns}]${NC}: "
        read -r STATIC_DNS
        STATIC_DNS="${STATIC_DNS:-${current_dns}}"

        # Append static config to dhcpcd.conf
        echo -e "  ${INFO} Writing static IP configuration to /etc/dhcpcd.conf..."
        $SUDO tee -a /etc/dhcpcd.conf > /dev/null << DHCPEOF

# Static IP configuration for ${wlan_iface}
interface ${wlan_iface}
static ip_address=${STATIC_IP}/${STATIC_NETMASK}
static routers=${STATIC_GATEWAY}
static domain_name_servers=${STATIC_DNS}
DHCPEOF
        echo -e "  ${CHK} Static IP configuration added to /etc/dhcpcd.conf"
    else
        echo -e "  ${GRAY}Using DHCP for ${wlan_iface}.${NC}"
    fi

    return 0
}

# ─── Trap for Clean Exit ────────────────────────────────────────────────────
trap_cleanup() {
    echo -e "\n\n${YELLOW}${WARN}  Script interrupted by user.${NC}"
    echo -e "${GRAY}  No changes were fully applied. You may need to clean up manually.${NC}\n"
    exit 130
}
trap trap_cleanup INT TERM

# ─── Argument Pre‑pass (must run before root check so --test bypasses it) ───
TEST_MODE=0
for arg in "$@"; do
    case "$arg" in
        --test|-t) TEST_MODE=1 ;;
    esac
done

# ─── Root Check ──────────────────────────────────────────────────────────────
if [ "$TEST_MODE" -ne 1 ] && [ "$EUID" -eq 0 ]; then
    hr "━"
    echo -e "${RED}┌─ ${CROSS}  ERROR: ROOT USER DETECTED ${RED}─────────────────────────────────────┐${NC}"
    echo -e "${RED}│${NC}"
    echo -e "${RED}│${NC}  ${WHITE}Running this script as ${BOLD}root${NC}${WHITE} is not allowed for security reasons.${NC}"
    echo -e "${RED}│${NC}  ${GRAY}Please create a regular user and run the script from that account.${NC}"
    echo -e "${RED}│${NC}"
    echo -e "${RED}│${NC}  ${LCYAN}${BOLD}Quick Setup:${NC}"
    echo -e "${RED}│${NC}  ${GRAY}────────────────────────────────────────────────────────────────${NC}"
    echo -e "${RED}│${NC}"
    echo -e "${RED}│${NC}  ${CYAN}1.${NC} ${WHITE}Create a new user:${NC}"
    echo -e "${RED}│${NC}     ${BOLD}sudo adduser dashboard${NC}"
    echo -e "${RED}│${NC}"
    echo -e "${RED}│${NC}  ${CYAN}2.${NC} ${WHITE}Grant sudo privileges:${NC}"
    echo -e "${RED}│${NC}     ${BOLD}sudo usermod -aG sudo dashboard${NC}"
    echo -e "${RED}│${NC}"
    echo -e "${RED}│${NC}  ${CYAN}3.${NC} ${WHITE}Switch to the new user:${NC}"
    echo -e "${RED}│${NC}     ${BOLD}su - dashboard${NC}"
    echo -e "${RED}│${NC}"
    echo -e "${RED}│${NC}  ${CYAN}4.${NC} ${WHITE}Re-run this installer:${NC}"
    echo -e "${RED}│${NC}     ${BOLD}curl -sSL https://raw.githubusercontent.com/jphermans/dhcp-dashboard/main/scripts/install_dashboard.sh | bash -s${NC}"
    echo -e "${RED}│${NC}"
    echo -e "${RED}└────────────────────────────────────────────────────────────────────────────┘${NC}"
    hr "━"
    exit 1
fi

# ─── Standalone mode: auto-fetch repo if running standalone ───────────────────
if [ ! -d backend ] || [ ! -d frontend ]; then
    echo -e "${YELLOW}${WARN}  Running standalone (no repo found). Fetching project...${NC}"
    TEMP_DIR=$(mktemp -d /tmp/dhcpdashboard.XXXXXX)
    echo -e "${GRAY}  Downloading repository archive...${NC}"
    if ! curl -sSL "https://github.com/jphermans/dhcp-dashboard/archive/refs/heads/main.tar.gz" | tar xz -C "$TEMP_DIR" --strip-components=1; then
        echo -e "${RED}${CROSS}  Failed to download project archive. Check your internet connection.${NC}"
        rm -rf "$TEMP_DIR"
        exit 1
    fi
    echo -e "  ${CHK} Project downloaded to $TEMP_DIR"
    cd "$TEMP_DIR"
    exec bash "$TEMP_DIR/scripts/install_dashboard.sh" "$@"
fi

# ── SUDO wrapper for non-root execution ──────────────────────
SUDO="sudo"


TEST_MODE=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --test|-t)
            TEST_MODE=1
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--test|-t] [--help|-h]"
            echo "  --test, -t    Dry-run mode: simulate steps without installing"
            echo "  --help, -h    Show this help"
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          WELCOME SCREEN                                      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

clear
if [ "$TEST_MODE" -eq 1 ]; then
    echo ""
    echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║${NC}${BOLD}${YELLOW}  ⚠  TEST MODE ACTIVE — No changes will be made to your system.  ⚠        ${NC}${YELLOW}║${NC}"
    echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
fi


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

# ─── System Check ────────────────────────────────────────────────────────────
info_box "Running system checks..."

# Check total RAM
TOTAL_RAM=$(free -m | awk '/^Mem:/{print $2}')
echo -e "  ${CHK} Total RAM: ${GREEN}${TOTAL_RAM}MB${NC}"

# Check if running on a Pi
IS_PI=0
PI_MODEL_CLASS=""
if grep -qi "raspberry" /proc/device-tree/model 2>/dev/null; then
    IS_PI=1
    PI_MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null)
    echo -e "  ${CHK} Detected: ${GREEN}${PI_MODEL}${NC}"
    # Classify model
    if echo "$PI_MODEL" | grep -qi "Zero 2"; then
        PI_MODEL_CLASS="zero2"
    elif echo "$PI_MODEL" | grep -qi "Zero"; then
        PI_MODEL_CLASS="zero"
    elif echo "$PI_MODEL" | grep -qi "Pi 3"; then
        PI_MODEL_CLASS="3"
    elif echo "$PI_MODEL" | grep -qi "Pi 4"; then
        PI_MODEL_CLASS="4"
    elif echo "$PI_MODEL" | grep -qi "Pi 5"; then
        PI_MODEL_CLASS="5"
    else
        PI_MODEL_CLASS="unknown"
    fi
else
    echo -e "  ${WARN} ${YELLOW}Not running on a Raspberry Pi${NC} (continuing anyway)"
fi

# Pi Zero (original) check – ARMv6 cannot run Node.js 20
if [ "$PI_MODEL_CLASS" == "zero" ]; then
    error_box "Raspberry Pi Zero (original) detected."
    echo -e "  ${CROSS} Node.js 20 LTS requires ARMv7 or later (your Pi is ARMv6)."
    echo -e "  ${CROSS} The frontend cannot be built on this device."
    echo -e "  ${GRAY}  You may build the frontend on a newer Pi (or Linux machine)"
    echo -e "  ${GRAY}  and transfer the 'dist' folder manually."
    echo -e "\n${YELLOW}  Installation cannot continue.${NC}\n"
    exit 1
fi

# Low memory warning for <1GB (typical Pi Zero 2, some Pi 3)
if [ "$TOTAL_RAM" -lt 1000 ]; then
    LOW_RAM=1
    echo -e "  ${WARN} ${YELLOW}Less than 1GB RAM detected (${TOTAL_RAM}MB).${NC}"
    echo -e "  ${YELLOW}  The frontend build will require swap space and may be slow.${NC}"
    # Check swap
    SWAP_TOTAL=$(free -m | awk '/^Swap:/{print $2}')
    if [ "$SWAP_TOTAL" -lt 512 ]; then
        echo -e "  ${CROSS} Swap is ${SWAP_TOTAL}MB – at least 512MB recommended."
        echo -e "  ${GRAY}  Consider creating swap: sudo dphys-swapfile setup && sudo dphys-swapfile swapon${NC}"
        printf "  ${LCYAN}  Continue anyway? [y/N]: ${NC}"
        read cont_swap
        if [[ ! "$cont_swap" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        echo -e "  ${CHK} Swap: ${GREEN}${SWAP_TOTAL}MB available${NC}"
    fi
else
    LOW_RAM=0
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

# ─── Wi-Fi Configuration ───────────────────────────────────────────────────
configure_wifi

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          CONFIGURATION QUESTIONS                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

title_box "CONFIGURATION"

if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Using default configuration values"
    ADMIN_USER="admin"
    ADMIN_PASS="admin123"
    BACKEND_PORT=8000
    SERVER_IP="localhost"
    SECRET_KEY="testsecretkey1234567890abcdef"
else
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
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Admin password${NC} ${GRAY}[default: admin123]${NC}: "
    read -s ADMIN_PASS
    echo ""
    if [ -z "$ADMIN_PASS" ]; then
        # No password given → use default
        ADMIN_PASS="admin123"
        echo -e "  ${INFO} ${GRAY}No password entered — using default password.${NC}"
        break
    elif [ ${#ADMIN_PASS} -lt 8 ]; then
        echo -e "  ${CROSS} ${LRED}Password must be at least 8 characters.${NC}"
        continue
    fi

    # Confirm password
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Confirm password${NC}: "
    read -s ADMIN_PASS_CONFIRM
    echo ""
    if [ -z "$ADMIN_PASS_CONFIRM" ]; then
        # No confirmation entered → fall back to default
        ADMIN_PASS="admin123"
        echo -e "  ${INFO} ${GRAY}No confirmation entered — using default password.${NC}"
        break
    elif [ "$ADMIN_PASS" != "$ADMIN_PASS_CONFIRM" ]; then
        echo -e "  ${CROSS} ${LRED}Passwords do not match. Please try again.${NC}"
        continue
    fi
    break
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
fi


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
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 1"
    step_skip
else
$SUDO apt-get update -qq &>/dev/null &
spinner $! "Updating package lists"
$SUDO apt-get upgrade -y -qq &>/dev/null &
spinner $! "Upgrading packages"
step_ok
fi

# ─── Step 2: Install Required Packages ────────────────────────────────────
step_start "2" "Installing system dependencies (python3, nginx, git, curl)"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 2"
    step_skip
else
DEPS="python3 python3-venv python3-pip git curl nginx openssl"
apt-get install -y $DEPS &>/dev/null &
spinner $! "Installing system packages"
# Verify key binaries
if ! command -v python3 &>/dev/null; then
    step_fail
fi
fi
step_ok

# ─── Step 3: Install Node.js (NodeSource Node 20 LTS) ─────────────────────
step_start "3" "Installing Node.js 20.x LTS"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 3"
    step_skip
elif command -v node &>/dev/null; then
    NODE_VERSION=$(node -v)
    echo -e "\n  ${CHK} Node.js already installed: ${GREEN}${NODE_VERSION}${NC}"
    step_skip
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash - &>/dev/null &
    spinner $! "Adding NodeSource repository"
    $SUDO apt-get install -y nodejs &>/dev/null &
    spinner $! "Installing Node.js"
    if ! command -v node &>/dev/null; then
        step_fail
    fi
    step_ok
fi

# ─── Step 4: Create directories ───────────────────────────────────────────
step_start "4" "Creating application directories"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 4"
    step_skip
else
$SUDO mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$STATIC_DIR"
step_ok
fi

# ─── Step 5: Copy backend code ────────────────────────────────────────────
step_start "5" "Setting up backend application"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 5"
    step_skip
else
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
fi

# ─── Step 6: Create Python virtual environment and install dependencies ───
step_start "6" "Installing Python dependencies (virtualenv)"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 6"
    step_skip
else
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
fi
step_ok

# ─── Step 7: Initialize database ──────────────────────────────────────────
step_start "7" "Initializing database and admin user"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 7"
    step_skip
else
export DATABASE_URL="sqlite:///$DATA_DIR/dhcp_dashboard.db"
export SECRET_KEY="$SECRET_KEY"
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
            is_active=True,
            password_change_required=True
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
fi
step_ok

# ─── Step 8: Build Frontend (production) ──────────────────────────────────
step_start "8" "Building frontend (React production build)"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 8"
    step_skip
else
FRONTEND_SRC="$INSTALL_DIR/frontend"
if [ ! -d "$FRONTEND_SRC" ]; then
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &>/dev/null && pwd )"
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    cp -r "$PROJECT_ROOT/frontend" "$FRONTEND_SRC"
fi
cd "$FRONTEND_SRC"

# Handle low-RAM devices (less than 1GB)
if [ "${LOW_RAM:-0}" -eq 1 ]; then
    echo -e "  ${WARN} Low memory detected – limiting Node.js heap to 256MB."
    echo -e "  ${GRAY}  The build will be slow (10-30 minutes). Please be patient.${NC}"
    export NODE_OPTIONS="--max-old-space-size=256"
fi

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
fi
# Move built files to static directory
rm -rf "$STATIC_DIR/*" 2>/dev/null
cp -r "$FRONTEND_SRC/dist/"* "$STATIC_DIR/"
cd -
step_ok

# ─── Step 9: Configure Nginx ──────────────────────────────────────────────
step_start "9" "Configuring Nginx web server"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 9"
    step_skip
else

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
fi

# ─── Step 10: Create systemd service for backend ──────────────────────────
step_start "10" "Creating systemd service for backend"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 10"
    step_skip
else

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
fi

# ─── Step 11: Start services ──────────────────────────────────────────────
step_start "11" "Starting services"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 11"
    step_skip
else

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
fi

# ─── Step 12: Final verification ──────────────────────────────────────────
step_start "12" "Verifying installation"
if [ "$TEST_MODE" -eq 1 ]; then
    echo -e "  ${INFO} [DRY RUN] Would execute step 12"
    step_skip
else

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
fi

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
