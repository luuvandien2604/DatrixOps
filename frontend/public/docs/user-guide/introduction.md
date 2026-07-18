# Introducing DatrixOps

Welcome to **DatrixOps**, a focused and efficient platform for professional server and VPS monitoring.

## Why DatrixOps?

Instead of connecting to every server over SSH and running tools such as `htop`, DatrixOps brings CPU, memory, disk, and network telemetry into one dashboard.

### Key capabilities

- **Real-time monitoring:** CPU, memory, network, and disk charts update continuously from agent heartbeats.
- **Time-series charts:** Review up to seven days of history with automatic downsampling for responsive visualization.
- **Lightweight agent:** A single Go binary with no Node.js or Python runtime dependency and a memory footprint below 10 MB.
- **Secure by design:** No inbound port is required on monitored servers. The agent only makes outbound requests to the control plane.

## System architecture

DatrixOps has two primary components:

1. **DatrixOps Dashboard:** The server-side control plane where operators sign in, manage infrastructure, and review telemetry.
2. **DatrixOps Agent:** A small background service installed on every server that collects system telemetry and sends it to the dashboard.

Continue to the installation guide to connect your first agent.
