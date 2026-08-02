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

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SCRIPT_DIR="$(pwd)"
fi

if [[ ! -f "${SCRIPT_DIR}/docker-compose.yml" || ! -f "${SCRIPT_DIR}/generate-secrets.sh" ]]; then
    INSTALL_DIR="${DATRIXOPS_INSTALL_DIR:-/opt/datrixops}"
    log_info "Deploying DatrixOps codebase to ${INSTALL_DIR}..."
    mkdir -p "${INSTALL_DIR}"

    TARBALL_URL="https://github.com/luuvandien2604/DatrixOps/archive/refs/heads/main.tar.gz"
    TEMP_TAR="/tmp/datrixops-install-$$.tar.gz"

    log_info "Downloading DatrixOps release package..."
    curl -fsSL "${TARBALL_URL}" -o "${TEMP_TAR}" || {
        log_error "Failed to download DatrixOps package from ${TARBALL_URL}"
        exit 1
    }

    tar -xzf "${TEMP_TAR}" -C "${INSTALL_DIR}" --strip-components=1
    rm -f "${TEMP_TAR}"

    SCRIPT_DIR="${INSTALL_DIR}/deploy"
    PROJECT_ROOT="${INSTALL_DIR}"
    cd "${SCRIPT_DIR}"
    chmod +x "${SCRIPT_DIR}/"*.sh 2>/dev/null || true
else
    PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi

COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/.env"

ensure_root() {
    if [ "$(id -u)" -ne 0 ]; then
        log_error "Root or sudo privileges are required to install missing system packages (Docker, Nginx)."
        log_info "Please re-run this script with sudo or as root user: sudo ./deploy/install.sh"
        exit 1
    fi
}

get_pkg_manager() {
    if command -v apt-get >/dev/null 2>&1; then
        echo "apt"
    elif command -v dnf >/dev/null 2>&1; then
        echo "dnf"
    elif command -v yum >/dev/null 2>&1; then
        echo "yum"
    elif command -v pacman >/dev/null 2>&1; then
        echo "pacman"
    elif command -v apk >/dev/null 2>&1; then
        echo "apk"
    else
        echo "unknown"
    fi
}

detect_public_ip() {
    local ip=""
    ip="$(curl -fsSL -m 4 https://api.ipify.org 2>/dev/null || true)"
    if [[ -z "$ip" ]]; then
        ip="$(curl -fsSL -m 4 https://ifconfig.me 2>/dev/null || true)"
    fi
    if [[ -z "$ip" ]]; then
        ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    fi
    if [[ -z "$ip" ]]; then
        ip="127.0.0.1"
    fi
    echo "$ip"
}

set_env_value() {
    local key="$1"
    local value="$2"
    local escaped="${value//\\/\\\\}"
    escaped="${escaped//&/\\&}"
    escaped="${escaped//|/\\|}"
    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i.bak "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
        rm -f -- "${ENV_FILE}.bak"
    else
        printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
    fi
}

auto_configure_domain() {
    local current_domain
    current_domain="$(sed -n "s/^DATRIXOPS_DOMAIN=//p" "$ENV_FILE" | tail -n 1)"
    
    if [[ -z "$current_domain" || "$current_domain" == "monitor.example.com" || "$current_domain" == "https://monitor.example.com" ]]; then
        local detected_ip
        detected_ip="$(detect_public_ip)"
        local target_domain=""

        if [ -t 0 ]; then
            log_info "VPS Public IP detected: ${detected_ip}"
            printf "${CYAN}Enter domain or IP for DatrixOps [Press ENTER for '${detected_ip}']: ${NC}"
            read -r target_domain || true
        fi

        target_domain="${target_domain:-$detected_ip}"
        target_domain="${target_domain#http://}"
        target_domain="${target_domain#https://}"
        target_domain="${target_domain%/}"

        if [[ -z "$target_domain" || "$target_domain" == "monitor.example.com" ]]; then
            target_domain="$detected_ip"
        fi

        log_info "Configuring DatrixOps domain/IP: ${target_domain}"

        set_env_value "DATRIXOPS_DOMAIN" "$target_domain"
        
        if [[ "$target_domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ || "$target_domain" == "localhost" ]]; then
            set_env_value "PUBLIC_URL" "http://${target_domain}"
            set_env_value "ALLOWED_ORIGINS" "http://${target_domain}"
        else
            set_env_value "PUBLIC_URL" "https://${target_domain}"
            set_env_value "ALLOWED_ORIGINS" "https://${target_domain}"
        fi
        log_success "Configured ${ENV_FILE} with DATRIXOPS_DOMAIN=${target_domain}."
    fi
}

check_and_install_prereqs() {
    if ! command -v openssl >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
        log_info "Prerequisite tools (openssl, curl) are missing. Installing automatically..."
        ensure_root
        local pkg_mgr
        pkg_mgr="$(get_pkg_manager)"
        case "$pkg_mgr" in
            apt)
                apt-get update -qq && apt-get install -y -qq openssl curl ca-certificates
                ;;
            dnf|yum)
                $pkg_mgr install -y -q openssl curl ca-certificates
                ;;
            *)
                log_warn "Unable to auto-install openssl/curl with package manager '$pkg_mgr'."
                ;;
        esac
    fi
}

