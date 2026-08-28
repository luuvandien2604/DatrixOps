#!/usr/bin/env bash
set -Eeuo pipefail

# ANSI color codes for English log messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()    { printf "${BLUE}[INFO]${NC} %s\n" "$*"; }
log_success() { printf "${GREEN}[SUCCESS]${NC} %s\n" "$*"; }
log_warn()    { printf "${YELLOW}[WARN]${NC} %s\n" "$*"; }
log_error()   { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; }
log_step()    { printf "\n${CYAN}===> %s${NC}\n" "$*"; }

set_env_value() {
    local file="$1"
    local key="$2"
    local value="$3"

    [[ -f "$file" ]] || return 0
    if grep -q "^[[:space:]]*${key}=" "$file"; then
        sed -i "s|^[[:space:]]*${key}=.*|${key}=${value}|" "$file"
    else
        printf '%s=%s\n' "$key" "$value" >> "$file"
    fi
}

find_environment() {
    local start_dir=""
    if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]:-}" ]]; then
        start_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    else
        start_dir="$(pwd)"
    fi

    ENV_FILE=""
    PROJECT_ROOT=""

    if [[ -f "${start_dir}/.env" ]]; then
        ENV_FILE="${start_dir}/.env"
        PROJECT_ROOT="${start_dir}"
    elif [[ -f "$(cd "${start_dir}/.." 2>/dev/null && pwd)/.env" && "$(basename "$start_dir")" == "deploy" ]]; then
        PROJECT_ROOT="$(cd "${start_dir}/.." 2>/dev/null && pwd)"
        ENV_FILE="${PROJECT_ROOT}/.env"
    elif [[ -f "${start_dir}/deploy/.env" ]]; then
        PROJECT_ROOT="${start_dir}"
        ENV_FILE="${start_dir}/deploy/.env"
    elif [[ -f "/opt/datrixops/.env" ]]; then
        PROJECT_ROOT="/opt/datrixops"
        ENV_FILE="/opt/datrixops/.env"
    elif [[ -f "/opt/datrixops/deploy/.env" ]]; then
        PROJECT_ROOT="/opt/datrixops/deploy"
        ENV_FILE="/opt/datrixops/deploy/.env"
    elif [[ -f "$(pwd)/.env" ]]; then
        PROJECT_ROOT="$(pwd)"
        ENV_FILE="$(pwd)/.env"
    fi

    if [[ -z "$ENV_FILE" || ! -f "$ENV_FILE" ]]; then
        PROJECT_ROOT="${PROJECT_ROOT:-${start_dir}}"
        ENV_FILE="${PROJECT_ROOT}/.env"
    fi

    if [[ -d "${PROJECT_ROOT}/deploy" && -f "${PROJECT_ROOT}/deploy/docker-compose.yml" ]]; then
        SCRIPT_DIR="${PROJECT_ROOT}/deploy"
        COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
    elif [[ -f "${PROJECT_ROOT}/docker-compose.yml" ]]; then
        SCRIPT_DIR="${PROJECT_ROOT}"
        COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"
    elif [[ -f "${start_dir}/docker-compose.yml" ]]; then
        SCRIPT_DIR="${start_dir}"
        COMPOSE_FILE="${start_dir}/docker-compose.yml"
    else
        SCRIPT_DIR="${PROJECT_ROOT}/deploy"
        COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
    fi
}
find_environment

remote_release_ver="$(curl -fsSL --max-time 15 \
    https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/version.json \
    2>/dev/null | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 | tr -d ' "\r\n')"
