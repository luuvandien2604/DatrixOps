# Feature Ownership

## Shared Core Features

Develop these in Community first:

- Monitoring, alerts, Docker management, terminal, authentication core.
- Agent enrollment, heartbeat, metrics, task and signed update protocols.
- Core backend APIs, frontend dashboards, and core migrations.
- Self-host install, upgrade, backup, restore, and shared security fixes.

Workflow:

```text
develop in CE
  -> test community-ip-http and community-domain-https profiles
  -> merge/release CE when appropriate
  -> synchronize selected CE commit into Cloud
  -> run Cloud compatibility tests
```

## Cloud-Only Features

Develop these only in `DatrixOps-cloud`:

- Organizations, workspaces, teams, subscriptions, billing, usage metering.
- AI diagnosis, AI automation, managed backup, analytics, rollout policies.
- Cloud tenancy, Cloud-only migrations, private infrastructure.

Cloud-only backend code must live under `backend/internal/cloud/`. Cloud-only
frontend code must live under `frontend/src/cloud/`,
`frontend/src/components/cloud/`, or `frontend/src/lib/cloud/`.

## Hybrid Features

Put reusable protocol and security primitives in CE, then implement Cloud policy
extensions in Cloud.

Example:

```text
Agent signed update engine in CE
  -> Cloud canary/wave rollout policy in Cloud
```
