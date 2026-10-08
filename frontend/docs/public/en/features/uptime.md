---
title: Website & SSL Monitoring
description: Track website uptime, HTTP response codes, latency, and SSL certificate expiration.
---

# Website & SSL Monitoring

DatrixOps includes automated web service and SSL certificate monitoring. You can continuously verify that your mission-critical websites, customer APIs, and external web portals are accessible, responding rapidly, and protected by valid SSL/TLS certificates.

---

## What It Monitors

1. **Uptime & Availability**: Periodic HTTP/HTTPS requests to verify your endpoint is up and returning valid response codes.
2. **Response Time (Latency)**: Tracks end-to-end response time in milliseconds, helping detect degraded server performance before total downtime occurs.
3. **SSL Certificate Expiration**: Automatically inspects the TLS certificate on HTTPS endpoints, recording issuer details and remaining validity days.

---

## Adding a Website to Monitor

1. Navigate to **Uptime** (`/dashboard/websites`) in the sidebar navigation.
2. Click the **Add Website** button in the top-right corner.
3. Fill in the endpoint parameters:
   - **Name**: A recognizable title (e.g., `Customer Portal` or `Payment API`).
   - **URL**: Full web address including protocol (e.g., `https://example.com` or `https://api.example.com/health`).
   - **Check Interval**: How frequently to test the endpoint (default: `60 seconds`).
   - **Expected Status Code**: HTTP response code indicating success (default: `200`).
   - **Request Timeout**: Maximum duration to wait for a response before declaring a timeout (default: `10 seconds`).
4. Click **Save** to begin monitoring immediately.

---

## Inspecting Website Health & SSL Status

The **Uptime** overview lists all monitored websites with at-a-glance status indicators:

### 1. Availability Status
- **Up (Green)**: Endpoint is healthy and returned the expected HTTP status code.
- **Down (Red)**: Endpoint returned an error status (e.g., `500 Internal Server Error`, `502 Bad Gateway`, `404 Not Found`) or failed to connect within the timeout threshold.

### 2. SSL/TLS Certificate Details
For any HTTPS website, DatrixOps automatically audits the certificate chain:
- **Issuer**: Certificate Authority (e.g., `Let's Encrypt`, `Cloudflare Inc`, `DigiCert`).
- **Days Remaining**: Countdown of days until expiration.
- **Expiration Date**: Exact expiration timestamp.
- **SSL Warnings**:
  - **Warning**: Fewer than `30 days` remaining.
  - **Critical**: Fewer than `7 days` remaining or expired.

### 3. Response Time & Latency Graphs
Click on any website to inspect its latency metrics:
- **Current Latency**: Average response time for the latest check cycle.
- **Latency History**: Interactive chart showing response speed trends over 24 hours, 7 days, or 30 days.
- **Uptime Percentage**: Availability ratio calculated across the chosen timeframe (e.g., `99.98%`).

---

## Incident History & Downtime Logs

When an outage occurs, DatrixOps logs an incident entry containing:
- **Start Time & Duration**: When the downtime began and how long it lasted.
- **Failure Reason**: The exact error message (e.g., `HTTP 502 Bad Gateway`, `Connection refused`, `Certificate expired`, or `Read timeout`).
- **Resolution Timestamp**: Exactly when the service returned to healthy status.

---

## Next Steps

- Link website incidents to Telegram or Discord in [Alerts & Notifications](/docs/features/alerts).
- Monitor underlying server resources in [Server & Resource Monitoring](/docs/features/servers).
