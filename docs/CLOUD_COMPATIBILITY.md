# Cloud Compatibility Contracts

DatrixOps Cloud must consume the Community core through stable contracts instead
of copying and editing core source independently.

## Versioning Policy

- Community is the source of truth for Agent protocol, CE REST API behavior,
  update manifests, and CE database migrations.
- Cloud pins one exact Community release at a time.
- Production Cloud deployments must use versioned images, never `latest`.
- Breaking protocol changes require a documented compatibility note, test
  fixture, and a minimum supported Agent version.

## Required Shared Contracts

| Contract | Source of truth | Current transport/schema | Compatibility rule |
|---|---|---|---|
| Agent enrollment | Community backend `agent_api` | HTTPS REST with enrollment token | Additive fields only; old Agents must continue enrolling until minimum version is raised |
| Agent authentication | Community backend/API middleware | Agent token over HTTPS | Token format changes require migration and dual-acceptance window |
| Heartbeat | Community Agent and backend `agent_api` | HTTPS JSON payload | Additive JSON fields are allowed; required fields need version gate |
| Metrics payload | Community Agent collector/backend metrics table | HTTPS JSON and PostgreSQL schema | Preserve existing metric names and units |
| Server tasks | Community backend and Agent dispatcher | Tasks returned in heartbeat response | New task types require Agent capability/version checks |
| Alert events | Community alert/webhook modules | Event type plus JSON metadata | New event fields are additive; event names are versioned by string |
| Terminal messages | Community terminal backend/frontend/Agent | WebSocket JSON messages | Message type changes require backward-compatible handlers |
| Docker operations | Community server task API and Agent Docker handler | Task payload JSON | Payload changes require validation and version gate |
| Agent update manifest | `agent/internal/update` and release tooling | `manifest.json` plus Ed25519 `manifest.sig` | Schema version increments for breaking changes |
| Health endpoints | Community backend/worker/gateway | HTTP `/health/live`, `/health/ready` | Cloud probes must keep using stable health URLs |

## Cloud Consumption Model

Cloud should start with versioned Community images:

```yaml
community:
  repository: luuvandien2604/DatrixOps
  version: "1.5.5"

images:
  backend: "ghcr.io/luuvandien2604/datrixops-backend:1.5.5"
  frontend: "ghcr.io/luuvandien2604/datrixops-frontend:1.5.5"
  worker: "ghcr.io/luuvandien2604/datrixops-worker:1.5.5"
  migrate: "ghcr.io/luuvandien2604/datrixops-migrate:1.5.5"
```

Cloud-only services should integrate through REST APIs, events, queues, or
Cloud-owned database tables. Do not import Community source with a relative path
outside the Cloud repository.

## Test Fixtures to Add Next

- Agent heartbeat fixture for the current Agent version.
- Agent update manifest fixture with valid and invalid signatures.
- Terminal WebSocket message fixture.
- Alert webhook event fixture.
- Health probe smoke test fixture for backend, frontend, worker, and gateway.
