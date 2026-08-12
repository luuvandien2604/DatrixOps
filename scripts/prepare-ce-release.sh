#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-}"
AUTO_YES="${2:-}"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

if [[ "$VERSION" == "--help" || "$VERSION" == "-h" ]]; then
    echo "Usage: $0 X.Y.Z [--yes]"
    exit 0
fi
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must use X.Y.Z format"
[[ -z "$AUTO_YES" || "$AUTO_YES" == "--yes" ]] || die "unknown option: $AUTO_YES"

for command in git perl jq go npm; do
    command -v "$command" >/dev/null 2>&1 || die "required command is missing: $command"
done

cd "$ROOT"
[[ "$(git branch --show-current)" == "main" ]] || die "switch to the main branch first"
[[ -z "$(git status --porcelain)" ]] || die "working tree must be clean"

info "Refreshing origin/main and release tags..."
git fetch --quiet origin main --tags
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || die "local main must exactly match origin/main"

CURRENT_VERSION="$(jq -r '.version' deploy/version.json)"
[[ "$CURRENT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "deploy/version.json has an invalid version"

IFS=. read -r current_major current_minor current_patch <<<"$CURRENT_VERSION"
IFS=. read -r next_major next_minor next_patch <<<"$VERSION"
if (( next_major < current_major )) || \
   (( next_major == current_major && next_minor < current_minor )) || \
   (( next_major == current_major && next_minor == current_minor && next_patch <= current_patch )); then
    die "new version $VERSION must be greater than current version $CURRENT_VERSION"
fi

if git rev-parse -q --verify "refs/tags/v${VERSION}" >/dev/null || \
   git ls-remote --exit-code --tags origin "refs/tags/v${VERSION}" >/dev/null 2>&1; then
    die "tag v${VERSION} already exists; choose a new version"
fi

release_files=(
    .env.example
    README.md
    deploy/.env.example
    deploy/docker-compose.yml
    deploy/upgrade.sh
    deploy/version.json
    docker-compose.prod.yml
    docker-compose.yml
    docs/INSTALLATION.md
    frontend/docs/public/en/getting-started/installation.md
    frontend/docs/public/getting-started/installation.md
    frontend/src/app/dashboard/servers/page.tsx
)

info "Updating release references: ${CURRENT_VERSION} -> ${VERSION}"
OLD_VERSION="$CURRENT_VERSION" NEW_VERSION="$VERSION" \
    perl -0pi -e 's/\Q$ENV{OLD_VERSION}\E/$ENV{NEW_VERSION}/g' -- "${release_files[@]}"

RELEASE_DATE="$(date -u +%Y-%m-%d)" \
    perl -0pi -e 's/("release_date"\s*:\s*")[^"]+/$1$ENV{RELEASE_DATE}/' -- deploy/version.json

for file in .env.example deploy/.env.example; do
    grep -q "^DATRIXOPS_VERSION=${VERSION}$" "$file" || die "$file does not pin DATRIXOPS_VERSION=${VERSION}"
    grep -q "^AGENT_VERSION=${VERSION}$" "$file" || die "$file does not pin AGENT_VERSION=${VERSION}"
done
[[ "$(jq -r '.version' deploy/version.json)" == "$VERSION" ]] || die "application version was not updated"
[[ "$(jq -r '.agent_version' deploy/version.json)" == "$VERSION" ]] || die "Agent version was not updated"

info "Running release gates..."
test -z "$(gofmt -l $(find backend agent -name '*.go'))"
(cd backend && go test ./... && go vet ./...)
(cd agent && go test ./... && go vet ./...)
(cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build)
bash -n scripts/*.sh frontend/public/*.sh deploy/*.sh
bash tests/release-pipeline.sh
git diff --check

git diff --stat
if [[ "$AUTO_YES" != "--yes" ]]; then
    read -r -p "Commit and push CE v${VERSION} preparation to main? [y/N] " answer
    [[ "$answer" =~ ^[Yy]$ ]] || {
        info "Changes are ready for review but were not committed."
        exit 0
    }
fi

git add -- "${release_files[@]}"
git diff --cached --check
git commit -m "chore(release): prepare CE v${VERSION}"
git push origin main

echo
echo "SUCCESS: CE v${VERSION} preparation was pushed."
echo "NEXT: wait for main CI, then run: ./scripts/publish-ce-release.sh ${VERSION}"
