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

    # Determine PROJECT_ROOT and SCRIPT_DIR
    if [[ "$(basename "$start_dir")" == "deploy" ]]; then
        PROJECT_ROOT="$(cd "${start_dir}/.." && pwd)"
        SCRIPT_DIR="${start_dir}"
    elif [[ -d "${start_dir}/deploy" && -f "${start_dir}/deploy/docker-compose.yml" ]]; then
        PROJECT_ROOT="${start_dir}"
        SCRIPT_DIR="${start_dir}/deploy"
    elif [[ -f "/opt/datrixops/deploy/docker-compose.yml" ]]; then
        PROJECT_ROOT="/opt/datrixops"
        SCRIPT_DIR="/opt/datrixops/deploy"
    else
        PROJECT_ROOT="${start_dir}"
        SCRIPT_DIR="${start_dir}"
    fi

    # Resolve ENV_FILE
    if [[ -f "${PROJECT_ROOT}/.env" ]]; then
        ENV_FILE="${PROJECT_ROOT}/.env"
    elif [[ -f "${SCRIPT_DIR}/.env" ]]; then
        ENV_FILE="${SCRIPT_DIR}/.env"
    elif [[ -f "/opt/datrixops/.env" ]]; then
        ENV_FILE="/opt/datrixops/.env"
    else
        ENV_FILE="${PROJECT_ROOT}/.env"
    fi

    # Prefer deploy/docker-compose.yml (pre-built GHCR image compose)
    if [[ -f "${SCRIPT_DIR}/docker-compose.yml" ]]; then
        COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
    elif [[ -f "${PROJECT_ROOT}/deploy/docker-compose.yml" ]]; then
        SCRIPT_DIR="${PROJECT_ROOT}/deploy"
        COMPOSE_FILE="${PROJECT_ROOT}/deploy/docker-compose.yml"
    elif [[ -f "${PROJECT_ROOT}/docker-compose.yml" ]]; then
        COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"
    else
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

