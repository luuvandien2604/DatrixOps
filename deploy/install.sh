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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
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
    if ! command -v nginx >/dev/null 2>&1; then
        log_info "Nginx web server is not installed. Installing Nginx automatically..."
        ensure_root

        local pkg_mgr
        pkg_mgr="$(get_pkg_manager)"
        case "$pkg_mgr" in
            apt)
                log_info "Installing Nginx package via apt-get..."
                apt-get update -qq && apt-get install -y -qq nginx
                ;;
            dnf)
                log_info "Installing Nginx package via dnf..."
                dnf install -y -q nginx
                ;;
            yum)
                log_info "Installing Nginx package via yum..."
                yum install -y -q epel-release || true
                yum install -y -q nginx
                ;;
            pacman)
                log_info "Installing Nginx package via pacman..."
                pacman -Sy --noconfirm nginx
                ;;
            apk)
                log_info "Installing Nginx package via apk..."
                apk add --no-cache nginx
                ;;
            *)
                log_warn "Package manager '$pkg_mgr' is not supported for automatic Nginx installation."
                ;;
        esac

        if command -v systemctl >/dev/null 2>&1; then
            systemctl enable --now nginx >/dev/null 2>&1 || true
        elif command -v service >/dev/null 2>&1; then
            service nginx start >/dev/null 2>&1 || true
        fi
    fi

    if command -v nginx >/dev/null 2>&1; then
        log_success "Nginx web server is ready."
    else
        log_warn "Nginx was not installed automatically. Make sure your reverse proxy is configured manually."
    fi
}

log_step "Step 1/5: Checking and installing system dependencies (Docker, Docker Compose, Nginx)"
check_and_install_prereqs
check_and_install_docker
check_and_install_nginx

log_step "Step 2/5: Generating environment configuration and security secrets"
"${SCRIPT_DIR}/generate-secrets.sh" "$ENV_FILE"
chmod 0600 "$ENV_FILE"

log_step "Step 3/5: Validating environment configuration"
required_keys=(POSTGRES_PASSWORD JWT_SECRET DATRIXOPS_DOMAIN PUBLIC_URL ALLOWED_ORIGINS AGENT_VERSION)
missing_vars=()
for key in "${required_keys[@]}"; do
    value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"
    if [[ -z "$value" || "$value" == "monitor.example.com" || "$value" == "https://monitor.example.com" ]]; then
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

log_info "Running database migrations..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate

log_info "Starting DatrixOps services in detached mode..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

log_step "Verifying running container status"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

pub_url="$(sed -n 's/^PUBLIC_URL=//p' "$ENV_FILE" | tail -n 1)"
printf "\n"
printf "${GREEN}============================================================${NC}\n"
printf "${GREEN}✔ DatrixOps Self-Hosted Deployment Completed Successfully!  ${NC}\n"
printf "${GREEN}============================================================${NC}\n"
printf "  Control Plane URL : %s\n" "$pub_url"
printf "  Initial Setup     : %s/setup\n" "${pub_url%/}"
printf "  Status            : All container services are active.\n"
printf "${GREEN}============================================================${NC}\n"
printf "Next step: Open %s/setup in your browser to complete administrator setup.\n\n" "${pub_url%/}"
