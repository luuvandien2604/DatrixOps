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
    SCRIPT_DIR="${DATRIXOPS_INSTALL_DIR:-/opt/datrixops}"
    if [[ ! -d "$SCRIPT_DIR" && -d "$(pwd)" && -f "$(pwd)/docker-compose.yml" ]]; then
        SCRIPT_DIR="$(pwd)"
    fi
fi

if [[ -f "${SCRIPT_DIR}/docker-compose.yml" ]]; then
    PROJECT_ROOT="$SCRIPT_DIR"
    cd "$SCRIPT_DIR"
else
    PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi

COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/.env"
RELEASE_TARBALL_URL="${DATRIXOPS_UPDATE_URL:-https://github.com/luuvandien2604/DatrixOps/archive/refs/heads/main.tar.gz}"

[[ -f "$ENV_FILE" ]] || {
    log_error "Missing configuration file: ${ENV_FILE}"
    exit 1
}

log_step "Step 1/4: Creating automated pre-upgrade backup"
if [[ -x "${SCRIPT_DIR}/backup.sh" ]]; then
    BACKUP_FILE="$("${SCRIPT_DIR}/backup.sh")"
    log_success "Backup created successfully: ${BACKUP_FILE}"
fi

log_step "Step 2/4: Updating DatrixOps codebase"

use_git=false
if command -v git >/dev/null 2>&1 && [[ -d "${PROJECT_ROOT}/.git" ]]; then
    log_info "Attempting update via Git repository..."
    if git -C "$PROJECT_ROOT" pull --ff-only 2>/dev/null; then
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

    if curl -fsSL "$RELEASE_TARBALL_URL" -o "${TMP_DIR}/release.tar.gz"; then
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
        log_error "Failed to download update tarball from ${RELEASE_TARBALL_URL}."
        log_info "Ensure your VPS has internet access or set DATRIXOPS_UPDATE_URL to a custom mirror."
        exit 1
    fi
fi

log_step "Step 3/4: Fetching latest Agent release binaries"
agent_ver="$(sed -n 's/^AGENT_VERSION=//p' "$ENV_FILE" | tail -n 1)"
log_info "Fetching Agent version v${agent_ver}..."
"${SCRIPT_DIR}/fetch-agent-release.sh" "$agent_ver"

log_step "Step 4/4: Rebuilding and restarting DatrixOps containers"
log_info "Building updated container images..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build

log_info "Running database migrations..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate || true

log_info "Restarting services with updated code..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

log_info "Performing health checks..."
healthy=false
for _ in $(seq 1 24); do
    if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend \
        wget -qO- http://127.0.0.1:8080/health/ready >/dev/null 2>&1; then
        healthy=true
        break
    fi
    sleep 5
done

if [[ "$healthy" == "true" ]]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
    printf "\n${GREEN}============================================================${NC}\n"
    printf "${GREEN}✔ DatrixOps Upgraded Successfully!                          ${NC}\n"
    printf "${GREEN}============================================================${NC}\n\n"
    exit 0
else
    log_error "Health check failed after upgrade. Check container logs: docker compose logs backend"
    exit 1
fi
