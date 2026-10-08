---
title: Frequently Asked Questions
description: Common questions about hardware overhead, firewall ports, storage, and security.
---

# Frequently Asked Questions (FAQ)

Find answers to common questions about DatrixOps architecture, resource utilization, networking requirements, and operational best practices.

---

## General & Architecture

### What is the overhead of the DatrixOps Agent?
The DatrixOps Agent is written in pure Go and compiled into a lean, native binary without heavy external runtimes.
- **CPU**: Consumes less than `0.2%` to `0.5%` of a single CPU core under normal conditions.
- **Memory (RAM)**: Typically consumes between `12 MB` and `20 MB` of resident memory.
- **Disk I/O**: Performs negligible disk activity since metrics are streamed in-memory over outbound network connections.

### Does the Agent require open inbound ports on my servers?
**No.** Monitored servers do not need any open inbound ports. The DatrixOps Agent initiates **outbound** connections exclusively (over TCP port `443` or `80`) to the DatrixOps control plane. All features—including real-time metric streaming and interactive Web Terminal sessions—operate entirely over these secure outbound reverse channels.

### How many servers can a single DatrixOps instance monitor?
A modest virtual machine (2 vCPUs, 4 GB RAM, and SSD storage) can comfortably handle **50 to 100+ active agents** reporting metrics at the standard 30-second interval. For larger installations, scale up CPU and adjust the metrics retention window in `.env`.

---

## Networking & Firewalls

### Can I run DatrixOps behind Cloudflare or a corporate proxy?
**Yes.** DatrixOps works seamlessly behind reverse proxies, CDNs, and load balancers. However, because features like the real-time metric streams and Web Terminal rely on WebSockets, ensure that:
1. **WebSockets are enabled** on your proxy or CDN (e.g., Cloudflare $\rightarrow$ Network $\rightarrow$ WebSockets: ON).
2. HTTP headers `Upgrade`, `Connection`, and `Host` are forwarded to the DatrixOps gateway.

### Can I monitor servers that have dynamic IP addresses or are behind NAT?
**Yes.** Because the Agent calls out to the DatrixOps control plane, servers behind corporate NAT, residential dynamic IPs, mobile hotspots, or private cloud VPCs can be monitored without issue.

---

## Data Management & Security

### Where is my monitoring data stored?
All data is stored directly on your server inside the SQLite database (`/opt/datrixops/data/datrixops.db`). DatrixOps Community Edition does not send your metric data, server metadata, or credentials to any third-party external cloud service.

### How does automatic metric retention work?
To keep database performance high and prevent disk exhaustion, DatrixOps automatically prunes old raw metrics based on the `METRICS_RETENTION_DAYS` variable in your `.env` file (default: `7 days`). Operational history and audit logs are retained for `OPERATIONAL_RETENTION_DAYS` (default: `90 days`).

### What happens if the DatrixOps server is temporarily offline?
If your central DatrixOps server restarts or experiences brief maintenance:
- The Agent continues running silently on each host without crashing.
- It automatically attempts to reconnect using exponential backoff.
- As soon as the DatrixOps server returns online, all agents reconnect automatically without requiring manual operator intervention.

---

## Community & Updates

### How do I upgrade my DatrixOps server?
Run the built-in management utility:
```bash
sudo datrix upgrade
```
The updater creates a safe pre-upgrade backup, pulls the latest Docker images, runs database migrations, and restarts the stack cleanly.

---

## Still have questions?

- Check [Common Issues & Solutions](/docs/troubleshooting/common-issues) for operational diagnostics.
- Visit the official repository at [GitHub](https://github.com/luuvandien2604/DatrixOps) to submit feedback or feature suggestions.
