#!/usr/bin/env bash
# ==============================================================================
# DatrixOps Network Diagnostics Tool (CLI)
# 6-Step comprehensive network health & error detection
# Supports Linux and macOS (Darwin)
# ==============================================================================
set -Eeuo pipefail

# Text formatting
if [[ -t 1 ]]; then
    BOLD="\033[1m"
    GREEN="\033[0;32m"
    YELLOW="\033[0;33m"
    RED="\033[0;31m"
    BLUE="\033[0;34m"
    CYAN="\033[0;36m"
    RESET="\033[0m"
else
    BOLD=""
    GREEN=""
    YELLOW=""
    RED=""
    BLUE=""
    CYAN=""
    RESET=""
fi

OS="$(uname -s)"
OVERALL_STATUS="HEALTHY"
ISSUES=()
WARNINGS=()

log_header() {
    printf "\n${BOLD}${BLUE}=== Step %d: %s ===${RESET}\n" "$1" "$2"
}

pass() {
    printf "  ${GREEN}✔ [OK]${RESET} %s\n" "$*"
}

warn() {
    printf "  ${YELLOW}⚠ [WARN]${RESET} %s\n" "$*"
    WARNINGS+=("$*")
    if [[ "$OVERALL_STATUS" == "HEALTHY" ]]; then
        OVERALL_STATUS="WARNING"
    fi
}

fail() {
    printf "  ${RED}✖ [FAIL]${RESET} %s\n" "$*"
    ISSUES+=("$*")
    OVERALL_STATUS="CRITICAL"
}

info() {
    printf "  ${CYAN}ℹ [INFO]${RESET} %s\n" "$*"
}

# ==============================================================================
# Banner
# ==============================================================================
printf "${BOLD}============================================================${RESET}\n"
printf "${BOLD}  DatrixOps Network Diagnostics & Troubleshooting Tool    ${RESET}\n"
printf "${BOLD}============================================================${RESET}\n"
printf "  Timestamp: %s\n" "$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
printf "  Host:      %s (%s)\n" "$(hostname)" "$OS"

# ==============================================================================
# Step 1: Default Route & Primary Uplink Detection
# ==============================================================================
log_header 1 "Default Route & Primary Uplink Interface"

PRIMARY_IFACE=""
DEFAULT_GATEWAY=""

