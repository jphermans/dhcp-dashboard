#!/usr/bin/env bash

# =============================================================================
# Raspberry Pi DHCP & DNS Server - Easy Install Script
# Installs dnsmasq and configures it as the sole DHCP/DNS server.
# The TP-Link ER605 acts as the internet gateway (no DHCP).
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
NC='\033[0m'       # Reset
BG_RED='\033[41m'
BG_GREEN='\033[42m'
BG_YELLOW='\033[43m'
BG_BLUE='\033[44m'
BG_CYAN='\033[46m'
BOLD='\033[1m'
DIM='\033[2m'

# ─── Symbols ─────────────────────────────────────────────────────────────────
CHK="${LGREEN}✔${NC}"
CROSS="${LRED}✘${NC}"
WARN="${YELLOW}⚠${NC}"
INFO="${LCYAN}ℹ${NC}"
ARROW="${LCYAN}➤${NC}"
DOT="${GRAY}•${NC}"

# ─── Terminal Width ──────────────────────────────────────────────────────────
TERM_WIDTH=$(tput cols 2>/dev/null || echo 80)

# ─── Helper Functions ────────────────────────────────────────────────────────

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

# Status line with icon
step_start() {
    local num="$1"
    local desc="$2"
    printf "\n${BOLD}${WHITE}[%s]${NC} ${CYAN}%s${NC}... " "$num" "$desc"
}

step_ok() {
    echo -e "${CHK}"
}

step_fail() {
    echo -e "${CROSS}"
}

step_skip() {
    echo -e "${YELLOW}skipped${NC}"
}

step_warn() {
    local msg="$1"
    echo -e "${WARN} ${YELLOW}${msg}${NC}"
}

# ─── Progress Bar ────────────────────────────────────────────────────────────
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

# ─── Validation Functions ────────────────────────────────────────────────────

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

validate_cidr() {
    local cidr=$1
    [[ $cidr =~ ^[0-9]+$ ]] && ((cidr >= 8 && cidr <= 32))
}

# ─── Trap for Clean Exit ─────────────────────────────────────────────────────
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
printf "${LBLUE}║${NC}${BOLD}${WHITE}%*s${NC}${LBLUE}║${NC}\n" $(( (TERM_WIDTH - 2 + 35) / 2 )) "DHCP & DNS Server Setup for Raspberry Pi"
printf "${LBLUE}║${NC}${WHITE}%*s${NC}${LBLUE}║${NC}\n" $((TERM_WIDTH - 2)) ""
printf "${LBLUE}╚" ; printf '═%.0s' $(seq 1 $((TERM_WIDTH - 2))) ; printf "╝${NC}\n\n"

# Introduction
echo -e "${GRAY}This script will install and configure ${BOLD}dnsmasq${NC}${GRAY} to act as the${NC}"
echo -e "${GRAY}DHCP and DNS server on your local network.${NC}"
echo ""
echo -e "${GRAY}Router role: ${WHITE}TP-Link ER605${GRAY} → ${LCYAN}Internet Gateway ONLY${GRAY} (no DHCP)${NC}"
echo -e "${GRAY}Pi role:    ${WHITE}Raspberry Pi${GRAY}     → ${LCYAN}DHCP Server + DNS Resolver${NC}"

hr

# Pre-flight warning
warn_box "Before proceeding, you MUST disable the DHCP server on the TP-Link ER605\n  via its web interface (Network → DHCP Server → Disable).\n  The ER605 will only handle internet routing and NAT."

echo ""

# ─── Privilege Check ─────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    error_box "This script must be run as root (use sudo)."
    echo -e "${GRAY}  Please run: ${WHITE}sudo $0${NC}\n"
    exit 1
fi

# ─── System Check ─────────────────────────────────────────────────────────────
info_box "Running system checks..."

# Check if running on a Pi
if grep -qi "raspberry" /proc/device-tree/model 2>/dev/null; then
    PI_MODEL=$(tr -d '\0' < /proc/device-tree/model 2>/dev/null)
    echo -e "  ${CHK} Detected: ${GREEN}${PI_MODEL}${NC}"
else
    echo -e "  ${WARN} Not running on a Raspberry Pi (continuing anyway)"
fi

# Check network interface
if ip link show eth0 &>/dev/null; then
    echo -e "  ${CHK} Network interface: ${GREEN}eth0${NC} available"
elif ip link show wlan0 &>/dev/null; then
    echo -e "  ${WARN} Using Wi-Fi interface: ${YELLOW}wlan0${NC} (adjust config if needed)"
