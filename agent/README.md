# DatrixOps Agent

The DatrixOps Agent runs on each monitored server and sends host metrics,
inventory and task results to your self-hosted DatrixOps Control Plane.

## Install

Do not copy a generic command from this repository. Open
**Dashboard → Servers → Add Server**, select the target operating system and run
the generated command on that server. It contains a short-lived enrollment
token and the release URL/version selected by your Control Plane.

## Connection and privacy

- The Agent initiates outbound HTTPS/WebSocket connections.
- Every server receives a unique Agent credential.
- Metrics are sent only to the Control Plane URL in the Agent configuration.
- Updates verify an Ed25519-signed manifest, target platform, file size and
  SHA-256 before replacing the running binary.
- The full Agent source remains available in this directory for security audit.

## Linux service

```bash
sudo systemctl status datrixops-agent
sudo journalctl -u datrixops-agent -n 200 --no-pager
```

Configuration is stored at `/etc/datrixops/agent.env`; keep it readable only by
root. For installation and troubleshooting, use the Control Plane documentation
or [Community installation guide](../docs/INSTALLATION.md).