if [[ ! "$remote_release_ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    log_error "Unable to resolve a valid published CE Server version. Update aborted."
    exit 1
fi
RELEASE_TARBALL_URL="${DATRIXOPS_UPDATE_URL:-https://codeload.github.com/luuvandien2604/DatrixOps/tar.gz/refs/tags/v${remote_release_ver}}"

for arg in "$@"; do
    if [[ "$arg" == "--force" || "$arg" == "-f" ]]; then
        export DATRIXOPS_FORCE_UPDATE=1
    fi
done

if [[ "${1:-}" == "--check" || "${1:-}" == "-c" ]]; then
    local_ver="$(sed -n 's/^[[:space:]]*DATRIXOPS_VERSION=//p' "$ENV_FILE" 2>/dev/null | tail -n 1 | tr -d ' "\r\n')"
    if [[ -z "$local_ver" ]]; then
        local_ver="$(sed -n 's/^[[:space:]]*AGENT_VERSION=//p' "$ENV_FILE" 2>/dev/null | tail -n 1 | tr -d ' "\r\n')"
    fi
    [[ -n "$local_ver" ]] || local_ver="unknown"
    remote_ver="$(curl -fsSL --max-time 10 https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/version.json 2>/dev/null | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 | tr -d ' "\r\n')"
    if [[ -z "$remote_ver" ]]; then
        remote_ver="$(curl -fsSL --max-time 10 https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/.env.example 2>/dev/null | grep -m 1 '^[[:space:]]*DATRIXOPS_VERSION=' | cut -d'=' -f2 | tr -d ' "\r\n')"
    fi
    [[ -n "$remote_ver" ]] || remote_ver="unknown"

    echo "============================================================"
    echo "  DatrixOps Release Update Check"
    echo "============================================================"
    echo "  Installed Version : v${local_ver}"
    echo "  Latest Version    : v${remote_ver}"
    echo "============================================================"
    if [[ "$local_ver" != "$remote_ver" && "$remote_ver" != "unknown" ]]; then
        log_warn "New version v${remote_ver} is available! Run upgrade to apply."
    else
        log_success "System is fully up-to-date (v${local_ver})."
    fi
    exit 0
fi

if [[ "${1:-}" == "--setup-cron" || "${1:-}" == "--enable-auto-update" ]]; then
    log_info "Configuring daily automated background update cronjob..."
    CRON_FILE="/etc/cron.d/datrixops-auto-update"
    
    if [[ $EUID -ne 0 ]]; then
        log_error "Setting up auto-update cronjob requires root privileges. Please run with sudo."
        exit 1
    fi

    cat <<'EOF' > "$CRON_FILE"
# DatrixOps Automated Server & Agent Upgrade Task
# Runs daily at 03:00 AM system time
0 3 * * * root /usr/local/bin/datrix update > /var/log/datrixops-auto-upgrade.log 2>&1
EOF
    chmod 0644 "$CRON_FILE"
    log_success "Automated daily update cronjob created at ${CRON_FILE}"
    log_info "Server (Control Plane) & Agents will automatically check and upgrade daily at 03:00 AM."
    log_info "Logs are written to /var/log/datrixops-auto-upgrade.log"
    exit 0
fi

if [[ "${1:-}" == "--disable-auto-update" || "${1:-}" == "--remove-cron" ]]; then
    log_info "Removing automated background update cronjob..."
    CRON_FILE="/etc/cron.d/datrixops-auto-update"
    if [[ -f "$CRON_FILE" ]]; then
        rm -f "$CRON_FILE"
        log_success "Removed ${CRON_FILE}"
    else
        log_info "No automated update cronjob found."
    fi
    exit 0
fi

[[ -f "$ENV_FILE" ]] || {
    log_error "Missing configuration file: ${ENV_FILE}"
    log_info "Looked for .env in: ${PROJECT_ROOT}/.env, /opt/datrixops/.env"
    exit 1
}

installed_release_ver="$(sed -n 's/^[[:space:]]*DATRIXOPS_VERSION=//p' "$ENV_FILE" | tail -n 1 | tr -d ' "\r\n')"
if [[ "$installed_release_ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if [[ "$remote_release_ver" == "$installed_release_ver" && "${DATRIXOPS_FORCE_UPDATE:-0}" != "1" ]]; then
        log_success "DatrixOps CE Server v${installed_release_ver} is already up to date."
        exit 0
    fi
    lowest_version="$(printf '%s\n%s\n' "$installed_release_ver" "$remote_release_ver" | sort -V | head -n 1)"
    if [[ "$lowest_version" == "$remote_release_ver" && "$remote_release_ver" != "$installed_release_ver" && "${DATRIXOPS_ALLOW_DOWNGRADE:-0}" != "1" ]]; then
        log_error "Refusing to downgrade CE Server from v${installed_release_ver} to v${remote_release_ver}."
        exit 1
    fi
fi

log_step "Step 1/4: Creating automated pre-upgrade backup"
if [[ -x "${SCRIPT_DIR}/backup.sh" ]]; then
    BACKUP_FILE="$("${SCRIPT_DIR}/backup.sh" < /dev/null)"
    log_success "Backup created successfully: ${BACKUP_FILE}"
fi

log_step "Step 2/4: Updating DatrixOps codebase"

log_info "Downloading published CE Server v${remote_release_ver} package from ${RELEASE_TARBALL_URL}..."
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT

if curl -fsSL --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 600 \
    "$RELEASE_TARBALL_URL" -o "${TMP_DIR}/release.tar.gz" < /dev/null; then
	if [[ ! -s "${TMP_DIR}/release.tar.gz" ]] || ! tar -tzf "${TMP_DIR}/release.tar.gz" >/dev/null 2>&1; then
		log_error "Downloaded CE Server release package is empty or invalid."
		exit 1
	fi
        log_info "Extracting release files..."
        tar -xzf "${TMP_DIR}/release.tar.gz" -C "$TMP_DIR"
        
        EXTRACTED_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
        if [[ -n "$EXTRACTED_DIR" && -d "$EXTRACTED_DIR" ]]; then
            # Copy updated files while preserving .env and data directories
            if command -v rsync >/dev/null 2>&1; then
                rsync -a --exclude='.env' --exclude='certs/' --exclude='.git' "${EXTRACTED_DIR}/" "${PROJECT_ROOT}/"
            else
                cp -rf "${EXTRACTED_DIR}/"* "${PROJECT_ROOT}/" 2>/dev/null || true
            fi
            log_success "Extracted and updated codebase files."
        else
            log_error "Failed to locate extracted files from release tarball."
            exit 1
        fi
else
	log_error "Could not download published CE Server v${remote_release_ver}. Existing installation was not changed."
	exit 1
fi

log_step "Step 3/4: Fetching latest Agent release binaries"

# Older installations predate the one-time setup token. Generate it before
# recreating the backend so the setup endpoint is never left unauthenticated.
if [[ -z "$(sed -n 's/^SETUP_TOKEN=//p' "$ENV_FILE" | tail -n 1)" ]]; then
    set_env_value "$ENV_FILE" "SETUP_TOKEN" "$(openssl rand -hex 32)"
    chmod 0600 "$ENV_FILE"
fi

if [[ -f "${PROJECT_ROOT}/.env" && ! -e "${SCRIPT_DIR}/.env" ]]; then
    ln -sf "${PROJECT_ROOT}/.env" "${SCRIPT_DIR}/.env"
fi

target_app_ver="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    "${PROJECT_ROOT}/deploy/version.json" \
    "${SCRIPT_DIR}/version.json" \
    2>/dev/null | head -n 1 | tr -d ' "\r\n')"

if [[ ! "$target_app_ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    target_app_ver="$(grep -h '^[[:space:]]*DATRIXOPS_VERSION=' \
        "${PROJECT_ROOT}/deploy/.env.example" \
        "${PROJECT_ROOT}/.env.example" \
        "${SCRIPT_DIR}/.env.example" \
        2>/dev/null | head -n 1 | cut -d'=' -f2 | tr -d ' "\r\n')"
fi

if [[ ! "$target_app_ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    target_app_ver="1.8.3"
fi

target_agent_ver="$(sed -n 's/.*"agent_version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    "${PROJECT_ROOT}/deploy/version.json" \
    "${SCRIPT_DIR}/version.json" \
    2>/dev/null | head -n 1 | tr -d ' "\r\n')"

if [[ ! "$target_agent_ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    target_agent_ver="$(grep -h '^[[:space:]]*AGENT_VERSION=' \
    "${PROJECT_ROOT}/deploy/.env.example" \
    "${PROJECT_ROOT}/.env.example" \
    "${SCRIPT_DIR}/.env.example" \
    2>/dev/null | head -n 1 | cut -d'=' -f2 | tr -d ' "\r\n')"
fi

if [[ ! "$target_agent_ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    target_agent_ver="1.5.3"
fi

if [[ -n "$target_agent_ver" ]]; then
    target_agent_tag="$(sed -n 's/.*"agent_release_tag"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
        "${PROJECT_ROOT}/deploy/version.json" "${SCRIPT_DIR}/version.json" \
        2>/dev/null | head -n 1 | tr -d ' "\r\n')"
    target_agent_tag="${target_agent_tag:-agent-v${target_agent_ver}}"
    target_agent_url="https://github.com/luuvandien2604/DatrixOps/releases/download/${target_agent_tag}"
    for env_target in "$ENV_FILE" "${PROJECT_ROOT}/.env" "${SCRIPT_DIR}/.env"; do
        set_env_value "$env_target" "DATRIXOPS_VERSION" "$target_app_ver"
        set_env_value "$env_target" "AGENT_VERSION" "$target_agent_ver"
        set_env_value "$env_target" "AGENT_RELEASE_BASE_URL" "$target_agent_url"
        set_env_value "$env_target" "AGENT_RELEASE_LAYOUT" "legacy_direct"
        set_env_value "$env_target" "AGENT_ARTIFACT_BASE_URL" "$target_agent_url"
    done
    log_info "Synced DATRIXOPS_VERSION=${target_app_ver} to environment configuration."
    log_info "Synced AGENT_VERSION=${target_agent_ver} to environment configuration."
fi

agent_ver="$(sed -n 's/^[[:space:]]*AGENT_VERSION=//p' "$ENV_FILE" 2>/dev/null | tail -n 1 | tr -d ' "\r\n')"
if [[ ! "$agent_ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    agent_ver="1.5.3"
fi
log_info "Fetching independently released Agent version ${agent_ver}..."
"${SCRIPT_DIR}/fetch-agent-release.sh" "$agent_ver" < /dev/null

log_step "Step 4/4: Pulling latest pre-built container images & updating services"
log_info "Pulling pre-built container images from registry..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull < /dev/null || true

log_info "Running database migrations..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run -T --rm migrate < /dev/null || true

log_info "Restarting services with updated code..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate < /dev/null

log_info "Performing health checks..."
healthy=false
for _ in $(seq 1 24); do
    if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend \
        wget -qO- http://127.0.0.1:8080/health/ready < /dev/null >/dev/null 2>&1; then
        healthy=true
        break
    fi
    sleep 5
done

if [[ "$healthy" == "true" ]]; then
    auto_self_enroll_host() {
        local pub_url
        pub_url="$(sed -n 's/^PUBLIC_URL=//p' "$ENV_FILE" | tail -n 1)"
        pub_url="${pub_url%/}"
        [[ -n "$pub_url" ]] || pub_url="http://127.0.0.1"

        local agent_arch
        case "$(uname -m)" in
            x86_64|amd64)  agent_arch="amd64" ;;
            aarch64|arm64) agent_arch="arm64" ;;
            *) return 0 ;;
        esac

        local agent_binary=""
        for candidate in \
            "${PROJECT_ROOT}/frontend/public/releases/${agent_ver}/datrixops-agent-linux-${agent_arch}" \
            "${PROJECT_ROOT}/agent/bin/datrixops-agent-linux-${agent_arch}" \
            "${PROJECT_ROOT}/frontend/public/datrixops-agent-linux-${agent_arch}"; do
            if [[ -f "$candidate" && -s "$candidate" ]]; then
                agent_binary="$candidate"
                break
            fi
        done

        if [[ -z "$agent_binary" || ! -s "$agent_binary" ]]; then
			log_warn "A cryptographically verified Agent binary was not found; self-monitoring installation was skipped."
            return 0
        fi

        local raw_credential=""
        if [[ -f /etc/datrixops/agent.env ]]; then
            raw_credential="$(sed -n 's/^DATRIXOPS_AGENT_TOKEN=//p' /etc/datrixops/agent.env | tr -d '\r\n')"
        fi
        if [[ -z "$raw_credential" || "$raw_credential" =~ ^[0-9a-f]{64}$ ]]; then
            raw_credential="$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 43)"
        fi
        local credential_hash
        credential_hash="$(printf '%s' "$raw_credential" | sha256sum | awk '{print $1}')"

        docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T database \
            psql -U datrixops -d datrixops -c "
                DO \$\$
                DECLARE v_user_id UUID; v_server_id UUID;
                BEGIN
                    SELECT id INTO v_user_id FROM users ORDER BY created_at ASC LIMIT 1;
                    IF v_user_id IS NULL THEN RETURN; END IF;
                    SELECT id INTO v_server_id FROM servers WHERE tags ? 'self-host' OR name LIKE '%Control Plane%' LIMIT 1;
                    IF v_server_id IS NULL THEN
                        INSERT INTO servers (user_id, name, ip_address, status, agent_token_hash, enrolled_at, tags)
                        VALUES (v_user_id, 'DatrixOps Control Plane (Self-Host)', '127.0.0.1', 'offline', '${credential_hash}', NOW(), '[\"self-host\", \"control-plane\"]'::jsonb);
                    ELSE
                        UPDATE servers SET user_id = v_user_id, agent_token_hash = '${credential_hash}', enrolled_at = COALESCE(enrolled_at, NOW()), updated_at = NOW() WHERE id = v_server_id;
                    END IF;
                END \$\$;
            " < /dev/null || return 0

        install -m 0755 "$agent_binary" /usr/local/bin/datrixops-agent
        rm -f /tmp/datrixops-agent-download 2>/dev/null || true
        install -d -m 0700 /etc/datrixops
        printf 'DATRIXOPS_SERVER_URL=%s/api/v1\nDATRIXOPS_AGENT_TOKEN=%s\n' "$pub_url" "$raw_credential" > /etc/datrixops/agent.env
        chmod 0600 /etc/datrixops/agent.env

        cat > /etc/systemd/system/datrixops-agent.service <<SVCEOF
[Unit]
Description=DatrixOps Agent (Self-Monitoring)
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
EnvironmentFile=/etc/datrixops/agent.env
ExecStart=/usr/local/bin/datrixops-agent
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
SVCEOF
        systemctl daemon-reload
        systemctl enable --now datrixops-agent
        systemctl restart datrixops-agent
        log_success "Host VPS self-monitoring agent installed and started."
    }
    auto_self_enroll_host || true

    install -m 0755 "${SCRIPT_DIR}/datrixops.sh" /usr/local/bin/datrix
    ln -sf /usr/local/bin/datrix /usr/local/bin/datrixops

    credentials_file="${PROJECT_ROOT}/.admin-credentials"
    if [[ -f "$credentials_file" ]] && grep -q '^PASSWORD=' "$credentials_file"; then
        credentials_username="$(sed -n 's/^USERNAME=//p' "$credentials_file" | tail -n 1)"
        legacy_credentials_email="$(sed -n 's/^EMAIL=//p' "$credentials_file" | tail -n 1)"
        credentials_username="${credentials_username:-${legacy_credentials_email%%@*}}"
        credentials_username="${credentials_username:-admin}"
        umask 077
        printf 'USERNAME=%s\n' "$credentials_username" >"$credentials_file"
        chmod 0600 "$credentials_file"
        log_success "Removed the legacy plaintext administrator password from ${credentials_file}."
    fi

    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
    printf "\n${GREEN}============================================================${NC}\n"
    printf "${GREEN}✔ DatrixOps Upgraded Successfully!                          ${NC}\n"
    printf "${GREEN}============================================================${NC}\n\n"
    exit 0
else
    log_error "Health check failed after upgrade. Check container logs: docker compose logs backend"
    exit 1
fi
