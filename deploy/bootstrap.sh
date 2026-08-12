#!/usr/bin/env bash
set -Eeuo pipefail

INSTALLER_API="https://api.github.com/repos/luuvandien2604/DatrixOps/contents/deploy/install.sh?ref=main"
TEMP_INSTALLER="$(mktemp /tmp/datrixops-installer.XXXXXX.sh)"
cleanup() { rm -f -- "$TEMP_INSTALLER"; }
trap cleanup EXIT

curl -fsSL \
    --retry 5 \
    --retry-delay 2 \
    --connect-timeout 15 \
    --max-time 120 \
    -H 'Accept: application/vnd.github.raw+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    "$INSTALLER_API" \
    -o "$TEMP_INSTALLER"

bash "$TEMP_INSTALLER"
