#!/usr/bin/env bash
set -euo pipefail

# ── Colors & Symbols ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BOLD='\033[1m'
NC='\033[0m'  # No Color

CHECK="✔"
CROSS="✘"
WARN="⚠"
INFO="ℹ"
ARROW="➤"

TEST_MODE=false

# ── Helper Functions ──────────────────────────────────────────
hr() {
    local cols=$(tput cols 2>/dev/null || echo 80)
    printf "${BLUE}%${cols}s${NC}\n" | tr ' ' '─'
}

title_box() {
    local title="$1"
    local cols=$(tput cols 2>/dev/null || echo 80)
    local padding=$(( (cols - ${#title} - 2) / 2 ))
    echo
    hr
    printf "${BOLD}${CYAN}%${padding}s${NC}" ""
    printf "${BOLD}${CYAN} ${title} ${NC}"
    printf "${BOLD}${CYAN}%${padding}s${NC}\n" ""
    hr
    echo
}

box() {
    local color="$1"; shift
    local icon="$1"; shift
    local text="$*"
    local cols=$(tput cols 2>/dev/null || echo 80)
    local width=$((cols - 4))
    echo -e "${color}┌─${icon} $(printf '─%.0s' $(seq 1 $((width-3)))) ┐${NC}"
    echo -e "${color}│ ${text}${NC}"
    echo -e "${color}└$(printf '─%.0s' $(seq 1 $((width-2)))) ┘${NC}"
}

warn_box() { box "$YELLOW" "$WARN" "$*"; }
info_box() { box "$BLUE" "$INFO" "$*"; }
success_box() { box "$GREEN" "$CHECK" "$*"; }
error_box() { box "$RED" "$CROSS" "$*"; }

spinner() {
    local pid=$1
    local msg="$2"
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while kill -0 "$pid" 2>/dev/null; do
        printf "\r  ${frames[$i]} ${msg}..."
        i=$(( (i+1) % ${#frames[@]} ))
        sleep 0.1
    done
    wait "$pid"
    local exit_code=$?
    printf "\r"
    return $exit_code
}

progress_bar() {
    local percent=$1
    local message="$2"
    local bar_width=40
    local filled=$(( percent * bar_width / 100 ))
    local empty=$(( bar_width - filled ))
    printf "\r  [%s%s] %3d%%  %s" \
        "$(printf '█%.0s' $(seq 1 $filled))" \
        "$(printf '░%.0s' $(seq 1 $empty))" \
        "$percent" "$message"
}

validate_ip() {
    local ip=$1
    if [[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        local IFS='.'
        read -ra octets <<< "$ip"
        for octet in "${octets[@]}"; do
            if (( octet < 0 || octet > 255 )); then return 1; fi
        done
        return 0
    fi
    return 1
}

validate_cidr() {
    local cidr=$1
    [[ $cidr =~ ^[0-9]+$ ]] && (( cidr >= 8 && cidr <= 32 ))
}

step_start() {
    echo -e "${BOLD}[$1/$2]${NC} $3 ..."
}

step_ok() {
    echo -e "  ${GREEN}${CHECK}${NC} Done."
}

step_fail() {
    echo -e "  ${RED}${CROSS}${NC} Failed: $1"
}

step_skip() {
    echo -e "  ${YELLOW}${WARN}${NC} Skipped."
}

trap 'error_box "Installation aborted by user."; exit 1' INT TERM

# ── Parse Arguments ──────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --test|-t) TEST_MODE=true ;;
        --help|-h)
            echo "Usage: $0 [--test]"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

# ── Welcome ──────────────────────────────────────────────────
title_box "DHCP & DNS Server Installer for Raspberry Pi"

if $TEST_MODE; then
    warn_box "TEST MODE ACTIVE - No system changes will be made.\n  All commands will be simulated.\n  Use this to verify the script flow in a safe environment."
else
    echo -e "${BOLD}This script will install and configure dnsmasq as a DHCP & DNS server.${NC}\n"
    info_box "Before proceeding, ensure the TP-Link ER605 DHCP server is disabled.\n  The ER605 must act ONLY as the internet gateway."
    echo
fi

# ── Pre-flight Checks ────────────────────────────────────────
if [ "$EUID" -eq 0 ] && ! $TEST_MODE; then
    echo
    error_box "ERROR: ROOT USER DETECTED — Running as root is not allowed for security."
    echo
    echo -e "${CYAN}${BOLD}Quick Setup:${NC}"
    echo -e "  ${BOLD}1.${NC} Create a new user:        ${BOLD}sudo adduser dashboard${NC}"
    echo -e "  ${BOLD}2.${NC} Grant sudo privileges:     ${BOLD}sudo usermod -aG sudo dashboard${NC}"
    echo -e "  ${BOLD}3.${NC} Switch to the new user:    ${BOLD}su - dashboard${NC}"
    echo -e "  ${BOLD}4.${NC} Re-run this installer:     ${BOLD}./install_dhcp_dns.sh${NC}"
    echo
    exit 1
fi

# ── SUDO wrapper for non-root execution ──────────────────────
if $TEST_MODE; then
    SUDO=""
else
    SUDO="sudo"
fi

if ! $TEST_MODE; then
    if ! ping -c 1 -W 2 google.com >/dev/null 2>&1; then
        warn_box "No internet connection detected. Package installation may fail."
    fi
    if [[ -f /proc/device-tree/model ]]; then
        pi_model=$(tr -d '\0' < /proc/device-tree/model)
        info_box "Detected: $pi_model"
    fi
fi

# ── Configuration Questions ──────────────────────────────────
title_box "Network Configuration"

if $TEST_MODE; then
    echo "Test mode: simulating interactive inputs with default values."
    PI_IP="192.168.1.2"
    CIDR="24"
    GATEWAY_IP="192.168.1.1"
    DHCP_START="192.168.1.100"
    DHCP_END="192.168.1.200"
    LOCAL_DOMAIN="mylocal.loc"
    DNS1="1.1.1.1"
    DNS2="8.8.8.8"
else
    while true; do
        read -rp "Static IP for Raspberry Pi [192.168.1.2]: " PI_IP
        PI_IP=${PI_IP:-192.168.1.2}
        if validate_ip "$PI_IP"; then break; else echo -e "${RED}Invalid IP format.${NC}"; fi
    done

    while true; do
        read -rp "Subnet mask in CIDR notation [24]: " CIDR
        CIDR=${CIDR:-24}
        if validate_cidr "$CIDR"; then break; else echo -e "${RED}CIDR must be 8-32.${NC}"; fi
    done

    while true; do
        read -rp "Gateway IP (TP-Link ER605) [192.168.1.1]: " GATEWAY_IP
        GATEWAY_IP=${GATEWAY_IP:-192.168.1.1}
        if validate_ip "$GATEWAY_IP"; then break; else echo -e "${RED}Invalid IP format.${NC}"; fi
    done

    while true; do
        read -rp "DHCP range start [192.168.1.100]: " DHCP_START
        DHCP_START=${DHCP_START:-192.168.1.100}
        if validate_ip "$DHCP_START"; then break; else echo -e "${RED}Invalid IP format.${NC}"; fi
    done

    while true; do
        read -rp "DHCP range end [192.168.1.200]: " DHCP_END
        DHCP_END=${DHCP_END:-192.168.1.200}
        if validate_ip "$DHCP_END"; then break; else echo -e "${RED}Invalid IP format.${NC}"; fi
    done

    read -rp "Local domain name (e.g., myhome.local) [mylocal.loc]: " LOCAL_DOMAIN
    LOCAL_DOMAIN=${LOCAL_DOMAIN:-mylocal.loc}

    while true; do
        read -rp "Upstream DNS #1 [1.1.1.1]: " DNS1
        DNS1=${DNS1:-1.1.1.1}
        if validate_ip "$DNS1"; then break; else echo -e "${RED}Invalid IP format.${NC}"; fi
    done

    while true; do
        read -rp "Upstream DNS #2 [8.8.8.8]: " DNS2
        DNS2=${DNS2:-8.8.8.8}
        if validate_ip "$DNS2"; then break; else echo -e "${RED}Invalid IP format.${NC}"; fi
    done
fi

echo
info_box "Configuration Summary:\n\n  Pi IP:        $PI_IP/$CIDR\n  Gateway:      $GATEWAY_IP (ER605 - DHCP disabled)\n  DHCP Range:   $DHCP_START - $DHCP_END\n  Domain:       $LOCAL_DOMAIN\n  Upstream DNS: $DNS1, $DNS2"

if ! $TEST_MODE; then
    read -rp "Proceed with installation? (y/N): " CONFIRM
    if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
        error_box "Installation cancelled."
        exit 0
    fi
fi

# ── Installation Steps ───────────────────────────────────────
title_box "Installation Progress"

TOTAL_STEPS=9

run_cmd() {
    if $TEST_MODE; then
        echo -e "  ${YELLOW}${WARN}${NC} [DRY-RUN] Would run: $*"
        return 0
    fi
    eval "$@"
}

# Step 1: Update packages
step_start 1 $TOTAL_STEPS "Updating package lists"
if $TEST_MODE; then
    echo "  [DRY-RUN] apt-get update & upgrade"
    step_ok
else
    (apt-get update -qq && apt-get upgrade -y -qq) &
    spinner $! "Updating packages"
    if [ $? -eq 0 ]; then step_ok; else step_fail "Package update failed"; exit 1; fi
fi

# Step 2: Install dnsmasq
step_start 2 $TOTAL_STEPS "Installing dnsmasq"
if $TEST_MODE; then
    echo "  [DRY-RUN] apt-get install -y dnsmasq"
    step_ok
else
    if ! dpkg -s dnsmasq >/dev/null 2>&1; then
        (apt-get install -y dnsmasq) &
        spinner $! "Installing dnsmasq"
        if [ $? -eq 0 ]; then step_ok; else step_fail "Failed to install dnsmasq"; exit 1; fi
    else
        echo -e "  ${YELLOW}${INFO}${NC} dnsmasq already installed."
        step_ok
    fi
fi

# Step 3: Configure static IP
step_start 3 $TOTAL_STEPS "Configuring static IP on $PI_IP/$CIDR"
static_config="/etc/dhcpcd.conf"
if $TEST_MODE; then
    echo "  [DRY-RUN] Would write to $static_config"
    step_ok
else
    if grep -q "interface eth0" "$static_config" 2>/dev/null || grep -q "$PI_IP" "$static_config" 2>/dev/null; then
        echo -e "  ${YELLOW}${WARN}${NC} Static IP config already present."
        step_skip
    else
        cat >> "$static_config" <<EOF

# DHCP/DNS server static IP
interface eth0
static ip_address=$PI_IP/$CIDR
static routers=$GATEWAY_IP
static domain_name_servers=$DNS1 $DNS2
EOF
        step_ok
    fi
fi

# Step 4: Backup dnsmasq.conf
step_start 4 $TOTAL_STEPS "Backing up original dnsmasq configuration"
conf_file="/etc/dnsmasq.conf"
backup_file="/etc/dnsmasq.conf.orig.backup"
if $TEST_MODE; then
    echo "  [DRY-RUN] Would backup $conf_file"
    step_ok
else
    if [ -f "$conf_file" ] && [ ! -f "$backup_file" ]; then
        cp "$conf_file" "$backup_file"
        step_ok
    else
        echo -e "  ${YELLOW}${WARN}${NC} Backup already exists or config missing."
        step_skip
    fi
fi

# Step 5: Write dnsmasq configuration
step_start 5 $TOTAL_STEPS "Writing dnsmasq configuration"
if $TEST_MODE; then
    echo "  [DRY-RUN] Would write: /etc/dnsmasq.conf"
    step_ok
else
    cat > "$conf_file" <<EOF
# DHCP & DNS configuration generated by install script ($(date))
domain-needed
bogus-priv
no-resolv
no-poll

interface=eth0
listen-address=127.0.0.1
listen-address=$PI_IP

expand-hosts
domain=$LOCAL_DOMAIN
local=/$LOCAL_DOMAIN/

dhcp-range=$DHCP_START,$DHCP_END,255.255.255.0,24h
dhcp-option=3,$GATEWAY_IP
dhcp-option=6,$PI_IP
dhcp-option=option:domain-name,$LOCAL_DOMAIN

server=$DNS1
server=$DNS2
cache-size=1000

log-dhcp
log-queries
log-facility=/var/log/dnsmasq.log
EOF
    step_ok
fi

# Step 6: Ensure resolvconf override
env_file="/etc/default/dnsmasq"
step_start 6 $TOTAL_STEPS "Disabling resolvconf override"
if $TEST_MODE; then
    echo "  [DRY-RUN] Would update $env_file"
    step_ok
else
    if grep -q "^IGNORE_RESOLVCONF=yes" "$env_file" 2>/dev/null; then
        echo -e "  ${YELLOW}${INFO}${NC} Already set."
        step_skip
    else
        echo "IGNORE_RESOLVCONF=yes" >> "$env_file"
        step_ok
    fi
fi

# Step 7: Firewall rules
step_start 7 $TOTAL_STEPS "Configuring firewall (UFW)"
if $TEST_MODE; then
    echo "  [DRY-RUN] Would allow udp 53,67,68"
    step_ok
else
    if command -v ufw >/dev/null 2>&1; then
        ufw allow 53/udp >/dev/null 2>&1
        ufw allow 67/udp >/dev/null 2>&1
        ufw allow 68/udp >/dev/null 2>&1
        step_ok
    else
        echo -e "  ${YELLOW}${WARN}${NC} UFW not installed. Please open ports manually."
        step_skip
    fi
fi

# Step 8: Enable and start dnsmasq
step_start 8 $TOTAL_STEPS "Enabling and starting dnsmasq service"
if $TEST_MODE; then
    echo "  [DRY-RUN] Would run: systemctl enable --now dnsmasq"
    step_ok
else
    systemctl enable dnsmasq >/dev/null 2>&1 || true
    systemctl restart dnsmasq
    sleep 2
    if systemctl is-active --quiet dnsmasq; then
        step_ok
    else
        step_fail "dnsmasq did not start. Check logs: journalctl -u dnsmasq"
        exit 1
    fi
fi

# Step 9: Verify
step_start 9 $TOTAL_STEPS "Verifying installation"
if $TEST_MODE; then
    echo "  [DRY-RUN] Would test with: dig localhost, systemctl status dnsmasq"
    step_ok
else
    sleep 2
    if systemctl is-active --quiet dnsmasq; then
        step_ok
    else
        step_fail "Verification failed."
        exit 1
    fi
fi

# ── Completion ───────────────────────────────────────────────
echo
success_box "Installation $([ $TEST_MODE = true ] && echo '(simulated) ' )completed successfully!"
echo

if $TEST_MODE; then
    echo -e "${YELLOW}This was a DRY-RUN. No changes were made to the system.${NC}\n"
    info_box "To run for real, execute: sudo ./install_dhcp_dns.sh"
else
    info_box "Next Steps:\n\n  ${ARROW} Reboot the Pi: sudo reboot\n  ${ARROW} Verify IP: ip addr show eth0\n  ${ARROW} Check leases: cat /var/lib/misc/dnsmasq.leases\n  ${ARROW} Test DNS: dig google.com @$PI_IP\n  ${ARROW} View logs: tail -f /var/log/dnsmasq.log"
fi

echo
hr
echo -e "${CYAN}  Internet <──> [TP-Link ER605 Gateway] <──> [Raspberry Pi DHCP/DNS] <──> Clients${NC}"
hr