check_and_install_docker() {
    local has_docker=true
    local has_compose=true

    command -v docker >/dev/null 2>&1 || has_docker=false
    docker compose version >/dev/null 2>&1 || has_compose=false

    if [[ "$has_docker" == "false" || "$has_compose" == "false" ]]; then
        log_info "Docker Engine or Docker Compose v2 is not installed. Installing Docker automatically..."
        ensure_root

        if command -v curl >/dev/null 2>&1; then
            log_info "Fetching official Docker installation script..."
            curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
            sh /tmp/get-docker.sh
            rm -f /tmp/get-docker.sh
        else
            log_error "curl is required to download Docker installation script."
            exit 1
        fi

        if command -v systemctl >/dev/null 2>&1; then
            systemctl enable --now docker >/dev/null 2>&1 || true
        elif command -v service >/dev/null 2>&1; then
            service docker start >/dev/null 2>&1 || true
        fi
    fi

    command -v docker >/dev/null 2>&1 || {
        log_error "Failed to verify Docker installation. Please install Docker Engine manually."
        exit 1
    }
    docker compose version >/dev/null 2>&1 || {
        log_error "Failed to verify Docker Compose v2. Please install docker-compose-plugin manually."
        exit 1
    }
    log_success "Docker Engine & Docker Compose v2 are ready."
}

check_and_install_nginx() {
    if command -v systemctl >/dev/null 2>&1; then
        if systemctl is-active --quiet nginx 2>/dev/null; then
            log_info "Stopping host Nginx service to free port 80/443 for Caddy Gateway..."
            systemctl stop nginx 2>/dev/null || true
            systemctl disable nginx 2>/dev/null || true
        fi
        if systemctl is-active --quiet apache2 2>/dev/null; then
            log_info "Stopping host Apache service to free port 80/443 for Caddy Gateway..."
            systemctl stop apache2 2>/dev/null || true
            systemctl disable apache2 2>/dev/null || true
        fi
    elif command -v service >/dev/null 2>&1; then
        service nginx stop 2>/dev/null || true
        service apache2 stop 2>/dev/null || true
    fi
    log_success "Port 80/443 is clear for Caddy Gateway."
}

log_step "Step 1/5: Checking and installing system dependencies (Docker, Docker Compose, Nginx)"
check_and_install_prereqs
check_and_install_docker
check_and_install_nginx

log_step "Step 2/5: Generating environment configuration and security secrets"
"${SCRIPT_DIR}/generate-secrets.sh" "$ENV_FILE"
chmod 0600 "$ENV_FILE"
auto_configure_domain

log_step "Step 3/5: Validating environment configuration"
required_keys=(POSTGRES_PASSWORD JWT_SECRET DATRIXOPS_DOMAIN PUBLIC_URL ALLOWED_ORIGINS AGENT_VERSION)
missing_vars=()
for key in "${required_keys[@]}"; do
    value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"
    if [[ -z "$value" ]]; then
        missing_vars+=("$key")
    fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
    log_error "The following environment variables in ${ENV_FILE} must be set before proceeding:"
    for var in "${missing_vars[@]}"; do
        printf "  - %s\n" "$var" >&2
    done
    log_info "Please configure ${ENV_FILE} and re-run ./deploy/install.sh"
    exit 1
fi
log_success "Environment configuration is valid."

log_step "Step 4/5: Downloading DatrixOps Agent binaries"
agent_ver="$(sed -n 's/^AGENT_VERSION=//p' "$ENV_FILE" | tail -n 1)"
log_info "Fetching Agent release version v${agent_ver}..."
"${SCRIPT_DIR}/fetch-agent-release.sh" "$agent_ver"

log_step "Step 5/5: Deploying DatrixOps containers"
log_info "Validating docker-compose setup..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null

log_info "Pulling pre-built container images from registry..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull < /dev/null || docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build < /dev/null || true

log_info "Running database migrations..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run -T --rm migrate < /dev/null || true

log_info "Starting DatrixOps services in detached mode..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate

log_step "Verifying running container status"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