else
    echo -e "  ${WARN} No eth0 or wlan0 found; check network configuration"
fi

echo ""

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          CONFIGURATION QUESTIONS                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

title_box "CONFIGURATION"

echo -e "${GRAY}Please provide the network configuration details below.${NC}"
echo -e "${GRAY}Press Enter to accept default values (shown in brackets).${NC}\n"

hr "·"
echo ""

# --- IP Address ---
while true; do
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Static IP address for this Pi${NC} ${GRAY}[192.168.1.2]${NC}: "
    read PI_IP
    PI_IP="${PI_IP:-192.168.1.2}"
    if validate_ip "$PI_IP"; then
        break
    fi
    echo -e "  ${CROSS} ${LRED}Invalid IP address format. Use x.x.x.x (0-255 per octet).${NC}"
done

# --- CIDR ---
while true; do
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Subnet mask (CIDR notation)${NC} ${GRAY}[24]${NC}: "
    read CIDR
    CIDR="${CIDR:-24}"
    if validate_cidr "$CIDR"; then
        break
    fi
    echo -e "  ${CROSS} ${LRED}Invalid CIDR. Enter a number between 8 and 32.${NC}"
done

# --- Gateway ---
while true; do
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Gateway IP (TP-Link ER605)${NC} ${GRAY}[192.168.1.1]${NC}: "
    read GW_IP
    GW_IP="${GW_IP:-192.168.1.1}"
    if validate_ip "$GW_IP"; then
        break
    fi
    echo -e "  ${CROSS} ${LRED}Invalid IP address format.${NC}"
done

# --- DHCP Range Start ---
while true; do
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}DHCP lease range start${NC} ${GRAY}[192.168.1.100]${NC}: "
    read DHCP_START
    DHCP_START="${DHCP_START:-192.168.1.100}"
    if validate_ip "$DHCP_START"; then
        break
    fi
    echo -e "  ${CROSS} ${LRED}Invalid IP address format.${NC}"
done

# --- DHCP Range End ---
while true; do
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}DHCP lease range end${NC} ${GRAY}[192.168.1.200]${NC}: "
    read DHCP_END
    DHCP_END="${DHCP_END:-192.168.1.200}"
    if validate_ip "$DHCP_END"; then
        break
    fi
    echo -e "  ${CROSS} ${LRED}Invalid IP address format.${NC}"
done

# --- Domain ---
printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Local domain name${NC} ${GRAY}[home.local]${NC}: "
read DOMAIN
DOMAIN="${DOMAIN:-home.local}"

# --- DNS 1 ---
while true; do
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Upstream DNS server #1${NC} ${GRAY}[1.1.1.1]${NC}: "
    read DNS1
    DNS1="${DNS1:-1.1.1.1}"
    if validate_ip "$DNS1"; then
        break
    fi
    echo -e "  ${CROSS} ${LRED}Invalid IP address format.${NC}"
done

# --- DNS 2 ---
while true; do
    printf "${BOLD}${LCYAN}  ➤${NC} ${WHITE}Upstream DNS server #2${NC} ${GRAY}[8.8.8.8]${NC}: "
    read DNS2
    DNS2="${DNS2:-8.8.8.8}"
    if validate_ip "$DNS2"; then
        break
    fi
    echo -e "  ${CROSS} ${LRED}Invalid IP address format.${NC}"
done

echo ""
hr "·"
echo ""

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          CONFIGURATION SUMMARY                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

title_box "CONFIGURATION SUMMARY"

echo -e "  ${GRAY}┌─────────────────────────────────────────────┐${NC}"
echo -e "  ${GRAY}│${NC}  ${WHITE}Pi Static IP:${NC}    ${LGREEN}${PI_IP}/${CIDR}${NC}"
echo -e "  ${GRAY}│${NC}  ${WHITE}Gateway (ER605):${NC}  ${LGREEN}${GW_IP}${NC}"
echo -e "  ${GRAY}│${NC}  ${WHITE}DHCP Range:${NC}      ${LGREEN}${DHCP_START} → ${DHCP_END}${NC}"
echo -e "  ${GRAY}│${NC}  ${WHITE}Local Domain:${NC}    ${LGREEN}${DOMAIN}${NC}"
echo -e "  ${GRAY}│${NC}  ${WHITE}Upstream DNS:${NC}    ${LGREEN}${DNS1}, ${DNS2}${NC}"
echo -e "  ${GRAY}└─────────────────────────────────────────────┘${NC}"

echo ""

# Confirmation
printf "${BOLD}${YELLOW}  ${WARN}  Proceed with installation?${NC} ${GRAY}(y/N)${NC}: "
read CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo -e "\n${GRAY}  Installation aborted by user. No changes were made.${NC}\n"
    exit 0
