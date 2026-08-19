#!/usr/bin/env bash
set -Eeuo pipefail

INSTALLER_API="https://api.github.com/repos/luuvandien2604/DatrixOps/contents/deploy/install.sh?ref=main"
INSTALLER_RAW="https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/install.sh"
TEMP_INSTALLER="$(mktemp /tmp/datrixops-installer.XXXXXX.sh)"
cleanup() { rm -f -- "$TEMP_INSTALLER"; }
trap cleanup EXIT

printf "\033[0;34m[INFO]\033[0m Fetching DatrixOps installer...\n"

if ! curl -fsSL \
    --retry 3 \
    --retry-delay 2 \
    --connect-timeout 10 \
    --max-time 60 \
    -H 'Accept: application/vnd.github.raw+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "$INSTALLER_API" \
    -o "$TEMP_INSTALLER" 2>/dev/null; then
    if ! curl -fsSL \
        --retry 3 \
        --retry-delay 2 \
        --connect-timeout 10 \
        --max-time 60 \
        "$INSTALLER_RAW" \
        -o "$TEMP_INSTALLER"; then
        printf "\033[0;31m[ERROR]\033[0m Failed to download DatrixOps installer.\n" >&2
        exit 1
    fi
fi

if [ -e /dev/tty ] && [ -r /dev/tty ]; then
    bash "$TEMP_INSTALLER" "$@" < /dev/tty
else
    bash "$TEMP_INSTALLER" "$@"
fi