auto_self_enroll_host() {
    local pub_url
    pub_url="$(sed -n 's/^PUBLIC_URL=//p' "$ENV_FILE" | tail -n 1)"
    pub_url="${pub_url%/}"
    [[ -n "$pub_url" ]] || pub_url="http://127.0.0.1"

    # Extract domain from pub_url and ensure loopback entry in /etc/hosts
    local pub_host
    pub_host="$(printf '%s' "$pub_url" | sed -e 's#^https\?://##' -e 's#/.*##' -e 's#:[0-9]*##')"
    if [[ -n "$pub_host" && "$pub_host" != "localhost" && "$pub_host" != "127.0.0.1" ]]; then
        if ! grep -qE "^[[:space:]]*127\.0\.0\.1[[:space:]]+.*\\b${pub_host}\\b" /etc/hosts 2>/dev/null; then
            printf '127.0.0.1 %s\n' "$pub_host" >> /etc/hosts 2>/dev/null || true
            log_info "Configured loopback entry 127.0.0.1 ${pub_host} in /etc/hosts."
        fi
    fi

    local agent_arch
    case "$(uname -m)" in
        x86_64|amd64)  agent_arch="amd64" ;;
        aarch64|arm64) agent_arch="arm64" ;;
        *) return 0 ;;
    esac

    local agent_ver
    agent_ver="$(sed -n 's/^[[:space:]]*AGENT_VERSION=//p' "$ENV_FILE" 2>/dev/null | tail -n 1 | tr -d ' "\r\n')"
    if [[ ! "$agent_ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
        agent_ver="1.5.16"
    fi

    local agent_binary=""
    for candidate in \
        "/usr/local/bin/datrixops-self-monitor" \
        "${PROJECT_ROOT}/frontend/public/releases/${agent_ver}/datrixops-agent-linux-${agent_arch}" \
        "${PROJECT_ROOT}/frontend/public/releases/"*/datrixops-agent-linux-"${agent_arch}" \
        "${PROJECT_ROOT}/agent/bin/datrixops-agent-linux-${agent_arch}" \
        "${PROJECT_ROOT}/frontend/public/datrixops-agent-linux-${agent_arch}" \
        "/usr/local/bin/datrixops-agent"; do
        if [[ -f "$candidate" && -s "$candidate" ]]; then
            agent_binary="$candidate"
            break
        fi
    done

    if [[ -z "$agent_binary" || ! -s "$agent_binary" ]]; then
        for dl_ver in "$agent_ver" "1.5.16" "1.5.14" "1.5.12"; do
            for dl_tag in "agent-v${dl_ver}" "v${dl_ver}"; do
                local download_url="https://github.com/luuvandien2604/DatrixOps/releases/download/${dl_tag}/datrixops-agent-linux-${agent_arch}"
                log_info "Attempting to load Agent binary from ${download_url}..."
                if curl -fsSL --retry 2 --connect-timeout 5 --max-time 90 "$download_url" -o /tmp/datrixops-agent-download 2>/dev/null && [[ -s /tmp/datrixops-agent-download ]]; then
                    agent_binary="/tmp/datrixops-agent-download"
                    break 2
                fi
            done
        done
    fi

    if [[ -z "$agent_binary" || ! -s "$agent_binary" ]]; then
        log_warn "A verified Agent binary could not be loaded; host self-monitoring was skipped."
        return 0
    fi

    if [[ "$agent_binary" != "/usr/local/bin/datrixops-self-monitor" ]]; then
        install -m 0755 "$agent_binary" /usr/local/bin/datrixops-self-monitor
    fi
    rm -f /tmp/datrixops-agent-download 2>/dev/null || true
    chmod 0755 /usr/local/bin/datrixops-self-monitor

    local raw_credential=""
    if [[ -f /etc/datrixops/self-monitor.env ]]; then
        raw_credential="$(sed -n 's/^DATRIXOPS_AGENT_TOKEN=//p' /etc/datrixops/self-monitor.env | tr -d '\r\n')"
    fi
    if [[ -z "$raw_credential" || "$raw_credential" =~ ^[0-9a-f]{64}$ ]]; then
        raw_credential="$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 43)"
    fi
    local credential_hash
    credential_hash="$(printf '%s' "$raw_credential" | sha256sum | awk '{print $1}')"

    install -d -m 0755 /etc/datrixops
    chmod 0755 /etc/datrixops
    printf 'DATRIXOPS_SERVER_URL=%s/api/v1\nDATRIXOPS_AGENT_TOKEN=%s\n' "$pub_url" "$raw_credential" > /etc/datrixops/self-monitor.env
    chmod 0644 /etc/datrixops/self-monitor.env

    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T database \
        psql -U datrixops -d datrixops -c "
            DO \$\$
            DECLARE v_user_id UUID; v_server_id UUID;
            BEGIN
                SELECT id INTO v_user_id FROM users ORDER BY created_at ASC LIMIT 1;
                IF v_user_id IS NULL THEN RETURN; END IF;
                SELECT id INTO v_server_id FROM servers 
            WHERE agent_token_hash = '${credential_hash}'
               OR tags ? 'self-host' 
               OR tags ? 'control-plane' 
               OR name ILIKE '%DatrixOps%' 
               OR name ILIKE '%Control Plane%' 
            ORDER BY 
               CASE WHEN agent_token_hash = '${credential_hash}' THEN 0
                    WHEN status = 'online' THEN 1
                    ELSE 2 END,
               last_seen_at DESC NULLS LAST,
               created_at ASC
            LIMIT 1;
            IF v_server_id IS NULL THEN
                INSERT INTO servers (user_id, name, ip_address, status, agent_token_hash, enrolled_at, tags)
                VALUES (v_user_id, 'Control Plane', '127.0.0.1', 'offline', '${credential_hash}', NOW(), '[\"self-host\", \"control-plane\"]'::jsonb);
            ELSE
                UPDATE servers 
                SET user_id = v_user_id, 
                    name = COALESCE(NULLIF(name, ''), 'Control Plane'), 
                    tags = CASE 
                        WHEN tags IS NULL OR tags = '[]'::jsonb THEN '[\"self-host\", \"control-plane\"]'::jsonb
                        WHEN NOT (tags ? 'self-host') AND NOT (tags ? 'control-plane') THEN tags || '[\"self-host\", \"control-plane\"]'::jsonb
                        ELSE tags 
                    END, 
                    agent_token_hash = '${credential_hash}', 
                    enrolled_at = COALESCE(enrolled_at, NOW()), 
                    updated_at = NOW() 
                WHERE id = v_server_id;

                DELETE FROM servers
                WHERE id != v_server_id
                  AND (
                      tags ? 'self-host'
                      OR tags ? 'control-plane'
                      OR name ILIKE '%DatrixOps%'
                      OR name ILIKE '%Control Plane%'
                  )
                  AND status = 'offline';
            END IF;

            UPDATE server_tasks
            SET status = 'cancelled', result = '{\"output\": \"Cleared during self-monitor setup\"}'::jsonb, completed_at = NOW(), updated_at = NOW()
            WHERE status IN ('pending', 'processing') AND (server_id = v_server_id OR created_at < NOW() - INTERVAL '5 minutes');
            END \$\$;
        " < /dev/null || log_warn "Database pre-registration notice (will auto-bind via backend sync)."

    cat > /etc/systemd/system/datrixops-self-monitor.service <<SVCEOF
[Unit]
Description=DatrixOps Self Monitor
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
EnvironmentFile=/etc/datrixops/self-monitor.env
ExecStart=/usr/local/bin/datrixops-self-monitor
Restart=always
RestartSec=10
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
SVCEOF
    systemctl daemon-reload
    systemctl enable --now datrixops-self-monitor
    systemctl restart datrixops-self-monitor
    if systemctl is-active --quiet datrixops-self-monitor 2>/dev/null; then
        log_success "Host VPS self-monitoring service (datrixops-self-monitor) updated and active."
    else
        log_warn "Host VPS self-monitoring service started; verify with: datrix status"
    fi
}

installed_release_ver="$(sed -n 's/^[[:space:]]*DATRIXOPS_VERSION=//p' "$ENV_FILE" | tail -n 1 | tr -d ' "\r\n')"
if [[ "$installed_release_ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    if [[ "$remote_release_ver" == "$installed_release_ver" && "${DATRIXOPS_FORCE_UPDATE:-0}" != "1" ]]; then
        log_success "DatrixOps CE Server v${installed_release_ver} is already up to date."
        log_info "Verifying and synchronizing Host VPS Self-Monitoring service..."
        auto_self_enroll_host || true
        install -m 0755 "${SCRIPT_DIR}/datrixops.sh" /usr/local/bin/datrix 2>/dev/null || true
        ln -sf /usr/local/bin/datrix /usr/local/bin/datrixops 2>/dev/null || true
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
    target_app_ver="1.8.31"
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
        for feature_key in "ENABLE_READ_ONLY_LOGS" "ENABLE_SERVICE_CONTROLS" "ENABLE_WEB_TERMINAL" "ENABLE_REMOTE_SCRIPTS"; do
            current_feat_val="$(sed -n "s/^[[:space:]]*${feature_key}=//p" "$env_target" 2>/dev/null | tail -n 1 | tr -d ' "\r\n')"
            if [[ -z "$current_feat_val" || "$current_feat_val" == "false" ]]; then
                set_env_value "$env_target" "$feature_key" "true"
            fi
        done
    done
    log_info "Synced DATRIXOPS_VERSION=${target_app_ver} to environment configuration."
    log_info "Synced AGENT_VERSION=${target_agent_ver} to environment configuration."
    log_info "Enabled Log Explorer, Web Terminal, Remote Scripts, and Service Controls in configuration."
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

log_info "Applying updated container services..."
if [[ "${DATRIXOPS_FORCE_UPDATE:-0}" == "1" ]]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate < /dev/null
else
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d < /dev/null
fi

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
