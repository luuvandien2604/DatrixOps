#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-}"
STATE_FILE="${DATRIXOPS_INSTALLER_ROOT:-/tmp}/mock_launchctl_state"

if [[ "$CMD" == "kickstart" ]]; then
    if [[ -f "${STATE_FILE}_restarted" ]]; then
        if [[ -n "${DATRIXOPS_MOCK_ROLLBACK_RESTART_FAIL:-}" ]]; then
            echo "Mock rollback kickstart failed" >&2
            exit 1
        fi
        echo "Mock rollback kickstart succeeded"
        exit 0
    fi
    touch "${STATE_FILE}_restarted"
    
    if [[ -n "${DATRIXOPS_MOCK_RESTART_FAIL:-}" ]]; then
        echo "Mock kickstart failed" >&2
        exit 1
    fi
    echo "Mock kickstart succeeded"
    exit 0
elif [[ "$CMD" == "bootstrap" ]]; then
    echo "Mock bootstrap succeeded"
    exit 0
elif [[ "$CMD" == "bootout" ]]; then
    echo "Mock bootout succeeded"
    exit 0
elif [[ "$CMD" == "print" ]]; then
    if [[ -f "${STATE_FILE}_restarted_health" ]]; then
        if [[ -n "${DATRIXOPS_MOCK_ROLLBACK_HEALTH_FAIL:-}" ]]; then
            echo "\"state\" = 1"
            exit 0
        fi
        echo "\"state\" = 0"
        exit 0
    fi
    touch "${STATE_FILE}_restarted_health"
    
    if [[ -n "${DATRIXOPS_MOCK_HEALTH_FAIL:-}" ]]; then
        echo "\"state\" = 1"
        exit 0
    fi
    echo "\"state\" = 0"
    exit 0
fi

echo "Mock launchctl: unknown command $CMD" >&2
exit 1
