#!/usr/bin/env bash
set -Eeuo pipefail

SERVER_URL=""
ENROLLMENT_TOKEN=""
SERVICES=""

usage() {
    cat <<'USAGE'
Usage:
  curl -fsSL https://monitor.example.com/install.sh | sudo bash -s -- \
    --server https://monitor.example.com \
    --token ENROLLMENT_TOKEN \
    [--services "nginx,postgresql,docker"]
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --server)
            SERVER_URL="${2:-}"
            shift 2
            ;;
        --token)
            ENROLLMENT_TOKEN="${2:-}"
            shift 2
            ;;
        --services)
            SERVICES="${2:-}"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

SERVER_URL="${SERVER_URL%/}"
if [[ "$EUID" -ne 0 ]]; then
    echo "ERROR: Run this installer as root (use sudo)." >&2
    exit 1
fi
if [[ ! "$SERVER_URL" =~ ^https://[A-Za-z0-9._:-]+$ ]] &&
   [[ ! "$SERVER_URL" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$ ]]; then
    echo "ERROR: --server must be an HTTPS origin (HTTP is allowed only for localhost)." >&2
    exit 1
fi
if [[ ! "$ENROLLMENT_TOKEN" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
    echo "ERROR: --token is missing or invalid." >&2
    exit 1
fi
if [[ -n "$SERVICES" ]] && ! printf '%s' "$SERVICES" | grep -Eq '^[A-Za-z0-9._@,$ -]+$'; then
    echo "ERROR: --services contains unsupported characters." >&2
    exit 1
fi

case "$(uname -m)" in
    x86_64|amd64)
        AGENT_ARCH="amd64"
        ;;
    aarch64|arm64)
        AGENT_ARCH="arm64"
        ;;
    *)
        echo "ERROR: Unsupported Linux architecture: $(uname -m)" >&2
        exit 1
        ;;
esac

API_URL="${SERVER_URL}/api/v1"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/datrixops"
ENV_FILE="${CONFIG_DIR}/agent.env"
SERVICE_FILE="/etc/systemd/system/datrixops-agent.service"
TEMP_DIR="$(mktemp -d)"
cleanup() {
    rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT
umask 077

ENROLL_BODY="${TEMP_DIR}/enroll.json"
ENROLL_RESPONSE="${TEMP_DIR}/enroll-response.json"
printf '{"token":"%s","os_family":"linux","architecture":"%s"}' \
    "$ENROLLMENT_TOKEN" "$AGENT_ARCH" >"$ENROLL_BODY"

echo "Enrolling this machine with DatrixOps..."
HTTP_STATUS="$(
    curl --fail-with-body --silent --show-error \
        --connect-timeout 10 --max-time 30 \
        --output "$ENROLL_RESPONSE" \
        --write-out '%{http_code}' \
        --header 'Content-Type: application/json' \
        --data-binary "@${ENROLL_BODY}" \
        "${API_URL}/agent/enroll"
)" || {
    echo "ERROR: Agent enrollment request failed." >&2
    exit 1
}
if [[ "$HTTP_STATUS" != "201" ]]; then
    echo "ERROR: Agent enrollment returned HTTP ${HTTP_STATUS}." >&2
    exit 1
fi

AGENT_TOKEN="$(
    sed -n 's/.*"agent_token":"\([^"]*\)".*/\1/p' "$ENROLL_RESPONSE" | head -n 1
)"
if [[ ! "$AGENT_TOKEN" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
    echo "ERROR: Control plane returned an invalid Agent credential." >&2
    exit 1
fi

BINARY_URL="${SERVER_URL}/datrixops-agent-linux-${AGENT_ARCH}"
STAGED_BINARY="${TEMP_DIR}/datrixops-agent"
echo "Downloading signed DatrixOps Agent artifact..."
curl --fail --silent --show-error --location \
    --connect-timeout 10 --max-time 180 \
    --output "$STAGED_BINARY" "$BINARY_URL"
if [[ ! -s "$STAGED_BINARY" ]]; then
    echo "ERROR: Downloaded Agent binary is empty." >&2
    exit 1
fi
if [[ "$(od -An -tx1 -N4 "$STAGED_BINARY" | tr -d ' \n')" != "7f454c46" ]]; then
    echo "ERROR: Downloaded file is not a Linux ELF binary." >&2
    exit 1
fi

install -d -m 0700 "$CONFIG_DIR"
{
    printf 'DATRIXOPS_SERVER_URL=%s\n' "$API_URL"
    printf 'DATRIXOPS_AGENT_TOKEN=%s\n' "$AGENT_TOKEN"
    printf 'DATRIXOPS_SERVICES="%s"\n' "$SERVICES"
} >"$ENV_FILE"
chmod 0600 "$ENV_FILE"

install -m 0755 "$STAGED_BINARY" "${INSTALL_DIR}/datrixops-agent"
cat >"$SERVICE_FILE" <<SERVICE_EOF
[Unit]
Description=DatrixOps Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${ENV_FILE}
ExecStart=${INSTALL_DIR}/datrixops-agent
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE_EOF
chmod 0644 "$SERVICE_FILE"

systemctl daemon-reload
systemctl enable --now datrixops-agent
systemctl restart datrixops-agent

echo "DatrixOps Agent installed successfully."
echo "Check status: systemctl status datrixops-agent"
echo "Follow logs:  journalctl -u datrixops-agent -f"
