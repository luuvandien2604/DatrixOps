---
title: "Introducing DatrixOps"
description: "An overview of the DatrixOps infrastructure monitoring platform."
role: "public"
order: 1
---

# Introducing DatrixOps

DatrixOps is a lightweight control plane for monitoring and operating server infrastructure.

## Design goals

- **Clear operations:** A unified dashboard for fleet health, telemetry, and incidents.
- **Lightweight collection:** A small Go agent with minimal CPU and memory overhead.
- **Live telemetry:** Frequent CPU, memory, disk, and network heartbeats.
- **Website and SSL monitoring:** Uptime, latency, and certificate-expiration visibility.
- **Safe agent updates:** Centrally initiated upgrades without losing monitoring history.

DatrixOps is designed for system administrators, DevOps engineers, and SRE teams that need useful telemetry without a heavyweight monitoring stack.
