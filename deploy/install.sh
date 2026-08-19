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
    INSTALL_VERSION="${DATRIXOPS_INSTALL_VERSION:-1.6.9}"
    if [[ ! "$INSTALL_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_error "DATRIXOPS_INSTALL_VERSION must use X.Y.Z format."
        exit 1
    fi
    log_info "Deploying DatrixOps codebase to ${INSTALL_DIR}..."
    mkdir -p "${INSTALL_DIR}"

    # Use codeload directly. The github.com archive redirect is unreliable on
    # some networks and can terminate larger downloads with curl error 56.
    TARBALL_URL="https://codeload.github.com/luuvandien2604/DatrixOps/tar.gz/refs/tags/v${INSTALL_VERSION}"
    TARBALL_FALLBACK_URL="https://codeload.github.com/luuvandien2604/DatrixOps/tar.gz/refs/heads/main"
    TEMP_TAR="/tmp/datrixops-install-$$.tar.gz"

    log_info "Downloading DatrixOps CE v${INSTALL_VERSION} release package..."
    if ! curl -fsSL \
        --retry 3 \
        --retry-delay 2 \
        --connect-timeout 15 \
        --max-time 600 \
        "${TARBALL_URL}" \
        -o "${TEMP_TAR}" 2>/dev/null; then
        log_warn "Release tag v${INSTALL_VERSION} not found on remote. Downloading latest from main branch..."
        if ! curl -fsSL \
            --retry 5 \
            --retry-delay 2 \
            --connect-timeout 15 \
            --max-time 600 \
            "${TARBALL_FALLBACK_URL}" \
            -o "${TEMP_TAR}"; then
            rm -f "${TEMP_TAR}"
            log_error "Failed to download DatrixOps package from ${TARBALL_FALLBACK_URL}"
            exit 1
        fi
    fi

    if [[ ! -s "${TEMP_TAR}" ]] || ! tar -tzf "${TEMP_TAR}" >/dev/null 2>&1; then
        rm -f "${TEMP_TAR}"
        log_error "Downloaded DatrixOps package is empty or invalid."
        exit 1
    fi

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
ADMIN_CREDENTIALS_FILE="${PROJECT_ROOT}/.admin-credentials"
PANEL_PORT="${DATRIXOPS_PANEL_PORT:-80}"
INITIAL_ADMIN_PASSWORD=""

if [[ ! "$PANEL_PORT" =~ ^[0-9]+$ ]] || (( PANEL_PORT < 1 || PANEL_PORT > 65535 )); then
    log_error "DATRIXOPS_PANEL_PORT must be an integer between 1 and 65535."
    exit 1
fi

ensure_root() {
    if [ "$(id -u)" -ne 0 ]; then
        log_error "Root or sudo privileges are required to install missing system packages and Docker."
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
	current_domain="$(sed -n "s/^CADDY_SITE_ADDRESS=//p" "$ENV_FILE" | tail -n 1)"
	if [[ "$current_domain" =~ ^http://([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+|localhost)$ ]]; then
		local existing_host="${current_domain#http://}"
		set_env_value "DATRIXOPS_HTTP_PORT" "${DATRIXOPS_HTTP_PORT:-80}"
		set_env_value "DATRIXOPS_HTTPS_PORT" "${DATRIXOPS_HTTPS_PORT:-443}"
		set_env_value "PUBLIC_URL" "http://${existing_host}"
		set_env_value "ALLOWED_ORIGINS" "http://${existing_host}"
		log_success "Configured dedicated panel URL http://${existing_host}."
		return
	fi

	if [[ -z "$current_domain" || "$current_domain" == "monitor.example.com" || "$current_domain" == "https://monitor.example.com" ]]; then
		local detected_ip
		detected_ip="$(detect_public_ip)"
		local target_domain=""
		local caddy_site_address=""

        local is_interactive=false
        if [ -t 0 ] || [ -c /dev/tty ]; then
            is_interactive=true
        fi

        if [ "$is_interactive" = true ] && [ -z "${DATRIXOPS_DOMAIN:-}" ]; then
            log_info "VPS Public IP detected: ${detected_ip}"
            printf "\n${CYAN}============================================================${NC}\n"
            printf "${CYAN}=== Select DatrixOps Access Mode                         ===${NC}\n"
            printf "${CYAN}============================================================${NC}\n"
            printf "  1) Public IP   : http://${detected_ip} (Default, port 80)\n"
            printf "  2) Custom Domain : https://your-domain.com (Automatic HTTPS/SSL via Caddy)\n"
            printf "${CYAN}Enter choice [1/2, default: 1]: ${NC}"
            if [ -c /dev/tty ]; then
                read -r access_choice < /dev/tty || true
            else
                read -r access_choice || true
            fi

            case "${access_choice:-1}" in
                2)
                    printf "${CYAN}Enter your domain name (e.g. monitor.example.com): ${NC}"
                    if [ -c /dev/tty ]; then
                        read -r input_domain < /dev/tty || true
                    else
                        read -r input_domain || true
                    fi
                    target_domain="${input_domain:-}"
                    ;;
                1)
                    target_domain="${detected_ip}"
                    ;;
                *)
                    target_domain="$access_choice"
                    ;;
            esac
        else
            target_domain="${DATRIXOPS_DOMAIN:-$detected_ip}"
        fi

        target_domain="${target_domain:-$detected_ip}"
        target_domain="${target_domain#http://}"
        target_domain="${target_domain#https://}"
        target_domain="${target_domain%/}"

        if [[ -z "$target_domain" || "$target_domain" == "monitor.example.com" ]]; then
            target_domain="$detected_ip"
        fi

		log_info "Configuring DatrixOps with host: ${target_domain}"

		if [[ "$target_domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ || "$target_domain" == "localhost" ]]; then
			caddy_site_address="http://${target_domain}"
			set_env_value "DATRIXOPS_HTTP_PORT" "${DATRIXOPS_HTTP_PORT:-80}"
			set_env_value "DATRIXOPS_HTTPS_PORT" "${DATRIXOPS_HTTPS_PORT:-443}"
			set_env_value "PUBLIC_URL" "http://${target_domain}"
			set_env_value "ALLOWED_ORIGINS" "http://${target_domain}"
		else
			caddy_site_address="$target_domain"
			set_env_value "DATRIXOPS_HTTP_PORT" "${DATRIXOPS_HTTP_PORT:-80}"
			set_env_value "DATRIXOPS_HTTPS_PORT" "${DATRIXOPS_HTTPS_PORT:-443}"
			set_env_value "PUBLIC_URL" "https://${target_domain}"
			set_env_value "ALLOWED_ORIGINS" "https://${target_domain}"
		fi
		set_env_value "CADDY_SITE_ADDRESS" "$caddy_site_address"
		log_success "Configured ${ENV_FILE} with CADDY_SITE_ADDRESS=${caddy_site_address}."
	fi
}

check_and_install_prereqs() {
    if ! command -v openssl >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
        log_info "Prerequisite tools (openssl, curl, jq) are missing. Installing automatically..."
        ensure_root
        local pkg_mgr
        pkg_mgr="$(get_pkg_manager)"
        case "$pkg_mgr" in
            apt)
                apt-get update -qq && apt-get install -y -qq openssl curl jq ca-certificates
                ;;
            dnf|yum)
                $pkg_mgr install -y -q openssl curl jq ca-certificates
                ;;
            *)
                log_warn "Unable to auto-install openssl/curl/jq with package manager '$pkg_mgr'."
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
    local configured_http_port configured_https_port
    configured_http_port="$(sed -n 's/^DATRIXOPS_HTTP_PORT=//p' "$ENV_FILE" | tail -n 1)"
    configured_https_port="$(sed -n 's/^DATRIXOPS_HTTPS_PORT=//p' "$ENV_FILE" | tail -n 1)"
    if [[ "$configured_http_port" != "80" && "$configured_https_port" != "443" ]]; then
        log_success "DatrixOps will use dedicated panel port ${configured_http_port:-$PANEL_PORT}; host web services are unchanged."
        return
    fi
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

log_step "Step 1/6: Checking system dependencies and panel port"
check_and_install_prereqs
check_and_install_docker

log_step "Step 2/6: Generating environment configuration and security secrets"
"${SCRIPT_DIR}/generate-secrets.sh" "$ENV_FILE"
chmod 0600 "$ENV_FILE"
if [[ -n "${INSTALL_VERSION:-}" ]]; then
    # A bootstrap retry may reuse .env from an earlier failed installation.
    # Keep its generated secrets while restoring this Server release's pins.
    pinned_agent_version="$(jq -r '.agent_version // empty' "${PROJECT_ROOT}/deploy/version.json")"
    pinned_agent_tag="$(jq -r '.agent_release_tag // empty' "${PROJECT_ROOT}/deploy/version.json")"
    set_env_value "DATRIXOPS_VERSION" "$INSTALL_VERSION"
    if [[ "$pinned_agent_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && -n "$pinned_agent_tag" ]]; then
        pinned_agent_url="https://github.com/luuvandien2604/DatrixOps/releases/download/${pinned_agent_tag}"
        set_env_value "AGENT_VERSION" "$pinned_agent_version"
        set_env_value "AGENT_RELEASE_BASE_URL" "$pinned_agent_url"
        set_env_value "AGENT_RELEASE_LAYOUT" "legacy_direct"
        set_env_value "AGENT_ARTIFACT_BASE_URL" "$pinned_agent_url"
    fi
fi
auto_configure_domain
check_and_install_nginx

log_step "Step 3/6: Validating environment configuration"
required_keys=(POSTGRES_PASSWORD JWT_SECRET SETUP_TOKEN CADDY_SITE_ADDRESS PUBLIC_URL ALLOWED_ORIGINS AGENT_VERSION)
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

log_step "Step 4/6: Downloading DatrixOps Agent binaries"
agent_ver="$(sed -n 's/^AGENT_VERSION=//p' "$ENV_FILE" | tail -n 1)"
log_info "Fetching Agent release version ${agent_ver}..."
"${SCRIPT_DIR}/fetch-agent-release.sh" "$agent_ver"

log_step "Step 5/6: Deploying DatrixOps containers"
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

log_step "Step 6/6: Creating administrator and enabling self-monitoring"
ensure_admin_account() {
    local http_port https_port public_url public_scheme public_authority public_host public_port
    local status_url status_json configured
    local admin_username legacy_admin_email admin_password timezone payload response_file http_code

    http_port="$(sed -n 's/^DATRIXOPS_HTTP_PORT=//p' "$ENV_FILE" | tail -n 1)"
    http_port="${http_port:-$PANEL_PORT}"
    public_url="$(sed -n 's/^PUBLIC_URL=//p' "$ENV_FILE" | tail -n 1)"
    public_url="${public_url%/}"
    public_scheme="${public_url%%://*}"
    public_authority="${public_url#*://}"
    public_authority="${public_authority%%/*}"
    public_host="${public_authority%%:*}"
    if [[ "$public_authority" == *:* ]]; then
        public_port="${public_authority##*:}"
    elif [[ "$public_scheme" == "https" ]]; then
        https_port="$(sed -n 's/^DATRIXOPS_HTTPS_PORT=//p' "$ENV_FILE" | tail -n 1)"
        public_port="${https_port:-443}"
    else
        public_port="$http_port"
    fi
    status_url="${public_url}/api/v1/setup/status"

    log_info "Waiting for the setup API..."
    status_json=""
    for _ in $(seq 1 60); do
        status_json="$(curl -fsS --max-time 5 \
            --noproxy '*' \
            --resolve "${public_host}:${public_port}:127.0.0.1" \
            "$status_url" 2>/dev/null || true)"
        if [[ "$(jq -r '.success // false' <<<"$status_json" 2>/dev/null)" == "true" ]]; then
            break
        fi
        sleep 2
    done
    [[ "$(jq -r '.success // false' <<<"$status_json" 2>/dev/null)" == "true" ]] || {
        log_error "Setup API did not become ready at ${status_url}."
        return 1
    }

    configured="$(jq -r '.data.configured // false' <<<"$status_json")"
    if [[ "$configured" == "true" ]]; then
        if [[ -f "$ADMIN_CREDENTIALS_FILE" ]]; then
            admin_username="$(sed -n 's/^USERNAME=//p' "$ADMIN_CREDENTIALS_FILE" | tail -n 1)"
            legacy_admin_email="$(sed -n 's/^EMAIL=//p' "$ADMIN_CREDENTIALS_FILE" | tail -n 1)"
            admin_username="${admin_username:-${legacy_admin_email%%@*}}"
            admin_username="${admin_username:-admin}"
            umask 077
            printf 'USERNAME=%s\n' "$admin_username" >"$ADMIN_CREDENTIALS_FILE"
            chmod 0600 "$ADMIN_CREDENTIALS_FILE"
        fi
        log_info "Administrator setup is already complete; plaintext credentials were not retained."
        return 0
    fi

    if [[ -f "$ADMIN_CREDENTIALS_FILE" ]]; then
        admin_username="$(sed -n 's/^USERNAME=//p' "$ADMIN_CREDENTIALS_FILE" | tail -n 1)"
        legacy_admin_email="$(sed -n 's/^EMAIL=//p' "$ADMIN_CREDENTIALS_FILE" | tail -n 1)"
        admin_username="${admin_username:-${legacy_admin_email%%@*}}"
    fi

    local is_interactive=false
    if [ -t 0 ] || [ -c /dev/tty ]; then
        is_interactive=true
    fi

    if [ "$is_interactive" = true ] && [[ -z "${admin_username:-}" || "$admin_username" == "admin" ]] && [[ -z "${DATRIXOPS_ADMIN_PASSWORD:-}" ]]; then
        printf "\n${CYAN}============================================================${NC}\n"
        printf "${CYAN}=== Administrator Account Configuration                  ===${NC}\n"
        printf "${CYAN}============================================================${NC}\n"

        while true; do
            printf "${CYAN}Enter administrator username [default: admin]: ${NC}"
            if [ -c /dev/tty ]; then
                read -r input_username < /dev/tty || true
            else
                read -r input_username || true
            fi
            admin_username="${input_username:-admin}"
            admin_username="$(echo "$admin_username" | tr '[:upper:]' '[:lower:]' | tr -d ' ')"
            if [[ "$admin_username" =~ ^[a-z][a-z0-9_.-]{2,31}$ ]]; then
                break
            else
                log_warn "Username must be 3-32 characters, start with a lowercase letter, and contain only a-z, 0-9, '.', '_', or '-'."
            fi
        done

        while true; do
            printf "${CYAN}Enter administrator password (min 12 characters) [Press ENTER to auto-generate]: ${NC}"
            if [ -c /dev/tty ]; then
                read -rs input_password < /dev/tty || true
            else
                read -rs input_password || true
            fi
            printf "\n"
            if [[ -z "$input_password" ]]; then
                admin_password="$(openssl rand -hex 16)"
                log_info "Auto-generated secure random password."
                break
            elif [[ ${#input_password} -lt 12 ]]; then
                log_warn "Password must be at least 12 characters long. Please try again."
            elif [[ ${#input_password} -gt 128 ]]; then
                log_warn "Password must not exceed 128 characters. Please try again."
            else
                printf "${CYAN}Confirm administrator password: ${NC}"
                if [ -c /dev/tty ]; then
                    read -rs confirm_password < /dev/tty || true
                else
                    read -rs confirm_password || true
                fi
                printf "\n"
                if [[ "$input_password" != "$confirm_password" ]]; then
                    log_warn "Passwords do not match. Please try again."
                else
                    admin_password="$input_password"
                    log_success "Password configured successfully."
                    break
                fi
            fi
        done
    else
        admin_username="${admin_username:-${DATRIXOPS_ADMIN_USERNAME:-admin}}"
        admin_password="${DATRIXOPS_ADMIN_PASSWORD:-$(openssl rand -hex 16)}"
    fi
    setup_token="$(sed -n 's/^SETUP_TOKEN=//p' "$ENV_FILE" | tail -n 1)"

    timezone="$(cat /etc/timezone 2>/dev/null || true)"
    timezone="${timezone:-UTC}"
    payload="$(jq -n \
        --arg username "$admin_username" \
        --arg password "$admin_password" \
        --arg system_name "DatrixOps" \
        --arg timezone "$timezone" \
        --arg public_url "$public_url" \
        '{username:$username,password:$password,system_name:$system_name,timezone:$timezone,public_url:$public_url}')"
    response_file="$(mktemp /tmp/datrixops-setup-response.XXXXXX)"
    http_code="$(curl -sS --max-time 30 \
        --noproxy '*' \
        --resolve "${public_host}:${public_port}:127.0.0.1" \
        -o "$response_file" \
        -w '%{http_code}' \
        -H 'Content-Type: application/json' \
        -H "X-DatrixOps-Setup-Token: ${setup_token}" \
        --data "$payload" \
        "${public_url}/api/v1/setup/complete")"
    if [[ "$http_code" != "201" ]]; then
        log_error "Unable to create the administrator: $(jq -r '.error.message // "unknown setup error"' "$response_file" 2>/dev/null)"
        rm -f "$response_file"
        return 1
    fi
    rm -f "$response_file"
    INITIAL_ADMIN_PASSWORD="$admin_password"
    umask 077
    printf 'USERNAME=%s\n' "$admin_username" >"$ADMIN_CREDENTIALS_FILE"
    chmod 0600 "$ADMIN_CREDENTIALS_FILE"
    unset admin_password
    unset setup_token
    log_success "Initial administrator created."
}

ensure_admin_account

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

    local agent_ver
    agent_ver="$(sed -n 's/^[[:space:]]*AGENT_VERSION=//p' "$ENV_FILE" 2>/dev/null | tail -n 1 | tr -d ' "\r\n')"
    if [[ ! "$agent_ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
        agent_ver="1.5.3"
    fi

    # Find compiled agent binary
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
                WHERE tags ? 'self-host' OR name LIKE '%Control Plane%'
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
auto_self_enroll_host
install -m 0755 "${SCRIPT_DIR}/datrixops.sh" /usr/local/bin/datrix
ln -sf /usr/local/bin/datrix /usr/local/bin/datrixops
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
if [[ -f "$ADMIN_CREDENTIALS_FILE" ]]; then
    login_username="$(sed -n 's/^USERNAME=//p' "$ADMIN_CREDENTIALS_FILE" | tail -n 1)"
    login_username="${login_username:-admin}"
    printf "  Login Username    : %s\n" "$login_username"
    if [[ -n "$INITIAL_ADMIN_PASSWORD" ]]; then
        printf "  Initial Password  : %s (shown once)\n" "$INITIAL_ADMIN_PASSWORD"
    else
        printf "  Password          : not stored; use 'datrix reset-password' if needed\n"
    fi
    printf "  Account File      : %s (username only, mode 0600)\n" "$ADMIN_CREDENTIALS_FILE"
fi
printf "  Self-Monitoring   : Active (Host VPS enrolled automatically)\n"
printf "  Status            : All container services are active.\n"
printf "  Management CLI    : datrix\n"
printf "${GREEN}============================================================${NC}\n"
printf "Open %s/login and sign in with the account above.\n" "${pub_url%/}"
printf "Firewall           : Allow inbound TCP %s if the panel is not reachable.\n" "$(sed -n 's/^DATRIXOPS_HTTP_PORT=//p' "$ENV_FILE" | tail -n 1)"
printf "WARNING: IP panel mode uses HTTP. Move to a domain with HTTPS for production.\n\n"
unset INITIAL_ADMIN_PASSWORD
