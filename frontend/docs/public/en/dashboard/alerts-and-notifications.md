---
title: "Alerts & Notifications"
description: "Configure Alert Center rules, notification channels (Discord, Telegram, Email), and incident lifecycles."
---

The **Alert Center** in DatrixOps monitors infrastructure telemetry in real time and dispatches instant multi-channel alerts (Discord, Telegram, Email) whenever thresholds are breached.

---

## 1. Notification Channels Setup

Navigate to **Dashboard → Alerts → Notification Channels**:

### 📢 Discord Webhook
1. In Discord channel settings, choose **Integrations → Webhooks → New Webhook**.
2. Copy the **Webhook URL** (`https://discord.com/api/webhooks/...`).
3. Paste into DatrixOps and send a test message to verify delivery.

### 📱 Telegram Bot
1. Create a bot using **@BotFather** to obtain a **Bot Token** (`123456789:ABC...`).
2. Add the bot to your channel/group or open a chat and run `/start`.
3. Provide your **Chat ID** and Bot Token in DatrixOps.
4. Send a test message to confirm.

### 📧 SMTP Email
1. Configure your outgoing mail server parameters:
   - **SMTP Host & Port** (e.g. `smtp.gmail.com:587` with STARTTLS or `465` with SSL).
   - **Authentication:** Username and App Password.
   - **From / To Addresses:** Sender and recipient addresses.
2. Send a test email to verify configuration.

---

## 2. Alert Rules Configuration

Navigate to **Dashboard → Alerts → Alert Rules**:

| Rule Type | Evaluation Condition | Purpose |
| :--- | :--- | :--- |
| **CPU High Usage** | `CPU > X%` for $N$ consecutive intervals | Detect process loops and system overload |
| **Memory Low** | `RAM > X%` for $N$ consecutive intervals | Prevent Out-Of-Memory (OOM) crashes |
| **Disk Space Full** | `Disk Usage > X%` | Timely disk pruning before write failures |
| **Server Heartbeat Offline** | No heartbeat received for > 60s - 120s | Server down, powered off, or network loss |
| **Network Degradation** | `Latency > Warning/Critical` or `Packet Loss > 20%` | Transit congestion or line degradation |

---

## 3. Incident Lifecycle & Auto-Resolve

- **Incident Triggered:**
  When a rule condition is met, the background **Worker** records a new incident and immediately notifies all linked channels with server context, metric values, and timestamp.
- **Auto-Resolve Notification:**
  When metrics normalize, the incident automatically transitions to **Resolved**, and a green recovery notice is dispatched to your channels without requiring manual operator intervention.
