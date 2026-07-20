---
title: "Versions and updates"
description: "Check the running version, update one or many Agents, and understand heartbeat confirmation."
---

The version in the server header and **Running Agent Version** comes from the heartbeat of the binary that is actually running. That heartbeat—not task acknowledgement or download completion—is the final confirmation.

## Update available

The Backend uses `AGENT_VERSION` as the current release and compares it with the Agent-reported version. When they differ, the Frontend displays **Update available**. The Backend value and published release must match. The production publisher exposes and verifies the signed release through public HTTPS before changing `AGENT_VERSION`, so Agents cannot be sent to a release that the Frontend does not serve yet.

## Update one Agent

1. Open **Servers** and select a server.
2. Select **Update available** or the update action in Overview.
3. Confirm the operation.
4. Follow queued → claimed/processing → restart pending → confirmed, failed, or timed out.
5. Treat the update as successful only after a heartbeat reports the target version.

Update state is persisted in the Backend, so refreshing or navigating away should not erase actual progress.

## Update all agents

Select **Update all agents** on the Servers page. The Backend creates a separate task for each Agent that needs an update and prevents two active updates for the same server. An offline Agent can receive its task after reconnecting if the task has not expired.

> **Important:** Update tasks do not contain the Agent Token. The Agent retains its service configuration and downloads the artifact for its own OS and architecture.

## Verification workflow

For Agents that support the current update payload:

1. The Backend adds `target_version` and the release base URL.
2. The Agent downloads `manifest.json` and `manifest.sig`.
3. It verifies the Ed25519 signature with the embedded public key.
4. It validates the schema and selects its `GOOS/GOARCH` artifact.
5. It verifies size, SHA-256, executable format, and version marker.
6. It replaces/stages the binary and asks systemd, launchd, or Task Scheduler to restart it.
7. The Backend keeps the task processing until a heartbeat reports the target version.

## Legacy Agents

Very old Agents do not understand the current response envelope or updater. They may require one token-free manual update.

Linux/macOS:

```bash
curl -fsSL https://datrixops.vandien.space/update-agent.sh | sudo sh
```

Windows PowerShell Administrator:

```powershell
irm https://datrixops.vandien.space/update-agent.ps1 | iex
```

These scripts preserve the existing token and service configuration. The installer-compatible manual updater validates executable format, while the newer self-update path performs signed-manifest verification.

## Failed updates

- Read the persisted task state in Overview.
- Inspect Agent logs for manifest, signature, checksum, permission, or restart errors.
- Confirm that release URLs serve the target version and Backend `AGENT_VERSION` matches it.
- If every operating system fails at once, check whether `/releases/<VERSION>/manifest.json` and `manifest.sig` are served by the current Frontend container. Recreate Frontend once after deploying the runtime `frontend/public` mount.
- Ensure the service manager is configured to restart the Agent.

> **Warning:** Automatic rollback after a new binary fails to heartbeat is not complete. Keep immutable old releases and a manual binary-replacement procedure. Never publish different bytes under an existing version.
