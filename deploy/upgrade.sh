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

RELEASE_TARBALL_URL="${DATRIXOPS_UPDATE_URL:-https://github.com/luuvandien2604/DatrixOps/archive/refs/heads/main.tar.gz}"

[[ -f "$ENV_FILE" ]] || {
    log_error "Missing configuration file: ${ENV_FILE}"
    log_info "Looked for .env in: ${PROJECT_ROOT}/.env, /opt/datrixops/.env"
    exit 1
}

log_step "Step 1/4: Creating automated pre-upgrade backup"
if [[ -x "${SCRIPT_DIR}/backup.sh" ]]; then
    BACKUP_FILE="$("${SCRIPT_DIR}/backup.sh" < /dev/null)"
    log_success "Backup created successfully: ${BACKUP_FILE}"
fi

log_step "Step 2/4: Updating DatrixOps codebase"

use_git=false
if command -v git >/dev/null 2>&1 && [[ -d "${PROJECT_ROOT}/.git" ]]; then
    log_info "Attempting update via Git repository..."
    if git -C "$PROJECT_ROOT" pull --ff-only < /dev/null 2>/dev/null; then
        use_git=true
        log_success "Updated codebase via Git."
    else
        log_warn "Git pull failed or SSH key not configured. Falling back to direct HTTPS release tarball download..."
    fi
fi

if [[ "$use_git" == "false" ]]; then
    log_info "Downloading latest release package from ${RELEASE_TARBALL_URL}..."
    TMP_DIR="$(mktemp -d)"
    trap 'rm -rf -- "$TMP_DIR"' EXIT

    if curl -fsSL "$RELEASE_TARBALL_URL" -o "${TMP_DIR}/release.tar.gz" < /dev/null; then
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
        log_warn "Could not download raw source tarball (repository is Private)."
        log_info "Proceeding with pre-built container update from GitHub Container Registry (GHCR)..."
    fi
fi

log_step "Step 3/4: Fetching latest Agent release binaries"
agent_ver="$(sed -n 's/^AGENT_VERSION=//p' "$ENV_FILE" | tail -n 1)"
log_info "Fetching Agent version v${agent_ver}..."
"${SCRIPT_DIR}/fetch-agent-release.sh" "$agent_ver" < /dev/null

log_step "Step 4/4: Pulling latest pre-built container images & updating services"
log_info "Pulling pre-built container images from registry..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull < /dev/null || docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build < /dev/null || true

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
            "${PROJECT_ROOT}/frontend/public/datrixops-agent-linux-${agent_arch}" \
            "${PROJECT_ROOT}/frontend/public/releases"/*/datrixops-agent-linux-"${agent_arch}" \
            "/usr/local/bin/datrixops-agent"; do
            if [[ -f "$candidate" && -s "$candidate" ]]; then
                agent_binary="$candidate"
                break
            fi
        done

        if [[ -z "$agent_binary" ]]; then
            log_info "Downloading Agent binary for self-host monitoring..."
            local tmp_bin="/tmp/datrixops-agent-download"
            if curl -fsSL "https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/frontend/public/datrixops-agent-linux-${agent_arch}" -o "$tmp_bin" 2>/dev/null && [[ -s "$tmp_bin" ]]; then
                agent_binary="$tmp_bin"
            elif curl -fsSL "https://raw.githubusercontent.com/luuvandien2604/datrixops-agent/main/bin/datrixops-agent-linux-${agent_arch}" -o "$tmp_bin" 2>/dev/null && [[ -s "$tmp_bin" ]]; then
                agent_binary="$tmp_bin"
            elif curl -fsSL "https://github.com/luuvandien2604/datrixops-agent/releases/latest/download/datrixops-agent-linux-${agent_arch}" -o "$tmp_bin" 2>/dev/null && [[ -s "$tmp_bin" ]]; then
                agent_binary="$tmp_bin"
            fi
        fi

        if [[ -z "$agent_binary" || ! -s "$agent_binary" ]]; then
            log_warn "DatrixOps Agent binary could not be found or downloaded for self-monitoring."
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
                    SELECT id INTO v_server_id FROM servers WHERE tags @> '\"self-host\"'::jsonb OR name LIKE '%Control Plane%' LIMIT 1;
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

    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
    printf "\n${GREEN}============================================================${NC}\n"
    printf "${GREEN}✔ DatrixOps Upgraded Successfully!                          ${NC}\n"
    printf "${GREEN}============================================================${NC}\n\n"
    exit 0
else
    log_error "Health check failed after upgrade. Check container logs: docker compose logs backend"
    exit 1
fi