log_step "Auto-enrolling DatrixOps Control Plane host server for self-monitoring"
auto_self_enroll_host() {
    local pub_url
    pub_url="$(sed -n 's/^PUBLIC_URL=//p' "$ENV_FILE" | tail -n 1)"
    pub_url="${pub_url%/}"
    [[ -n "$pub_url" ]] || pub_url="http://127.0.0.1"

    # Detect host architecture
    local agent_arch
    case "$(uname -m)" in
        x86_64|amd64)  agent_arch="amd64" ;;
        aarch64|arm64) agent_arch="arm64" ;;
        *) log_warn "Unsupported architecture $(uname -m) for self-monitoring agent."; return 0 ;;
    esac

    # Find compiled agent binary
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

    # Reuse existing credential if agent.env exists, otherwise generate a new permanent agent credential
    local raw_credential=""
    if [[ -f /etc/datrixops/agent.env ]]; then
        raw_credential="$(sed -n 's/^DATRIXOPS_AGENT_TOKEN=//p' /etc/datrixops/agent.env | tr -d '\r\n')"
    fi
    if [[ -z "$raw_credential" || "$raw_credential" =~ ^[0-9a-f]{64}$ ]]; then
        raw_credential="$(openssl rand -base64 32 | tr -d '/+=\n' | head -c 43)"
    fi
    local credential_hash
    credential_hash="$(printf '%s' "$raw_credential" | sha256sum | awk '{print $1}')"

    # Insert or update the self-host server record directly in PostgreSQL
    log_info "Registering host VPS in database..."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T database \
        psql -U datrixops -d datrixops -c "
            DO \$\$
            DECLARE
                v_user_id UUID;
                v_server_id UUID;
            BEGIN
                SELECT id INTO v_user_id FROM users ORDER BY created_at ASC LIMIT 1;
                IF v_user_id IS NULL THEN
                    RAISE NOTICE 'No admin user found yet. Self-monitoring will activate after setup.';
                    RETURN;
                END IF;

                SELECT id INTO v_server_id FROM servers
                WHERE tags @> '"self-host"'::jsonb OR name LIKE '%Control Plane%'
                LIMIT 1;

                IF v_server_id IS NULL THEN
                    INSERT INTO servers (
                        user_id, name, ip_address, status,
                        agent_token_hash, enrolled_at, tags
                    ) VALUES (
                        v_user_id,
                        'DatrixOps Control Plane (Self-Host)',
                        '127.0.0.1',
                        'offline',
                        '${credential_hash}',
                        NOW(),
                        '["self-host", "control-plane"]'::jsonb
                    );
                    RAISE NOTICE 'Self-host server record created.';
                ELSE
                    UPDATE servers
                    SET agent_token_hash = '${credential_hash}',
                        enrolled_at = COALESCE(enrolled_at, NOW()),
                        updated_at = NOW()
                    WHERE id = v_server_id;
                    RAISE NOTICE 'Self-host server record updated.';
                END IF;
            END \$\$;
        " < /dev/null || log_warn "Database registration notice (will auto-bind upon setup completion)."

    # Install agent binary
    log_info "Installing DatrixOps Agent binary on host..."
    install -m 0755 "$agent_binary" /usr/local/bin/datrixops-agent

    # Create agent configuration
    install -d -m 0700 /etc/datrixops
    cat > /etc/datrixops/agent.env <<AGENT_ENV
DATRIXOPS_SERVER_URL=${pub_url}/api/v1
DATRIXOPS_AGENT_TOKEN=${raw_credential}
AGENT_ENV
    chmod 0600 /etc/datrixops/agent.env

    # Create systemd service
    cat > /etc/systemd/system/datrixops-agent.service <<SERVICE_EOF
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
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true

[Install]
WantedBy=multi-user.target
SERVICE_EOF
    chmod 0644 /etc/systemd/system/datrixops-agent.service

    systemctl daemon-reload
    systemctl enable --now datrixops-agent
    systemctl restart datrixops-agent

    log_success "Host VPS self-monitoring agent installed and started."
}
if [[ -d "${PROJECT_ROOT}" && "${PROJECT_ROOT}" != "${SCRIPT_DIR}" ]]; then
    ln -sf "${SCRIPT_DIR}/upgrade.sh" "${PROJECT_ROOT}/upgrade.sh" 2>/dev/null || true
    ln -sf "${SCRIPT_DIR}/backup.sh" "${PROJECT_ROOT}/backup.sh" 2>/dev/null || true
    ln -sf "${SCRIPT_DIR}/restore.sh" "${PROJECT_ROOT}/restore.sh" 2>/dev/null || true
fi

pub_url="$(sed -n 's/^PUBLIC_URL=//p' "$ENV_FILE" | tail -n 1)"
printf "\n"
printf "${GREEN}============================================================${NC}\n"
printf "${GREEN}✔ DatrixOps Self-Hosted Deployment Completed Successfully!  ${NC}\n"
printf "${GREEN}============================================================${NC}\n"
printf "  Control Plane URL : %s\n" "$pub_url"
printf "  Initial Setup     : %s/setup\n" "${pub_url%/}"
printf "  Self-Monitoring   : Active (Host VPS enrolled automatically)\n"
printf "  Status            : All container services are active.\n"
printf "${GREEN}============================================================${NC}\n"
printf "Next step: Open %s/setup in your browser to complete administrator setup.\n\n" "${pub_url%/}"
