# DatrixOps Agent 🚀

Official lightweight, high-performance open-source monitoring agent for [DatrixOps](https://github.com/luuvandien2604/DatrixOps).

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.25%2B-00ADD8.svg)](https://golang.org)
[![Security Status](https://img.shields.io/badge/Security-Open_Source_100%25-brightgreen.svg)](#security--privacy)

## 📌 Overview

`datrixops-agent` is designed to run silently on target host systems (Linux VPS / Bare-metal servers). It collects real-time system performance metrics (CPU, Memory, Disk usage, Network I/O, Active Processes) and streams encrypted telemetry back to your self-hosted or cloud DatrixOps Control Plane.

## 🛡️ Security & Privacy Guarantee

- **100% Open Source**: You can inspect every line of code. No backdoors, no telemetry tracking, zero data mining.
- **Minimal Permissions**: Operates strictly within system monitoring scope.
- **Secure Communication**: All metric payloads are transmitted via HTTPS / WebSockets with HMAC signature verification and SHA256 authentication tokens.

## 🛠️ Building from Source

To build the agent binary locally:

```bash
git clone https://github.com/luuvandien2604/datrixops-agent.git
cd datrixops-agent
go build -ldflags="-s -w" -o datrixops-agent ./cmd/agent
```

## 📦 One-Click Installation

To enroll a host system into your DatrixOps Dashboard:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/datrixops-agent/main/install-agent.sh | sudo bash -s -- --token YOUR_AGENT_TOKEN --server https://your-datrixops-domain.com
```

## 📄 License

This project is licensed under the Apache 2.0 License.
