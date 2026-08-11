#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-}"
STATE_FILE="${DATRIXOPS_INSTALLER_ROOT:-/tmp}/mock_systemctl_state"

if [[ "$CMD" == "restart" ]]; then
    if [[ -f "${STATE_FILE}_restarted" ]]; then
        # This is a subsequent restart (likely a rollback)
        if [[ -n "${DATRIXOPS_MOCK_ROLLBACK_RESTART_FAIL:-}" ]]; then
            echo "Mock rollback restart failed" >&2
            exit 1
        fi
        echo "Mock rollback restart succeeded"
        exit 0
    fi
    touch "${STATE_FILE}_restarted"
    
    if [[ -n "${DATRIXOPS_MOCK_RESTART_FAIL:-}" ]]; then
        echo "Mock restart failed" >&2
        exit 1
    fi
    echo "Mock restart succeeded"
    exit 0
elif [[ "$CMD" == "start" ]]; then
    echo "Mock start succeeded"
    exit 0
elif [[ "$CMD" == "stop" ]]; then
    echo "Mock stop succeeded"
    exit 0
elif [[ "$CMD" == "is-active" ]]; then
    if [[ -f "${STATE_FILE}_restarted_health" ]]; then
        # This is a subsequent health check (likely a rollback)
        if [[ -n "${DATRIXOPS_MOCK_ROLLBACK_HEALTH_FAIL:-}" ]]; then
            echo "inactive (rollback)"
            exit 3
        fi
        echo "active (rollback)"
        exit 0
    fi
    touch "${STATE_FILE}_restarted_health"
    
    if [[ -n "${DATRIXOPS_MOCK_HEALTH_FAIL:-}" ]]; then
        echo "inactive"
        exit 3
    fi
    echo "active"
    exit 0
fi

echo "Mock systemctl: unknown command $CMD" >&2
exit 1
