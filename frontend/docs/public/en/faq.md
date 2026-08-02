---
title: "Frequently asked questions"
description: "Answers based on capabilities currently implemented in DatrixOps."
---

## Does DatrixOps require an open SSH port?

Not for metrics. The Agent connects outbound over HTTPS. Web Terminal uses a reverse WebSocket and stores no SSH credentials, but the UI currently enables it only for eligible Linux servers.

## Which operating systems are supported?

Release artifacts exist for Linux amd64/arm64, macOS Intel/Apple Silicon, and Windows amd64. Native services, cron, Docker, and terminal support vary by operating system.

## How often does data update?

Heartbeats use the Agent interval, while process, service, and Docker snapshots are sent roughly every 60 seconds. Remote tasks are delivered through heartbeat polling.

## Why does a chart contain gaps?

A gap means no metric arrived during that interval, usually because the Agent was offline or its heartbeat failed. DatrixOps does not interpolate missing samples.

## Does clicking update mean it has finished?

No. Queued or claimed means only that the task exists or was received. Completion requires the Agent to restart and send a heartbeat with the target version.

## Does Update all agents share one token?

No. The Backend creates a task for each server record, and each Agent continues to authenticate with its own existing token.

## Is Agent rollback automatic?

Not completely. The updater verifies artifacts before replacement and the service manager attempts a restart, but there is no complete watchdog rollback when the new binary fails to heartbeat.

## Does deleting a server uninstall its Agent?

No. Removing the Dashboard record and uninstalling the host service are separate operations. Follow [Install the Agent](/docs/en/getting-started/installation) for removal commands.

## Does DatrixOps replace Prometheus or a SIEM?

Do not assume that it does. DatrixOps currently focuses on fleet telemetry, selected remote tasks, basic alerts, website/SSL monitoring, and Agent lifecycle. Some Network, Performance, Security, and Logs areas remain in development.

