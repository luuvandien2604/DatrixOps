# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

DevOps engineers, Site Reliability Engineers (SREs), sysadmins, and infrastructure teams managing production Linux servers, private cloud instances, network probes, and critical services.

## Product Purpose

DatrixOps is a high-density, real-time infrastructure observability and server monitoring control plane. It delivers immediate visibility into server fleet health, hardware resource pressure (CPU/RAM/Disk), network telemetry, and alert incidents without bloat, decorative latency, or cloud lock-in.

## Positioning

A lightweight, self-hostable, production-ready observability platform with single-binary agents, dynamic network quality diagnostics, and strict data separation—delivering the utilitarian clarity of Grafana and Datadog with minimal resource overhead.

## Operating Context

- Used in high-focus NOCs, devops terminals, and desktop browser sessions.
- Requires instant scanning (at-a-glance health), 150ms interaction feedback, and zero cognitive friction.
- Data updates continuously via live telemetry polling and websockets.

## Capabilities and Constraints

- **Strict Logic Preservation:** 100% preservation of all API polling loops, abort controllers, websocket handlers, data schemas, and state transitions.
- **Utilitarian Aesthetics (Anti-Slop):** Zero decorative gradients, zero giant donut charts, zero bloated radius (>8px), zero decorative icons in colored circles.
- **Typography Discipline:** Sans-serif for all UI chrome, labels, navigation, and titles. Monospace tabular-nums strictly reserved for numeric telemetry, IP addresses, and timestamps.
- **Color Discipline:** 95%+ neutral chrome; color reserved exclusively for telemetry data status (healthy, warning, critical, active metric series).

## Product Principles

1. **Information Density with Absolute Scanability:** Prioritize real telemetry and honest zero-states over whitespace and decorative padding.
2. **Data Speaks, Chrome Recedes:** Borders are 1px subtle hairlines; surfaces are flat; colors indicate system state, not decoration.
3. **Speed and Determinism:** Fast rendering, zero layout shift, predictable visual hierarchy.

