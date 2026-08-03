#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
    echo "Usage: ./scripts/publish-github-release.sh <version>" >&2
    echo "Example: ./scripts/publish-github-release.sh 1.5.4" >&2
    exit 1
fi

# Clean version string (remove leading 'v' if provided)
VERSION="${VERSION#v}"

echo "============================================================"
echo "🚀 Publishing DatrixOps Release v${VERSION}"
echo "============================================================"

# Step 1: Build & sign agent binaries locally
echo "Step 1: Building and signing agent release artifacts..."
"${SCRIPT_DIR}/publish-agent.sh" "${VERSION}"

# Step 2: Commit version configuration changes
echo "Step 2: Committing release configuration changes..."
cd "${PROJECT_ROOT}"
git add -A
git commit -m "release: publish DatrixOps v${VERSION}" || echo "No changes to commit."

# Step 3: Create git tag & push to GitHub
echo "Step 3: Creating and pushing Git tag v${VERSION}..."
if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
    echo "Tag v${VERSION} already exists locally. Deleting old tag to recreate..."
    git tag -d "v${VERSION}"
fi

git tag -a "v${VERSION}" -m "DatrixOps Agent & Control Plane Release v${VERSION}"
git push origin main --tags -f

# Step 4: Check if GitHub CLI is available to upload assets directly
RELEASE_DIR="${PROJECT_ROOT}/frontend/public/releases/${VERSION}"

if command -v gh >/dev/null 2>&1; then
    echo "Step 4: Uploading release assets to GitHub Releases via GitHub CLI..."
    gh release create "v${VERSION}" \
        "${RELEASE_DIR}"/* \
        --title "DatrixOps Release v${VERSION}" \
        --notes "Release v${VERSION} with pre-compiled signed agent binaries and database schema updates." \
        --clobber
    echo "SUCCESS: GitHub Release v${VERSION} created and assets uploaded via gh CLI!"
else
    echo "Step 4: Triggering GitHub Actions automated release pipeline..."
    echo "Git tag v${VERSION} pushed to GitHub."
    echo "GitHub Actions (.github/workflows/release.yml) will now automatically build containers and attach assets."
fi

echo
echo "============================================================"
echo "✔ Release v${VERSION} workflow complete!"
echo "GitHub Release page: https://github.com/luuvandien2604/DatrixOps/releases/tag/v${VERSION}"
echo "============================================================"
