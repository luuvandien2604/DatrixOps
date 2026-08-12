#!/bin/sh
set -eu

# Token-free in-place updater for an installed Linux or macOS agent.
# Existing service definitions and environment variables remain untouched.

TARGET_VERSION=""
TARGET_ARTIFACT_BASE_URL=""
ALLOW_DOWNGRADE=0

while [ $# -gt 0 ]; do
    case "$1" in
        --target-version|--agent-version) TARGET_VERSION="${2:-}"; shift 2 ;;
        --target-artifact-base-url|--agent-artifact-base-url) TARGET_ARTIFACT_BASE_URL="${2:-}"; shift 2 ;;
        --allow-downgrade) ALLOW_DOWNGRADE=1; shift 1 ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
done

BINARY_DIR="/usr/local/bin"
TEST_MODE="${DATRIXOPS_INSTALLER_TEST_MODE:-0}"
TEST_ROOT="${DATRIXOPS_INSTALLER_ROOT:-}"
if [ -n "$TEST_ROOT" ]; then
    BINARY_DIR="${TEST_ROOT}/usr/local/bin"
fi
BINARY_PATH="${BINARY_DIR}/datrixops-agent"
STAGED_PATH="${BINARY_DIR}/.datrixops-agent.update.tmp"
BACKUP_PATH="${BINARY_DIR}/datrixops-agent.bak"

if [ "$TEST_MODE" -ne 1 ] && [ "$(id -u)" -ne 0 ]; then
    echo "Run this updater with sudo." >&2
    exit 1
fi

ENV_FILE="${TEST_ROOT}/etc/datrixops/agent.env"
PLIST_FILE="${TEST_ROOT}/Library/LaunchDaemons/com.datrixops.agent.plist"

CURRENT_VERSION=""
if [ -r "$ENV_FILE" ]; then
    CURRENT_VERSION="$(sed -n 's/^AGENT_VERSION=//p' "$ENV_FILE" | head -n 1)"
elif [ -x /usr/libexec/PlistBuddy ] && [ -r "$PLIST_FILE" ]; then
    CURRENT_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:AGENT_VERSION' "$PLIST_FILE" 2>/dev/null || true)"
fi

if [ -z "$TARGET_VERSION" ] || [ -z "$TARGET_ARTIFACT_BASE_URL" ]; then
    echo "ERROR: --target-version and --target-artifact-base-url are required." >&2
    exit 1
fi

if ! echo "$TARGET_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "ERROR: --target-version must be a valid semver version (X.Y.Z)." >&2
    exit 1
fi

TARGET_ARTIFACT_BASE_URL="${TARGET_ARTIFACT_BASE_URL%/}"
if [ "$TEST_MODE" -ne 1 ] && echo "$TARGET_ARTIFACT_BASE_URL" | grep -qv '^https://'; then
    echo "ERROR: --target-artifact-base-url must be an HTTPS URL." >&2
    exit 1
fi

# Numeric SemVer comparison helper: returns 0 if v1 < v2, 1 if v1 == v2, 2 if v1 > v2
compare_semver() {
    v1_major="$(echo "$1" | cut -d. -f1)"; v1_minor="$(echo "$1" | cut -d. -f2)"; v1_patch="$(echo "$1" | cut -d. -f3)"
    v2_major="$(echo "$2" | cut -d. -f1)"; v2_minor="$(echo "$2" | cut -d. -f2)"; v2_patch="$(echo "$2" | cut -d. -f3)"
    if [ "$v1_major" -lt "$v2_major" ]; then return 0; fi
    if [ "$v1_major" -gt "$v2_major" ]; then return 2; fi
    if [ "$v1_minor" -lt "$v2_minor" ]; then return 0; fi
    if [ "$v1_minor" -gt "$v2_minor" ]; then return 2; fi
    if [ "$v1_patch" -lt "$v2_patch" ]; then return 0; fi
    if [ "$v1_patch" -gt "$v2_patch" ]; then return 2; fi
    return 1
}

