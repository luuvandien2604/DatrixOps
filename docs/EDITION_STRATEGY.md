# DatrixOps Edition Strategy

This document defines the first split between DatrixOps Community Edition and
DatrixOps Cloud. The goal is to keep the open-source product clean while leaving
room for managed SaaS operations without forking core behavior by accident.

## Editions

| Area | Community Edition | DatrixOps Cloud |
|---|---|---|
| Repository | Public CE repository | Private cloud overlay repository |
| Control Plane | Self-hosted by the user | Operated by DatrixOps |
| Agent | Open source, same protocol | Open source, same protocol |
| Updates | User runs `upgrade.sh`; optional local cron | CI/CD managed rollout |
| Agent releases | Signed release artifacts mirrored or served by CE Control Plane | Signed release artifacts served by Cloud/CDN |
| Backups | User-owned `backup.sh` / `restore.sh` | Managed backup policies and recovery |
| AI features | Not included in CE core | Cloud-only services |
| SLA/support | Community support | Managed support/SLA |

## Runtime Flags

Community Edition defaults:

```env
DATRIXOPS_EDITION=community
DEPLOYMENT_MODE=self-hosted
```

Cloud runtime should set:

```env
DATRIXOPS_EDITION=cloud
DEPLOYMENT_MODE=managed
```

`DATRIXOPS_EDITION` is the product boundary. `DEPLOYMENT_MODE` describes who
operates the running control plane and where operational responsibility sits.

## Repository Split

Recommended layout:

```text
datrixops
  Public repository for Community Edition, the open-source Agent, install,
  upgrade, backup, restore, and public docs.

datrixops-cloud
  Private repository for SaaS deployment, cloud-only services, billing,
  AI workflows, managed backups, rollout automation, and internal runbooks.
```

The Cloud repository should consume CE artifacts instead of copying source when
possible. If Cloud needs to extend the backend or frontend, keep the extension
behind explicit edition checks or in cloud-only packages/modules.

## Release Ownership

Production VPS instances should not build or sign releases. Release authority
lives in CI/CD:

```text
Git tag
  -> CI builds backend/frontend/worker/migrate images
  -> CI builds Agent binaries
  -> CI signs Agent manifest with Ed25519
  -> CI publishes GHCR images and release metadata
  -> CE users pull with upgrade.sh
  -> Cloud deploys pinned artifacts through its own pipeline
```

The Ed25519 private key must stay in CI secret storage or an offline signing
environment. Cloud production hosts should only pull and run already-published
artifacts.

## CE Update Contract

Community Edition update behavior should remain explicit:

1. `upgrade.sh` creates a backup before changing the control plane.
2. It fetches release metadata and Agent artifacts.
3. It pulls prebuilt container images.
4. It runs migrations.
5. It recreates services and verifies health.
6. Remote Agents update only after the CE Control Plane advertises the matching
   `AGENT_VERSION` and queues a signed `agent_update` task.

Cloud can add managed rollout policies later without changing the Agent protocol.
