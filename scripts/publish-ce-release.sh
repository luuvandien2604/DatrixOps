#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-}"
AUTO_YES="${2:-}"
REPOSITORY="luuvandien2604/DatrixOps"

die() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

if [[ "$VERSION" == "--help" || "$VERSION" == "-h" ]]; then
    echo "Usage: $0 X.Y.Z [--yes]"
    exit 0
fi
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must use X.Y.Z format"
[[ -z "$AUTO_YES" || "$AUTO_YES" == "--yes" ]] || die "unknown option: $AUTO_YES"

for command in git curl jq; do
    command -v "$command" >/dev/null 2>&1 || die "required command is missing: $command"
done

cd "$ROOT"
[[ "$(git branch --show-current)" == "main" ]] || die "switch to the main branch first"
[[ -z "$(git status --porcelain)" ]] || die "working tree must be clean"

git fetch --quiet origin main --tags
HEAD_SHA="$(git rev-parse HEAD)"
[[ "$HEAD_SHA" == "$(git rev-parse origin/main)" ]] || die "local main must exactly match origin/main"
[[ "$(jq -r '.version' deploy/version.json)" == "$VERSION" ]] || die "run prepare-ce-release.sh $VERSION first"
[[ "$(jq -r '.agent_version' deploy/version.json)" == "$VERSION" ]] || die "Agent version does not match $VERSION"

for file in .env.example deploy/.env.example; do
    grep -q "^DATRIXOPS_VERSION=${VERSION}$" "$file" || die "$file has a mismatched application version"
    grep -q "^AGENT_VERSION=${VERSION}$" "$file" || die "$file has a mismatched Agent version"
done

if git rev-parse -q --verify "refs/tags/v${VERSION}" >/dev/null || \
   git ls-remote --exit-code --tags origin "refs/tags/v${VERSION}" >/dev/null 2>&1; then
    die "tag v${VERSION} already exists and must not be reused"
fi

info "Checking required GitHub Actions runs for ${HEAD_SHA}..."
RUNS="$(curl -fsSL "https://api.github.com/repos/${REPOSITORY}/actions/runs?head_sha=${HEAD_SHA}&event=push&per_page=50")"
required_workflows=(
    "DatrixOps CI"
    "Installer & Updater Tests"
    "Build and Push Docker Images to GHCR"
)
for workflow in "${required_workflows[@]}"; do
    conclusion="$(jq -r --arg name "$workflow" '[.workflow_runs[] | select(.name == $name)][0].conclusion // "missing"' <<<"$RUNS")"
    [[ "$conclusion" == "success" ]] || die "$workflow is $conclusion for $HEAD_SHA"
    echo "OK: $workflow"
done

if [[ "$AUTO_YES" != "--yes" ]]; then
    echo
    echo "This publishes immutable tag v${VERSION} from ${HEAD_SHA}."
    read -r -p "Publish CE v${VERSION}? [y/N] " answer
    [[ "$answer" =~ ^[Yy]$ ]] || die "release cancelled"
fi

git tag -a "v${VERSION}" -m "DatrixOps CE v${VERSION}"
git push origin "v${VERSION}"

echo
echo "SUCCESS: release tag v${VERSION} was pushed."
echo "FOLLOW: https://github.com/${REPOSITORY}/actions/workflows/release.yml"
