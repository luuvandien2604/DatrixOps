---
title: "Connections and signed updates"
description: "Understand Agent authentication, signed releases, checksums, and user security responsibilities."
---

## Agent–Server connection

The Agent sends outbound HTTPS heartbeats to `/api/v1/agent/heartbeat` with its Agent Token in `Authorization: Bearer …`. The Backend compares that token with the server record. This is separate from the JWT used by a browser session.

Metrics do not require an inbound port. Reverse terminal also starts with an outbound Agent WebSocket, but no shell is opened until the Backend accepts a ticket created by an authenticated user.

## Signed Agent updates

A release manifest describes the version, publication time, and artifacts for every OS/architecture. The manifest is signed with Ed25519. Agents embed the public key used to verify signatures; the private signing key is never shipped in the Agent or Dashboard.

Ed25519 verifies that the manifest was produced by the release-key holder and was not modified. SHA-256 then verifies that the downloaded binary matches the signed manifest byte for byte.

The Agent rejects an update when:

- The signature is invalid.
- The schema or target version is wrong.
- No artifact exists for the current OS/architecture.
- Size or SHA-256 does not match.
- The file is not a valid executable for that platform.
- The expected version marker is missing.

> **Note:** TLS protects transport, while the release signature and checksum protect artifact authenticity and integrity. These layers complement one another.

## Protect tokens and installation commands

- Paste installation commands only into the intended server.
- Never commit, screenshot, or publicly share a token.
- If a token may be exposed, remove/re-register the server according to the available workflow.
- Restrict DatrixOps accounts because remote tasks can change managed machines.
- Keep the host OS, CA certificates, and service manager current.

## Current security boundaries

Backend CORS currently allows origin `*`; production should constrain it at the reverse proxy or Backend. Web Terminal has audited metadata and a timeout, but it is a privileged shell rather than a command allowlist. DatrixOps does not replace host hardening, firewall policy, least privilege, or backups.

