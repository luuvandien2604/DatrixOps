#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Parse arguments
FORCE=0
VERSION=""
for arg in "$@"; do
    case "$arg" in
        --force|-f) FORCE=1 ;;
        *) VERSION="$arg" ;;
    esac
done

if [[ -z "$VERSION" ]]; then
    echo "Usage: ./scripts/publish-github-release.sh <version> [--force]" >&2
    echo "" >&2
    echo "Examples:" >&2
    echo "  ./scripts/publish-github-release.sh 1.5.4" >&2
    echo "  ./scripts/publish-github-release.sh 1.5.4 --force   # Overwrite existing release" >&2
    echo "" >&2
    echo "Environment:" >&2
    echo "  RELEASE_FORCE=1  Same as --force" >&2
    exit 1
fi

# Allow env var override
FORCE="${RELEASE_FORCE:-$FORCE}"

# Clean version string (remove leading 'v' if provided)
VERSION="${VERSION#v}"

RELEASE_DIR="${PROJECT_ROOT}/frontend/public/releases/${VERSION}"

# Pre-flight: check if release already exists
if [[ "$FORCE" != "1" ]]; then
    if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
        echo "ERROR: Git tag v${VERSION} already exists." >&2
        echo "Use --force to overwrite the existing release." >&2
        exit 1
    fi
    if [[ -d "$RELEASE_DIR" ]]; then
        echo "ERROR: Release directory already exists: ${RELEASE_DIR}" >&2
        echo "Use --force to overwrite the existing release." >&2
        exit 1
    fi
    if command -v gh >/dev/null 2>&1; then
        if gh release view "v${VERSION}" >/dev/null 2>&1; then
            echo "ERROR: GitHub Release v${VERSION} already exists." >&2
            echo "Use --force to overwrite the existing release." >&2
            exit 1
        fi
    fi
fi

echo "============================================================"
echo "🚀 Publishing DatrixOps Release v${VERSION}"
if [[ "$FORCE" == "1" ]]; then
    echo "⚠️  Force mode enabled — existing release will be overwritten"
fi
echo "============================================================"

# Step 1: Build & sign agent binaries locally
echo ""
echo "===> Step 1/4: Building and signing agent release artifacts..."
AGENT_FORCE="$FORCE" "${SCRIPT_DIR}/publish-agent.sh" "${VERSION}"

# Step 2: Commit version configuration changes
echo ""
echo "===> Step 2/4: Committing release configuration changes..."
cd "${PROJECT_ROOT}"
git add -A
git commit -m "release: publish DatrixOps v${VERSION}" || echo "No changes to commit."

# Step 3: Create git tag & push to GitHub
echo ""
echo "===> Step 3/4: Creating and pushing Git tag v${VERSION}..."
if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
    if [[ "$FORCE" == "1" ]]; then
        echo "Force: Deleting existing local tag v${VERSION}..."
        git tag -d "v${VERSION}"
        echo "Force: Deleting existing remote tag v${VERSION}..."
        git push origin ":refs/tags/v${VERSION}" 2>/dev/null || true
    fi
fi

git tag -a "v${VERSION}" -m "DatrixOps Agent & Control Plane Release v${VERSION}"
git push origin main --tags -f

# Step 4: Upload to GitHub Releases
echo ""
echo "===> Step 4/4: Publishing GitHub Release..."

if command -v gh >/dev/null 2>&1; then
    # Delete existing GitHub Release in force mode
    if [[ "$FORCE" == "1" ]]; then
        if gh release view "v${VERSION}" >/dev/null 2>&1; then
            echo "Force: Deleting existing GitHub Release v${VERSION}..."
            gh release delete "v${VERSION}" --yes --cleanup-tag=false 2>/dev/null || true
        fi
    fi

    gh release create "v${VERSION}" \
        "${RELEASE_DIR}"/* \
        --title "DatrixOps Release v${VERSION}" \
        --notes "Release v${VERSION} with pre-compiled signed agent binaries and database schema updates." \
        --clobber
    echo "SUCCESS: GitHub Release v${VERSION} created and assets uploaded via gh CLI!"
else
    echo "GitHub CLI (gh) not found. Git tag v${VERSION} pushed to GitHub."
    echo "GitHub Actions (.github/workflows/release.yml) will automatically build and create the release."
fi

echo ""
echo "============================================================"
echo "✔ Release v${VERSION} workflow complete!"
echo "GitHub Release page: https://github.com/luuvandien2604/DatrixOps/releases/tag/v${VERSION}"
echo "============================================================"