if [ -n "$CURRENT_VERSION" ] && echo "$CURRENT_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    compare_semver "$CURRENT_VERSION" "$TARGET_VERSION" || cmp_res=$?
    cmp_res="${cmp_res:-1}"
    if [ "$cmp_res" -eq 2 ] && [ "$ALLOW_DOWNGRADE" -ne 1 ]; then
        echo "ERROR: Target version ($TARGET_VERSION) is lower than current version ($CURRENT_VERSION). Use --allow-downgrade to force." >&2
        exit 1
    fi
fi

os="$(uname -s)"
arch="$(uname -m)"
case "$os/$arch" in
    Linux/x86_64|Linux/amd64) artifact="datrixops-agent-linux-amd64" ;;
    Linux/aarch64|Linux/arm64) artifact="datrixops-agent-linux-arm64" ;;
    Darwin/x86_64|Darwin/amd64) artifact="datrixops-agent-darwin-amd64" ;;
    Darwin/arm64|Darwin/aarch64) artifact="datrixops-agent-darwin-arm64" ;;
    *)
        echo "Unsupported platform: $os/$arch" >&2
        exit 1
        ;;
esac

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

cleanup() {
    rm -f "$STAGED_PATH"
}
trap cleanup EXIT HUP INT TERM

echo "Fetching release metadata for $os/$arch..."
VERSION_TMP="${BINARY_DIR}/.agent-release.version.tmp"
SHA_TMP="${BINARY_DIR}/.artifact.sha256.tmp"
SIZE_TMP="${BINARY_DIR}/.artifact.size.tmp"

curl --fail --location --silent --show-error \
    "$TARGET_ARTIFACT_BASE_URL/agent-release.version" --output "$VERSION_TMP"
REMOTE_VERSION="$(tr -d '\r\n[:space:]' <"$VERSION_TMP")"
rm -f "$VERSION_TMP"

if [ "$REMOTE_VERSION" != "$TARGET_VERSION" ]; then
    echo "ERROR: Target version mismatch: remote release version is $REMOTE_VERSION, expected $TARGET_VERSION." >&2
    exit 1
fi

curl --fail --location --silent --show-error \
    "$TARGET_ARTIFACT_BASE_URL/$artifact.sha256" --output "$SHA_TMP"
curl --fail --location --silent --show-error \
    "$TARGET_ARTIFACT_BASE_URL/$artifact.size" --output "$SIZE_TMP"

EXPECTED_SHA="$(tr -d '\r\n[:space:]' <"$SHA_TMP")"
EXPECTED_SIZE="$(tr -d '\r\n[:space:]' <"$SIZE_TMP")"
rm -f "$SHA_TMP" "$SIZE_TMP"

if [ -z "$EXPECTED_SHA" ]; then
    echo "Release metadata is invalid." >&2
    exit 1
fi

case "$EXPECTED_SIZE" in
    ''|*[!0-9]*)
        echo "ERROR: Release size metadata is invalid." >&2
        exit 1
        ;;
esac

echo "Downloading the DatrixOps Agent update..."
curl --fail --location --silent --show-error \
    "$TARGET_ARTIFACT_BASE_URL/$artifact" --output "$STAGED_PATH"

if [ ! -s "$STAGED_PATH" ]; then
    echo "Downloaded agent binary is empty." >&2
    exit 1
fi

ACTUAL_SIZE="$(wc -c <"$STAGED_PATH" | tr -d '[:space:]')"

case "$ACTUAL_SIZE" in
    ''|*[!0-9]*)
        echo "ERROR: Could not determine downloaded binary size." >&2
        exit 1
        ;;
esac

if [ "$ACTUAL_SIZE" -ne "$EXPECTED_SIZE" ]; then
    echo "ERROR: Downloaded binary size ($ACTUAL_SIZE bytes) does not match expected ($EXPECTED_SIZE bytes)." >&2
    exit 1
fi

ACTUAL_SHA="$(sha256_file "$STAGED_PATH")"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
    echo "Downloaded binary SHA-256 ($ACTUAL_SHA) does not match expected ($EXPECTED_SHA)." >&2
    exit 1
fi

chmod 0755 "$STAGED_PATH"

