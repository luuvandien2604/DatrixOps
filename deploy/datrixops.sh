#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="${DATRIXOPS_ROOT:-/opt/datrixops}"
ENV_FILE="${PROJECT_ROOT}/.env"
COMPOSE_FILE="${PROJECT_ROOT}/deploy/docker-compose.yml"
CREDENTIALS_FILE="${PROJECT_ROOT}/.admin-credentials"

die() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

require_installation() {
    [[ -f "$ENV_FILE" && -f "$COMPOSE_FILE" ]] || \
        die "DatrixOps installation was not found in ${PROJECT_ROOT}."
    command -v docker >/dev/null 2>&1 || die "Docker is not installed."
}

require_root() {
    [[ "$(id -u)" -eq 0 ]] || die "Run this command with sudo or as root."
}

env_value() {
    sed -n "s/^${1}=//p" "$ENV_FILE" 2>/dev/null | tail -n 1
}

compose() {
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

admin_emails() {
    compose exec -T database psql -U datrixops -d datrixops -Atc \
        "SELECT email FROM users WHERE role IN ('superadmin','admin') ORDER BY created_at ASC;" \
        2>/dev/null || true
}

show_info() {
    require_installation
    require_root
    local public_url server_version agent_version emails saved_email saved_password
    public_url="$(env_value PUBLIC_URL)"
    server_version="$(env_value DATRIXOPS_VERSION)"
    agent_version="$(env_value AGENT_VERSION)"
    emails="$(admin_emails)"
    saved_email=""
    saved_password=""

    if [[ -f "$CREDENTIALS_FILE" ]]; then
        saved_email="$(sed -n 's/^EMAIL=//p' "$CREDENTIALS_FILE" | tail -n 1)"
        saved_password="$(sed -n 's/^PASSWORD=//p' "$CREDENTIALS_FILE" | tail -n 1)"
    fi

    printf '%s\n' '============================================================'
    printf '%s\n' '  DatrixOps Self-Hosted Information'
    printf '%s\n' '============================================================'
    printf '  Login URL          : %s/login\n' "${public_url%/}"
    printf '  CE Server Version  : %s\n' "${server_version:-unknown}"
    printf '  Agent Version      : %s\n' "${agent_version:-unknown}"
    if [[ -n "$emails" ]]; then
        while IFS= read -r email; do
            [[ -n "$email" ]] && printf '  Administrator      : %s\n' "$email"
        done <<<"$emails"
    elif [[ -n "$saved_email" ]]; then
        printf '  Administrator      : %s\n' "$saved_email"
    else
        printf '  Administrator      : unavailable\n'
    fi
    if [[ -n "$saved_password" ]]; then
        printf '  Saved Password     : %s\n' "$saved_password"
    else
        printf '  Saved Password     : not available; run: datrix reset-password\n'
    fi
    printf '  Credentials File   : %s\n' "$CREDENTIALS_FILE"
    printf '%s\n' '============================================================'
}

choose_admin_email() {
    local emails count email
    emails="$(admin_emails)"
    count="$(printf '%s\n' "$emails" | sed '/^$/d' | wc -l | tr -d ' ')"
    [[ "$count" -gt 0 ]] || die "No administrator account was found."

    if [[ "$count" -eq 1 ]]; then
        printf '%s\n' "$emails"
        return
    fi

    printf 'Administrator email: ' >&2
    read -r email
    printf '%s\n' "$emails" | grep -Fqx -- "$email" || die "That administrator account does not exist."
    printf '%s\n' "$email"
}

reset_password() {
    require_installation
    require_root
    local email password confirmation
    email="${1:-}"
    if [[ -z "$email" ]]; then
        if ! email="$(choose_admin_email)"; then
            return 1
        fi
    fi

    read -r -s -p "New password for ${email}: " password
    printf '\n'
    read -r -s -p "Confirm new password: " confirmation
    printf '\n'
    [[ "$password" == "$confirmation" ]] || die "Passwords do not match."
    [[ "${#password}" -ge 12 && "${#password}" -le 128 ]] || \
        die "Password must contain between 12 and 128 characters."

    printf '%s\n' "$password" | compose run --rm -T backend ./reset_admin "$email"
    umask 077
    printf 'EMAIL=%s\nPASSWORD=%s\n' "$email" "$password" >"$CREDENTIALS_FILE"
    chmod 0600 "$CREDENTIALS_FILE"
    unset password confirmation
    printf 'Saved the current administrator credentials in %s (mode 0600).\n' "$CREDENTIALS_FILE"
}

show_status() {
    require_installation
    printf '%s\n' 'DatrixOps Server containers:'
    compose ps
    printf '\n%s\n' 'DatrixOps Agent service:'
    systemctl --no-pager status datrixops-agent || true
    printf '\nServer services are managed by Docker Compose; use `datrix status`, not `systemctl status datrixops`.\n'
}

restart_services() {
    require_installation
    require_root
    compose restart
    systemctl restart datrixops-agent 2>/dev/null || true
}

follow_logs() {
    require_installation
    compose logs --tail=200 -f
}

upgrade_server() {
    require_root
    "${PROJECT_ROOT}/deploy/upgrade.sh"
}

create_backup() {
    require_root
    "${PROJECT_ROOT}/deploy/backup.sh"
}

show_help() {
    cat <<'EOF'
Usage: datrix [command]

Commands:
  info, default        Show login URL, versions and administrator credentials
  status               Show container and Agent service status
  reset-password       Reset an administrator password securely
  logs                 Follow service logs (Ctrl+C to stop)
  restart              Restart DatrixOps services
  update               Upgrade to the latest CE Server release
  backup               Create a backup
  help                 Show this help

Run `datrix` without a command to open the management menu. Use `sudo datrix`
when the current shell is not root.
EOF
}

menu() {
    local choice action_status
    require_installation
    require_root
    trap '' INT
    while true; do
        printf '\n%s\n' '============================================================'
        printf '%s\n' '  DatrixOps Management'
        printf '%s\n' '============================================================'
        printf '%s\n' '  1) Show login information'
        printf '%s\n' '  2) Show service status'
        printf '%s\n' '  3) Reset administrator password'
        printf '%s\n' '  4) Follow service logs'
        printf '%s\n' '  5) Restart services'
        printf '%s\n' '  6) Upgrade DatrixOps'
        printf '%s\n' '  7) Create backup'
        printf '%s\n' '  0) Exit'
        printf '%s\n' '============================================================'
        printf 'Select: '
        if ! read -r choice; then
            printf '\n'
            return 0
        fi

        action_status=0
        case "$choice" in
            1) (trap - INT; show_info) || action_status=$? ;;
            2) (trap - INT; show_status) || action_status=$? ;;
            3) (trap - INT; reset_password) || action_status=$? ;;
            4) (trap - INT; follow_logs) || action_status=$? ;;
            5) (trap - INT; restart_services) || action_status=$? ;;
            6) (trap - INT; upgrade_server) || action_status=$? ;;
            7) (trap - INT; create_backup) || action_status=$? ;;
            0) printf 'Exited DatrixOps Management.\n'; return 0 ;;
            *) printf 'ERROR: Invalid selection.\n' >&2; action_status=2 ;;
        esac

        if [[ "$action_status" -ne 0 ]]; then
            printf 'Operation failed. Returning to the management menu.\n' >&2
        fi
        printf '\nPress Enter to return to the management menu...'
        read -r _ || return 0
    done
}

case "${1:-}" in
    "") menu ;;
    info|default) show_info ;;
    status) show_status ;;
    reset-password) shift; reset_password "${1:-}" ;;
    logs) follow_logs ;;
    restart) restart_services ;;
    update|upgrade) upgrade_server ;;
    backup) create_backup ;;
    help|-h|--help) show_help ;;
    *) show_help; exit 2 ;;
esac