fi

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          INSTALLATION                                       ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

clear
title_box "INSTALLATION IN PROGRESS"
echo ""

STEP=0

# ─── Step 1: System Update ────────────────────────────────────────────────────
STEP=$((STEP + 1))
step_start "$STEP/9" "Updating package lists"
(sudo apt-get update -qq 2>&1 | tail -1) &
spinner $! "apt-get update"
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    step_ok
else
    step_warn "Package update had issues, continuing anyway"
fi

STEP=$((STEP + 1))
step_start "$STEP/9" "Upgrading installed packages"
(sudo apt-get upgrade -y -qq 2>&1 | tail -1) &
spinner $! "apt-get upgrade"
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    step_ok
else
    step_warn "Package upgrade had issues, continuing anyway"
fi

# ─── Step 2: Install dnsmasq ─────────────────────────────────────────────────
STEP=$((STEP + 1))
step_start "$STEP/9" "Installing dnsmasq"
(sudo apt-get install -y -qq dnsmasq 2>&1 | tail -1) &
spinner $! "apt-get install dnsmasq"
if dpkg -l dnsmasq 2>/dev/null | grep -q '^ii'; then
    step_ok
else
    step_fail
    error_box "Failed to install dnsmasq. Check network and apt sources."
    exit 1
fi

# ─── Step 3: Configure Static IP ─────────────────────────────────────────────
STEP=$((STEP + 1))
step_start "$STEP/9" "Configuring static IP"
if grep -q "interface eth0" /etc/dhcpcd.conf 2>/dev/null; then
    step_skip
    echo -e "     ${GRAY}Static IP configuration already present in /etc/dhcpcd.conf${NC}"
else
    cat >> /etc/dhcpcd.conf << EOF

# Added by DHCP/DNS install script
interface eth0
static ip_address=$PI_IP/$CIDR
static routers=$GW_IP
static domain_name_servers=$DNS1 $DNS2
EOF
    if [ $? -eq 0 ]; then
        step_ok
    else
        step_fail
        error_box "Failed to write static IP configuration."
        exit 1
    fi
fi

# ─── Step 4: Backup dnsmasq config ───────────────────────────────────────────
STEP=$((STEP + 1))
step_start "$STEP/9" "Backing up original dnsmasq.conf"
if [ -f /etc/dnsmasq.conf.bak ]; then
    step_skip
    echo -e "     ${GRAY}Backup already exists at /etc/dnsmasq.conf.bak${NC}"
elif [ -f /etc/dnsmasq.conf ]; then
    cp /etc/dnsmasq.conf /etc/dnsmasq.conf.bak
    step_ok
else
    echo "# Original config backup (empty)" > /etc/dnsmasq.conf.bak
    step_warn "No existing config to backup, created empty backup"
fi

# ─── Step 5: Write dnsmasq configuration ─────────────────────────────────────
STEP=$((STEP + 1))
step_start "$STEP/9" "Writing dnsmasq configuration"
cat > /etc/dnsmasq.conf << EOF
# ──────────────────────────────────────────────────────────────────────────────
# dnsmasq configuration — Generated by DHCP/DNS install script
# Date: $(date '+%Y-%m-%d %H:%M:%S')
# ──────────────────────────────────────────────────────────────────────────────

# Interface to listen on (use wlan0 if on Wi-Fi)
interface=eth0

# ── DHCP Settings ─────────────────────────────────────────────────────────────
dhcp-range=$DHCP_START,$DHCP_END,12h
dhcp-option=3,$GW_IP          # Gateway (TP-Link ER605)
dhcp-option=6,$PI_IP           # DNS server (this Pi)

# ── DNS Settings ──────────────────────────────────────────────────────────────
local=/$DOMAIN/
domain=$DOMAIN
server=$DNS1
server=$DNS2

# ── Performance ───────────────────────────────────────────────────────────────
cache-size=1000

# ── Logging ───────────────────────────────────────────────────────────────────
log-dhcp
log-queries
EOF
if [ $? -eq 0 ]; then
    step_ok
else
    step_fail
    error_box "Failed to write dnsmasq configuration."
    exit 1
fi

# ─── Step 6: Disable resolvconf override ─────────────────────────────────────
STEP=$((STEP + 1))
step_start "$STEP/9" "Disabling resolvconf override in dnsmasq"
if grep -q "^IGNORE_RESOLVCONF=yes" /etc/default/dnsmasq 2>/dev/null; then
    step_skip
    echo -e "     ${GRAY}IGNORE_RESOLVCONF already set to yes${NC}"
