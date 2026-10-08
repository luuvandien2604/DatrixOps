---
title: "Website & SSL Monitoring"
description: "Monitor website uptime, HTTP response times, and TLS/SSL certificate expirations automatically."
---

The **Website & SSL Monitoring** capability in DatrixOps continuously tracks external websites, public APIs, and web services without requiring an agent installed on the target machine.

---

## 1. Adding a Monitored Website

Navigate to **Dashboard → Websites → Add Website**:
- **Friendly Name:** Display name for the service.
- **Target URL:** Complete HTTP/HTTPS URL (e.g. `https://mycompany.com`).
- **Interval:** Probe interval frequency (default 60 seconds).
- **Expected Status:** Expected HTTP response code (typically `200` or 2xx/3xx).
- **Timeout:** Maximum connection and read timeout (e.g. 10 seconds).

---

## 2. Tracked Metrics

1. **Uptime Percentage:**
   - Evaluated over 24-hour, 7-day, and 30-day windows.
   - Downtime incidents are logged whenever a non-expected status or timeout occurs.
2. **Response Time (ms):**
   - Historical graph of HTTP latency per probe.
3. **SSL Certificate Expiration:**
   - Inspects target certificate issuer, validity date range, and **remaining days until expiration**.
   - Proactive warnings at 30, 14, and 7 days before certificate expiry.

---

## 3. Worker Execution Model

Probes are processed asynchronously by the **`worker`** container (`websiteJob`) on a scheduled interval. The evaluation does not impact the interactive API Server (`backend`).
When downtime or certificate expiration is detected, automated alerts are dispatched to configured channels (Telegram, Discord, Email).
