#!/usr/bin/env bash
set -euo pipefail

# Parse command skipping options like --now, --quiet
CMD=""
for arg in "$@"; do
    if [[ "$arg" != -* ]]; then
        CMD="$arg"
        break
    fi
done

STATE_FILE="${DATRIXOPS_INSTALLER_ROOT:-/tmp}/mock_systemctl_state"

if [[ "$CMD" == "daemon-reload" || "$CMD" == "enable" || "$CMD" == "disable" ]]; then
    echo "Mock systemctl: $CMD succeeded"
    exit 0
elif [[ "$CMD" == "restart" ]]; then
    count_file="${STATE_FILE}_restart_count"
    count=$(cat "$count_file" 2>/dev/null || echo "0")
    count=$((count + 1))
    echo "$count" > "$count_file"

    if [[ "$count" -eq 1 ]]; then
        if [[ -n "${DATRIXOPS_MOCK_RESTART_FAIL:-}" ]]; then
            echo "Mock restart failed" >&2
            exit 1
        fi
        echo "Mock restart succeeded"
        exit 0
    else
        # Subsequent restarts simulate rollback
        if [[ -n "${DATRIXOPS_MOCK_ROLLBACK_RESTART_FAIL:-}" ]]; then
            echo "Mock rollback restart failed" >&2
            exit 1
        fi
        echo "Mock rollback restart succeeded"
        exit 0
    fi
elif [[ "$CMD" == "start" ]]; then
    echo "Mock start succeeded"
    exit 0
elif [[ "$CMD" == "stop" ]]; then
    echo "Mock stop succeeded"
    exit 0
elif [[ "$CMD" == "is-active" ]]; then
    count_file="${STATE_FILE}_health_count"
    count=$(cat "$count_file" 2>/dev/null || echo "0")
    count=$((count + 1))
    echo "$count" > "$count_file"

    if [[ "$count" -eq 1 ]]; then
        if [[ -n "${DATRIXOPS_MOCK_HEALTH_FAIL:-}" ]]; then
            echo "inactive"
            exit 3
        fi
        echo "active"
        exit 0
    else
        if [[ -n "${DATRIXOPS_MOCK_ROLLBACK_HEALTH_FAIL:-}" ]]; then
            echo "inactive (rollback)"
            exit 3
        fi
        echo "active (rollback)"
        exit 0
    fi
fi

echo "Mock systemctl: unknown command $CMD" >&2
exit 1