else
    echo "IGNORE_RESOLVCONF=yes" >> /etc/default/dnsmasq
    step_ok
fi

# ─── Step 7: Configure Firewall ──────────────────────────────────────────────
STEP=$((STEP + 1))
step_start "$STEP/9" "Configuring firewall rules"
if command -v ufw &>/dev/null; then
    ufw allow 53/udp >/dev/null 2>&1
    ufw allow 67/udp >/dev/null 2>&1
    ufw allow 68/udp >/dev/null 2>&1
    step_ok
    echo -e "     ${GRAY}Allowed UDP ports: 53 (DNS), 67-68 (DHCP)${NC}"
else
    step_skip
    echo -e "     ${GRAY}UFW not installed. Ensure your firewall allows UDP 53, 67, 68${NC}"
fi

# ─── Step 8: Enable and Start dnsmasq ────────────────────────────────────────
STEP=$((STEP + 1))
step_start "$STEP/9" "Enabling and starting dnsmasq service"
systemctl enable dnsmasq >/dev/null 2>&1
systemctl restart dnsmasq >/dev/null 2>&1
sleep 1
if systemctl is-active --quiet dnsmasq; then
    step_ok
else
    step_fail
    echo ""
    error_box "dnsmasq failed to start. Check logs:"
    echo -e "     ${GRAY}sudo journalctl -xeu dnsmasq${NC}"
    echo -e "     ${GRAY}sudo systemctl status dnsmasq${NC}\n"
    exit 1
fi

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║                          INSTALLATION COMPLETE                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

echo ""
hr "═"
echo ""

success_box "DHCP & DNS server is now running on ${BOLD}${LGREEN}${PI_IP}${NC}"

echo ""
echo -e "${GRAY}┌─────────────────────────────────────────────────────────────┐${NC}"
echo -e "${GRAY}│${NC}  ${WHITE}${BOLD}Network Topology${NC}"
echo -e "${GRAY}│${NC}"
echo -e "${GRAY}│${NC}  ${LCYAN}🌐 Internet${NC}"
echo -e "${GRAY}│${NC}       ${GRAY}│${NC}"
echo -e "${GRAY}│${NC}  ${YELLOW}📡 TP-Link ER605 (${GW_IP})${NC}"
echo -e "${GRAY}│${NC}  ${DIM}   Gateway + NAT — NO DHCP${NC}"
echo -e "${GRAY}│${NC}       ${GRAY}│${NC}"
echo -e "${GRAY}│${NC}  ${LGREEN}🍓 Raspberry Pi (${PI_IP})${NC}"
echo -e "${GRAY}│${NC}  ${DIM}   DHCP: ${DHCP_START}→${DHCP_END} | DNS: ${DOMAIN}${NC}"
echo -e "${GRAY}│${NC}       ${GRAY}│${NC}"
echo -e "${GRAY}│${NC}  ${GRAY}💻 ── 📱 ── 🖥️  ── 🖨️  (Client Devices)${NC}"
echo -e "${GRAY}└─────────────────────────────────────────────────────────────┘${NC}"

echo ""

# ─── Post-Install Instructions ───────────────────────────────────────────────
echo -e "${BOLD}${WHITE}📋 Next Steps:${NC}\n"

echo -e "  ${ARROW} ${BOLD}Reboot your Raspberry Pi${NC} to apply the static IP:"
echo -e "     ${GRAY}sudo reboot${NC}"
echo ""
echo -e "  ${ARROW} ${BOLD}Verify the static IP${NC} took effect:"
echo -e "     ${GRAY}ip addr show eth0${NC}"
echo ""
echo -e "  ${ARROW} ${BOLD}Check DHCP leases${NC} when clients connect:"
echo -e "     ${GRAY}cat /var/lib/misc/dnsmasq.leases${NC}"
echo ""
echo -e "  ${ARROW} ${BOLD}Test DNS resolution${NC}:"
echo -e "     ${GRAY}nslookup google.com ${PI_IP}${NC}"
echo ""
echo -e "  ${ARROW} ${BOLD}Monitor service status${NC}:"
echo -e "     ${GRAY}sudo systemctl status dnsmasq${NC}"
echo ""
echo -e "  ${ARROW} ${BOLD}View live logs${NC}:"
echo -e "     ${GRAY}sudo journalctl -fu dnsmasq${NC}"

echo ""
hr "─"
echo -e "${GREEN}  ${CHK}  Installation completed successfully!${NC}"
hr "─"
echo ""