if [[ "$OS" == "Linux" ]]; then
    # Try /proc/net/route first (fast, native, no external binary)
    if [[ -r /proc/net/route ]]; then
        while read -r iface dest gw flags refcnt use metric mask mtu win irtt; do
            if [[ "$dest" == "00000000" && "$mask" == "00000000" ]]; then
                PRIMARY_IFACE="$iface"
                # Decode hex gateway (little-endian hex IP)
                if [[ ${#gw} -eq 8 ]]; then
                    b1=$((16#${gw:6:2}))
                    b2=$((16#${gw:4:2}))
                    b3=$((16#${gw:2:2}))
                    b4=$((16#${gw:0:2}))
                    DEFAULT_GATEWAY="${b1}.${b2}.${b3}.${b4}"
                fi
                break
            fi
        done < <(tail -n +2 /proc/net/route 2>/dev/null || true)
    fi

    # Fallback to ip route if not resolved
    if [[ -z "$PRIMARY_IFACE" ]] && command -v ip >/dev/null 2>&1; then
        route_line="$(ip route show default 2>/dev/null | head -n 1 || true)"
        if [[ -n "$route_line" ]]; then
            PRIMARY_IFACE="$(echo "$route_line" | awk '{for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}')"
            DEFAULT_GATEWAY="$(echo "$route_line" | awk '{for(i=1;i<=NF;i++) if($i=="via") print $(i+1)}')"
        fi
    fi
elif [[ "$OS" == "Darwin" ]]; then
    if command -v route >/dev/null 2>&1; then
        route_out="$(route -n get default 2>/dev/null || true)"
        PRIMARY_IFACE="$(echo "$route_out" | awk '/interface:/{print $2}')"
        DEFAULT_GATEWAY="$(echo "$route_out" | awk '/gateway:/{print $2}')"
    fi
fi

# Fallback: get first UP non-loopback interface
if [[ -z "$PRIMARY_IFACE" ]]; then
    if command -v ifconfig >/dev/null 2>&1; then
        PRIMARY_IFACE="$(ifconfig -l 2>/dev/null | tr ' ' '\n' | grep -v '^lo' | head -n 1 || true)"
    fi
fi

if [[ -n "$PRIMARY_IFACE" && -n "$DEFAULT_GATEWAY" ]]; then
    pass "Primary Uplink Interface: ${BOLD}${PRIMARY_IFACE}${RESET}"
    pass "Default Gateway IP:       ${BOLD}${DEFAULT_GATEWAY}${RESET}"
elif [[ -n "$PRIMARY_IFACE" ]]; then
    warn "Primary Uplink Interface: ${PRIMARY_IFACE} (Gateway not found)"
else
    fail "No primary uplink interface or default route detected!"
fi

# Display interface IP & MAC
IFACE_IP=""
if [[ -n "$PRIMARY_IFACE" ]]; then
    if [[ "$OS" == "Linux" ]] && command -v ip >/dev/null 2>&1; then
        IFACE_IP="$(ip -o -4 addr show dev "$PRIMARY_IFACE" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -n 1 || true)"
        IFACE_MAC="$(cat "/sys/class/net/${PRIMARY_IFACE}/address" 2>/dev/null || true)"
    elif command -v ifconfig >/dev/null 2>&1; then
        IFACE_IP="$(ifconfig "$PRIMARY_IFACE" 2>/dev/null | awk '/inet /{print $2}' | head -n 1 || true)"
        IFACE_MAC="$(ifconfig "$PRIMARY_IFACE" 2>/dev/null | awk '/ether /{print $2}' | head -n 1 || true)"
    fi
    [[ -n "$IFACE_IP" ]] && info "Interface IP:  $IFACE_IP"
    [[ -n "$IFACE_MAC" ]] && info "Interface MAC: $IFACE_MAC"
fi

# ==============================================================================
# Step 2: Gateway Reachability, Packet Loss & Latency (5 ICMP packets)
# ==============================================================================
log_header 2 "Gateway Reachability & Latency Test (5 packets)"

if [[ -n "$DEFAULT_GATEWAY" ]]; then
    info "Pinging Default Gateway ($DEFAULT_GATEWAY)..."
    PING_OUT=""
    if [[ "$OS" == "Linux" ]]; then
        PING_OUT="$(ping -c 5 -i 0.2 -W 1 "$DEFAULT_GATEWAY" 2>&1 || ping -c 5 -W 1 "$DEFAULT_GATEWAY" 2>&1 || true)"
    else
        PING_OUT="$(ping -c 5 -i 0.2 -W 1000 "$DEFAULT_GATEWAY" 2>&1 || ping -c 5 -W 1000 "$DEFAULT_GATEWAY" 2>&1 || true)"
    fi

    # Parse packet loss percentage
    PACKET_LOSS="$(echo "$PING_OUT" | grep -o '[0-9.]*% packet loss' | awk '{print $1}' | tr -d '%' || true)"
    # Parse RTT avg
    AVG_RTT="$(echo "$PING_OUT" | awk -F'/' '/rtt|round-trip/{print $5}' || true)"

    if [[ -z "$PACKET_LOSS" ]]; then
        # Check if 100% loss
        if echo "$PING_OUT" | grep -qi '100% packet loss\|100\.0% packet loss\|Request timeout'; then
            PACKET_LOSS="100"
        else
            PACKET_LOSS="0"
        fi
    fi

    # Format numeric float check
    LOSS_INT="${PACKET_LOSS%.*}"
    LOSS_INT="${LOSS_INT:-0}"

    if [[ "$LOSS_INT" -eq 0 ]]; then
        pass "Gateway Reachable: 0% packet loss (Avg Latency: ${AVG_RTT:-<1} ms)"
    elif [[ "$LOSS_INT" -lt 40 ]]; then
        warn "Gateway Degraded: ${PACKET_LOSS}% packet loss (Avg Latency: ${AVG_RTT:-N/A} ms)"
    else
        fail "Gateway Critical: ${PACKET_LOSS}% packet loss! High packet drop to next-hop gateway."
    fi

    # Latency warning threshold (> 100ms)
    if [[ -n "$AVG_RTT" ]]; then
        AVG_RTT_INT="${AVG_RTT%.*}"
        if [[ "${AVG_RTT_INT:-0}" -gt 100 ]]; then
            warn "High Gateway Latency: ${AVG_RTT} ms (Expected < 50ms for local gateway)"
        fi
    fi
else
    fail "Skipped gateway ping: No default gateway IP available."
fi

# ==============================================================================
# Step 3: DNS Resolution & Latency Check
# ==============================================================================
log_header 3 "DNS Resolution & Resolver Health Check"

TEST_DOMAINS=("google.com" "cloudflare.com" "github.com")
DNS_OK=0
DNS_TOTAL=${#TEST_DOMAINS[@]}

# Time resolution with python or awk
resolve_domain() {
    local domain="$1"
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import socket, time, sys
t0 = time.time()
try:
    ip = socket.gethostbyname('$domain')
    el = (time.time() - t0) * 1000
    print(f'{ip}:{el:.1f}')
except Exception as e:
    sys.exit(1)
" 2>/dev/null || return 1
    elif command -v dig >/dev/null 2>&1; then
        local out
        out="$(dig +time=3 +tries=1 "$domain" A +short 2>/dev/null | head -n 1 || true)"
        if [[ -n "$out" ]]; then
            echo "${out}:0.0"
            return 0
        fi
        return 1
    elif command -v getent >/dev/null 2>&1; then
        local out
        out="$(getent hosts "$domain" 2>/dev/null | awk '{print $1}' | head -n 1 || true)"
        if [[ -n "$out" ]]; then
            echo "${out}:0.0"
            return 0
        fi
        return 1
    elif command -v nslookup >/dev/null 2>&1; then
        local out
        out="$(nslookup -timeout=3 "$domain" 2>/dev/null | awk '/Address: / {print $2}' | tail -n 1 || true)"
        if [[ -n "$out" ]]; then
            echo "${out}:0.0"
            return 0
        fi
        return 1
    else
        # Fallback ping test for name resolution
        if ping -c 1 -W 3 "$domain" >/dev/null 2>&1; then
            echo "resolved:0.0"
            return 0
        fi
        return 1
    fi
}

for domain in "${TEST_DOMAINS[@]}"; do
    if res="$(resolve_domain "$domain")"; then
        ip="${res%%:*}"
        lat="${res##*:}"
        if [[ "$lat" != "0.0" ]]; then
            pass "DNS: $domain -> $ip (${lat} ms)"
        else
            pass "DNS: $domain -> $ip"
        fi
        ((DNS_OK++))
    else
        fail "DNS: Failed to resolve $domain (timeout or NXDOMAIN)"
    fi
done

if [[ "$DNS_OK" -eq 0 ]]; then
    # Test if direct public DNS works
    info "Testing direct query to Public DNS (1.1.1.1)..."
    if command -v dig >/dev/null 2>&1 && dig @1.1.1.1 +time=3 +tries=1 google.com +short >/dev/null 2>&1; then
        warn "Local resolver (/etc/resolv.conf) is failing, but direct upstream DNS (1.1.1.1) works!"
    elif command -v nslookup >/dev/null 2>&1 && nslookup -timeout=3 google.com 1.1.1.1 >/dev/null 2>&1; then
        warn "Local resolver (/etc/resolv.conf) is failing, but direct upstream DNS (1.1.1.1) works!"
    else
        fail "DNS is completely unreachable (Local resolver and 1.1.1.1 both failed)!"
    fi
fi

# ==============================================================================
# Step 4: Outbound HTTPS Internet Connectivity (Egress)
# ==============================================================================
log_header 4 "Outbound HTTPS Connectivity (Egress Ports 80/443)"

check_https() {
    local url="$1"
    local name="$2"
    if command -v curl >/dev/null 2>&1; then
        if curl -fsS -m 4 --head "$url" >/dev/null 2>&1; then
            pass "HTTPS Egress to $name ($url)"
            return 0
        fi
    elif command -v wget >/dev/null 2>&1; then
        if wget -q --spider --timeout=4 "$url" >/dev/null 2>&1; then
            pass "HTTPS Egress to $name ($url)"
            return 0
        fi
    fi
    fail "HTTPS Egress to $name ($url) timed out or blocked!"
    return 1
}

check_https "https://1.1.1.1" "Cloudflare 1.1.1.1 (Direct IP / No DNS)" || true
check_https "https://www.google.com" "Google (Domain & SSL validation)" || true

# ==============================================================================
# Step 5: DatrixOps Upstream & Registry Endpoints
# ==============================================================================
log_header 5 "DatrixOps Dependencies & Container Registries"

DATRIX_ENDPOINTS=(
    "https://api.github.com|GitHub API (Releases / Agent Update)"
    "https://ghcr.io|GitHub Container Registry (Docker Images)"
    "https://raw.githubusercontent.com|GitHub Raw (Install Scripts)"
)

for entry in "${DATRIX_ENDPOINTS[@]}"; do
    url="${entry%%|*}"
    desc="${entry##*|}"
    if command -v curl >/dev/null 2>&1; then
        code="$(curl -s -m 4 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || true)"
        code="${code:-000}"
        if [[ "$code" != "000" && "$code" =~ ^[234] ]]; then
            pass "$desc (HTTP $code)"
        else
            warn "$desc ($url) unreachable or blocked (HTTP $code)"
        fi
    else
        info "curl not installed; skipping endpoint HTTP test"
    fi
done

# ==============================================================================
# Step 6: Local Service Ports & Interface Drop/Error Counters
# ==============================================================================
log_header 6 "Local Service Ports & Interface Drops/Errors"

# Local Ports
info "Checking local service listening ports..."
check_port() {
    local port="$1"
    local svc="$2"
    local listening=false
    if command -v ss >/dev/null 2>&1; then
        if ss -tuln 2>/dev/null | grep -q ":${port} "; then
            listening=true
        fi
    elif command -v netstat >/dev/null 2>&1; then
        if netstat -tuln 2>/dev/null | grep -q ":${port} "; then
            listening=true
        fi
    elif command -v lsof >/dev/null 2>&1; then
        if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
            listening=true
        fi
    fi

    if [[ "$listening" == "true" ]]; then
        pass "Service Port :$port ($svc) is LISTENING"
    else
        info "Service Port :$port ($svc) is NOT active locally"
    fi
}

check_port 80 "HTTP / Reverse Proxy"
check_port 443 "HTTPS / SSL Proxy"
check_port 8080 "DatrixOps Backend"
check_port 5432 "PostgreSQL Database"

# Interface Drops & Errors
printf "\n"
info "Inspecting network interface error and drop counters..."

if [[ "$OS" == "Linux" && -r /proc/net/dev ]]; then
    printf "  %-15s %-12s %-12s %-12s %-12s\n" "INTERFACE" "RX_ERRS" "RX_DROP" "TX_ERRS" "TX_DROP"
    printf "  %-15s %-12s %-12s %-12s %-12s\n" "---------------" "------------" "------------" "------------" "------------"
    while read -r line; do
        iface="$(echo "$line" | awk -F: '{print $1}' | tr -d ' ')"
        rest="$(echo "$line" | awk -F: '{print $2}')"
        rx_bytes="$(echo "$rest" | awk '{print $1}')"
        rx_errs="$(echo "$rest" | awk '{print $3}')"
        rx_drop="$(echo "$rest" | awk '{print $4}')"
        tx_errs="$(echo "$rest" | awk '{print $11}')"
        tx_drop="$(echo "$rest" | awk '{print $12}')"

        if [[ -n "$iface" && -n "$rx_errs" ]]; then
            printf "  %-15s %-12s %-12s %-12s %-12s\n" "$iface" "$rx_errs" "$rx_drop" "$tx_errs" "$tx_drop"
            if [[ "$rx_errs" -gt 0 || "$tx_errs" -gt 0 ]]; then
                if [[ "$iface" == "$PRIMARY_IFACE" ]]; then
                    fail "Primary uplink $iface has accumulated $rx_errs RX errors and $tx_errs TX errors!"
                else
                    warn "Interface $iface has accumulated $rx_errs RX errors and $tx_errs TX errors."
                fi
            fi
            if [[ "$rx_drop" -gt 0 || "$tx_drop" -gt 0 ]]; then
                if [[ "$iface" == "$PRIMARY_IFACE" ]]; then
                    warn "Primary uplink $iface has accumulated $rx_drop RX drops and $tx_drop TX drops (buffer congestion)."
                fi
            fi
        fi
    done < <(tail -n +3 /proc/net/dev)
elif [[ "$OS" == "Darwin" ]]; then
    if command -v netstat >/dev/null 2>&1; then
        printf "  %-15s %-12s %-12s %-12s %-12s\n" "INTERFACE" "IN_PKTS" "IN_ERRS" "OUT_PKTS" "OUT_ERRS"
        printf "  %-15s %-12s %-12s %-12s %-12s\n" "---------------" "------------" "------------" "------------" "------------"
        while read -r name ipkts ierrs opkts oerrs; do
            if [[ -n "$name" && -n "$ierrs" ]]; then
                printf "  %-15s %-12s %-12s %-12s %-12s\n" "$name" "$ipkts" "$ierrs" "$opkts" "$oerrs"
                if [[ "$ierrs" -gt 0 || "$oerrs" -gt 0 ]]; then
                    if [[ "$name" == "$PRIMARY_IFACE" ]]; then
                        fail "Primary uplink $name has accumulated $ierrs input errors and $oerrs output errors!"
                    elif [[ ! "$name" =~ ^(lo|utun|bridge|gif|stf|anpi) ]]; then
                        warn "Physical interface $name has accumulated $ierrs input errors and $oerrs output errors."
                    fi
                fi
            fi
        done < <(netstat -inb 2>/dev/null | awk '/<Link#/ { print $1, $(NF-6), $(NF-5), $(NF-3), $(NF-2) }')
    fi
fi

# ==============================================================================
# Summary & Diagnosis Verdict
# ==============================================================================
printf "\n${BOLD}============================================================${RESET}\n"
printf "${BOLD}  Diagnostics Summary Verdict                              ${RESET}\n"
printf "${BOLD}============================================================${RESET}\n"

if [[ "$OVERALL_STATUS" == "HEALTHY" ]]; then
    printf "  Status:  ${GREEN}${BOLD}🟢 HEALTHY${RESET}\n"
    printf "  Details: All network layers (Gateway, DNS, Egress, Ports) operational.\n"
    printf "           Zero packet loss and no physical errors detected.\n"
    exit 0
elif [[ "$OVERALL_STATUS" == "WARNING" ]]; then
    printf "  Status:  ${YELLOW}${BOLD}🟡 WARNING${RESET}\n"
    printf "  Details: Network is operational with non-fatal performance issues:\n"
    for w in "${WARNINGS[@]}"; do
        printf "           - %s\n" "$w"
    done
    printf "\n  ${BOLD}Recommendations:${RESET}\n"
    printf "   • Review packet drops: check buffer sizes or high burst traffic (txqueuelen).\n"
    printf "   • Review DNS latency: consider adding 1.1.1.1 or 8.8.8.8 to /etc/resolv.conf.\n"
    exit 0
else
    printf "  Status:  ${RED}${BOLD}🔴 CRITICAL${RESET}\n"
    printf "  Details: Severe network connectivity or hardware error detected:\n"
    for issue in "${ISSUES[@]}"; do
        printf "           - %s\n" "$issue"
    done
    printf "\n  ${BOLD}Remedial Actions:${RESET}\n"
    printf "   • Default Gateway / Ping Failure: Check local router, VLAN tag, or switch port.\n"
    printf "   • DNS Failure: Verify nameservers in /etc/resolv.conf and check UDP port 53 outbound.\n"
    printf "   • Physical Interface Errors: Check physical patch cable, NIC driver, or duplex mismatch.\n"
    printf "   • Egress HTTPS Failure: Verify iptables/nftables/UFW outbound firewall rules.\n"
    exit 1
fi
