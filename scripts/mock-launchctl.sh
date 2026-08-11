#!/usr/bin/env bash
set -euo pipefail

CMD=""
for arg in "$@"; do
    if [[ "$arg" != -* ]]; then
        CMD="$arg"
        break
    fi
done

STATE_FILE="${DATRIXOPS_INSTALLER_ROOT:-/tmp}/mock_launchctl_state"

if [[ "$CMD" == "kickstart" ]]; then
    count_file="${STATE_FILE}_restart_count"
    count=$(cat "$count_file" 2>/dev/null || echo "0")
    count=$((count + 1))
    echo "$count" > "$count_file"

    if [[ "$count" -eq 1 ]]; then
        if [[ -n "${DATRIXOPS_MOCK_RESTART_FAIL:-}" ]]; then
            echo "Mock kickstart failed" >&2
            exit 1
        fi
        echo "Mock kickstart succeeded"
        exit 0
    else
        if [[ -n "${DATRIXOPS_MOCK_ROLLBACK_RESTART_FAIL:-}" ]]; then
            echo "Mock rollback kickstart failed" >&2
            exit 1
        fi
        echo "Mock rollback kickstart succeeded"
        exit 0
    fi
elif [[ "$CMD" == "bootstrap" ]]; then
    echo "Mock bootstrap succeeded"
    exit 0
elif [[ "$CMD" == "bootout" ]]; then
    echo "Mock bootout succeeded"
    exit 0
elif [[ "$CMD" == "print" ]]; then
    count_file="${STATE_FILE}_health_count"
    count=$(cat "$count_file" 2>/dev/null || echo "0")
    count=$((count + 1))
    echo "$count" > "$count_file"

    if [[ "$count" -eq 1 ]]; then
        if [[ -n "${DATRIXOPS_MOCK_HEALTH_FAIL:-}" ]]; then
            echo "\"state\" = 1"
            exit 1
        fi
        echo "\"state\" = 0"
        exit 0
    else
        if [[ -n "${DATRIXOPS_MOCK_ROLLBACK_HEALTH_FAIL:-}" ]]; then
            echo "\"state\" = 1"
            exit 1
        fi
        echo "\"state\" = 0"
        exit 0
    fi
fi

echo "Mock launchctl: unknown command $CMD" >&2
exit 1