# Backup current binary
if [ -f "$BINARY_PATH" ]; then
    cp -f "$BINARY_PATH" "$BACKUP_PATH"
fi

# Replacement (same filesystem)
mv -f "$STAGED_PATH" "$BINARY_PATH"
trap - EXIT HUP INT TERM

restart_service() {
    if [ "$TEST_MODE" -eq 1 ] && [ -n "${DATRIXOPS_SYSTEMCTL_BIN:-}" ] && [ "$os" = "Linux" ]; then
        "$DATRIXOPS_SYSTEMCTL_BIN" restart datrixops-agent
    elif [ "$TEST_MODE" -eq 1 ] && [ -n "${DATRIXOPS_LAUNCHCTL_BIN:-}" ] && [ "$os" = "Darwin" ]; then
        "$DATRIXOPS_LAUNCHCTL_BIN" kickstart -k system/com.datrixops.agent
    elif [ "$os" = "Linux" ]; then
        systemctl restart datrixops-agent
    else
        launchctl kickstart -k system/com.datrixops.agent
    fi
}

check_service_health() {
    if [ "$TEST_MODE" -eq 1 ] && [ -n "${DATRIXOPS_SYSTEMCTL_BIN:-}" ] && [ "$os" = "Linux" ]; then
        "$DATRIXOPS_SYSTEMCTL_BIN" is-active datrixops-agent
    elif [ "$TEST_MODE" -eq 1 ] && [ -n "${DATRIXOPS_LAUNCHCTL_BIN:-}" ] && [ "$os" = "Darwin" ]; then
        "$DATRIXOPS_LAUNCHCTL_BIN" print system/com.datrixops.agent >/dev/null 2>&1
    elif [ "$TEST_MODE" -eq 1 ]; then
        [ -f "$BINARY_PATH" ]
    elif [ "$os" = "Linux" ]; then
        systemctl is-active --quiet datrixops-agent
    else
        launchctl print system/com.datrixops.agent >/dev/null 2>&1
    fi
}

if ! restart_service || ! check_service_health; then
    echo "ERROR: Updated agent failed restart or health check. Restoring previous binary..." >&2
    if [ -f "$BACKUP_PATH" ]; then
        mv -f "$BACKUP_PATH" "$BINARY_PATH"
        if restart_service && check_service_health; then
            echo "ERROR: Update failed. Old Agent successfully restored." >&2
        else
            echo "CRITICAL: Update failed AND rollback activation failed." >&2
        fi
    fi
    exit 1
fi

if [ -f "$ENV_FILE" ]; then
    if grep -q '^AGENT_VERSION=' "$ENV_FILE"; then
        sed -i.bak "s|^AGENT_VERSION=.*|AGENT_VERSION=$TARGET_VERSION|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
    else
        echo "AGENT_VERSION=$TARGET_VERSION" >> "$ENV_FILE"
    fi
    if grep -q '^DATRIXOPS_AGENT_ARTIFACT_BASE_URL=' "$ENV_FILE"; then
        sed -i.bak "s|^DATRIXOPS_AGENT_ARTIFACT_BASE_URL=.*|DATRIXOPS_AGENT_ARTIFACT_BASE_URL=$TARGET_ARTIFACT_BASE_URL|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
    else
        echo "DATRIXOPS_AGENT_ARTIFACT_BASE_URL=$TARGET_ARTIFACT_BASE_URL" >> "$ENV_FILE"
    fi
elif [ -x /usr/libexec/PlistBuddy ] && [ -f "$PLIST_FILE" ]; then
    /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:AGENT_VERSION $TARGET_VERSION" "$PLIST_FILE" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:AGENT_VERSION string $TARGET_VERSION" "$PLIST_FILE"

    /usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:DATRIXOPS_AGENT_ARTIFACT_BASE_URL $TARGET_ARTIFACT_BASE_URL" "$PLIST_FILE" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:DATRIXOPS_AGENT_ARTIFACT_BASE_URL string $TARGET_ARTIFACT_BASE_URL" "$PLIST_FILE"
fi

rm -f "$BACKUP_PATH"
echo "DatrixOps Agent updated and restarted successfully."
