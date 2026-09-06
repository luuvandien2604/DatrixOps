#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-}"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

if [[ "$VERSION" == "--help" || "$VERSION" == "-h" || -z "$VERSION" ]]; then
    echo "Usage: $0 <X.Y.Z> [--yes] [--force]"
    echo "Example: $0 1.8.27"
    echo "         $0 1.8.27 --yes --force   # Re-publish/force update existing tag"
    exit 0
fi

VERSION="${VERSION#v}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Version must use X.Y.Z format (e.g. 1.8.27)"

AUTO_YES=""
FORCE=""
for arg in "${@:2}"; do
    case "$arg" in
        --yes|-y) AUTO_YES="--yes" ;;
        --force|-f) FORCE="true" ;;
        *) die "unknown option: $arg" ;;
    esac
done

TAG="v${VERSION}"
TODAY="$(date +%Y-%m-%d)"

cd "$ROOT_DIR"
[[ "$(git branch --show-current)" == "main" ]] || die "CE repository must be on branch 'main'"

git fetch --quiet origin main --tags

tag_exists=0
if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null || \
   git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
    tag_exists=1
fi

if [[ "$tag_exists" -eq 1 && "$FORCE" != "true" ]]; then
    die "CE tag ${TAG} already exists on remote (use --force to overwrite/re-publish)"
fi

info "Updating CE version to ${VERSION} across release files..."

# 1. deploy/version.json
node -e '
const fs = require("fs");
const file = "deploy/version.json";
if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.version = process.argv[1];
    data.release_date = process.argv[2];
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}
' "$VERSION" "$TODAY"

# 2. deploy/install.sh
sed -i.bak -E "s/INSTALL_VERSION=\"\\\$\{DATRIXOPS_INSTALL_VERSION:-[0-9]+\.[0-9]+\.[0-9]+\}\"/INSTALL_VERSION=\"\${DATRIXOPS_INSTALL_VERSION:-${VERSION}}\"/g" deploy/install.sh && rm -f deploy/install.sh.bak

# 3. deploy/upgrade.sh
sed -i.bak -E "s/target_app_ver=\"[0-9]+\.[0-9]+\.[0-9]+\"/target_app_ver=\"${VERSION}\"/g" deploy/upgrade.sh && rm -f deploy/upgrade.sh.bak

# 4. deploy/.env.example and .env.example
sed -i.bak -E "s/^DATRIXOPS_VERSION=[0-9]+\.[0-9]+\.[0-9]+/DATRIXOPS_VERSION=${VERSION}/g" deploy/.env.example .env.example && rm -f deploy/.env.example.bak .env.example.bak

# 5. deploy/docker-compose.yml
sed -i.bak -E "s/DATRIXOPS_VERSION:-[0-9]+\.[0-9]+\.[0-9]+/DATRIXOPS_VERSION:-${VERSION}/g" deploy/docker-compose.yml && rm -f deploy/docker-compose.yml.bak
sed -i.bak -E "s/datrixops-migrate:\\\$\{DATRIXOPS_VERSION:-[0-9]+\.[0-9]+\.[0-9]+\}/datrixops-migrate:\${DATRIXOPS_VERSION:-${VERSION}}/g" deploy/docker-compose.yml && rm -f deploy/docker-compose.yml.bak
sed -i.bak -E "s/datrixops-backend:\\\$\{DATRIXOPS_VERSION:-[0-9]+\.[0-9]+\.[0-9]+\}/datrixops-backend:\${DATRIXOPS_VERSION:-${VERSION}}/g" deploy/docker-compose.yml && rm -f deploy/docker-compose.yml.bak
sed -i.bak -E "s/datrixops-worker:\\\$\{DATRIXOPS_VERSION:-[0-9]+\.[0-9]+\.[0-9]+\}/datrixops-worker:\${DATRIXOPS_VERSION:-${VERSION}}/g" deploy/docker-compose.yml && rm -f deploy/docker-compose.yml.bak
sed -i.bak -E "s/datrixops-frontend:\\\$\{DATRIXOPS_VERSION:-[0-9]+\.[0-9]+\.[0-9]+\}/datrixops-frontend:\${DATRIXOPS_VERSION:-${VERSION}}/g" deploy/docker-compose.yml && rm -f deploy/docker-compose.yml.bak

# 6. docker-compose.yml
sed -i.bak -E "s/datrixops-migrate:\\\$\{DATRIXOPS_VERSION:-[0-9]+\.[0-9]+\.[0-9]+\}/datrixops-migrate:\${DATRIXOPS_VERSION:-${VERSION}}/g" docker-compose.yml && rm -f docker-compose.yml.bak
sed -i.bak -E "s/datrixops-backend:\\\$\{DATRIXOPS_VERSION:-[0-9]+\.[0-9]+\.[0-9]+\}/datrixops-backend:\${DATRIXOPS_VERSION:-${VERSION}}/g" docker-compose.yml && rm -f docker-compose.yml.bak
sed -i.bak -E "s/datrixops-worker:\\\$\{DATRIXOPS_VERSION:-[0-9]+\.[0-9]+\.[0-9]+\}/datrixops-worker:\${DATRIXOPS_VERSION:-${VERSION}}/g" docker-compose.yml && rm -f docker-compose.yml.bak
sed -i.bak -E "s/datrixops-frontend:\\\$\{DATRIXOPS_VERSION:-[0-9]+\.[0-9]+\.[0-9]+\}/datrixops-frontend:\${DATRIXOPS_VERSION:-${VERSION}}/g" docker-compose.yml && rm -f docker-compose.yml.bak

if [[ "$AUTO_YES" != "--yes" ]]; then
    echo
    echo "Working tree status:"
    git status -s
    echo
    echo "This will commit, push, and release CE tag ${TAG} to trigger automated GHCR container builds."
    read -r -p "Publish CE ${TAG}? [y/N] " answer
    [[ "$answer" =~ ^[Yy]$ ]] || die "release cancelled"
fi

git add backend/ deploy/ frontend/ .env.example docker-compose.yml docker-compose.prod.yml scripts/
git commit -m "chore(release): release CE Server v${VERSION} with full features enabled and self-monitor isolation" || info "Nothing new to commit"
git push origin main

if [[ "$FORCE" == "true" ]]; then
    git tag -f -a "$TAG" -m "DatrixOps CE Server v${VERSION}"
    git push -f origin "$TAG"
else
    git tag -a "$TAG" -m "DatrixOps CE Server v${VERSION}"
    git push origin "$TAG"
fi

echo
echo "============================================================"
echo "🎉 SUCCESS: Released CE tag ${TAG}!"
echo "GitHub Actions is now building and publishing CE container images:"
echo "  - ghcr.io/luuvandien2604/datrixops-backend:${VERSION}"
echo "  - ghcr.io/luuvandien2604/datrixops-frontend:${VERSION}"
echo "  - ghcr.io/luuvandien2604/datrixops-worker:${VERSION}"
echo "  - ghcr.io/luuvandien2604/datrixops-migrate:${VERSION}"
echo "============================================================"
