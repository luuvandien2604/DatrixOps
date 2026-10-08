---
title: Alerts & Notifications
description: Set up incident alert rules with dispatch to Telegram, Discord, Email, and Webhooks.
---

# Alerts & Notifications

DatrixOps features a robust alerting engine that continuously evaluates incoming server metrics, website uptime checks, and network probes against your configured rules. When an abnormal condition or outage is detected, DatrixOps immediately dispatches notifications to your team's communication channels.

---

## How Alerting Works

The alerting pipeline operates in three steps:

1. **Rule Evaluation**: Every metric report is compared against your defined thresholds (e.g., CPU > 85% for 5 minutes).
2. **Incident Creation**: When a threshold is breached, an **Active Incident** is created, assigned a severity (`Warning` or `Critical`), and logged in the incident history.
3. **Multi-Channel Dispatch**: DatrixOps routes the alert payload to all enabled notification channels. Once the condition returns to normal, an automated **Resolved** notification is sent.

---

## Setting Up Notification Channels

Before configuring alert rules, connect your communication channels under **Alerts → Notification Channels**.

### 1. Telegram
Receive real-time alerts directly in a Telegram group or personal chat.

1. Create a Telegram bot using [@BotFather](https://t.me/BotFather) and copy the **Bot Token**.
2. Add your bot to the desired Telegram channel or group.
3. Obtain the **Chat ID** (for groups, you can invite `@userinfobot` or send a test message to inspect the Telegram API).
4. In DatrixOps, click **Add Channel**, select **Telegram**, and enter:
   - **Channel Name**: e.g., `DevOps Telegram Alerts`.
   - **Bot Token**: e.g., `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`.
   - **Chat ID**: e.g., `-1001234567890`.
5. Click **Send Test Notification** to confirm delivery, then click **Save**.

### 2. Discord
Broadcast alerts into a dedicated Discord channel using webhooks.

1. Open your Discord Server Settings $\rightarrow$ **Integrations** $\rightarrow$ **Webhooks**.
2. Click **New Webhook**, select the target text channel, and copy the **Webhook URL**.
3. In DatrixOps, click **Add Channel**, select **Discord**, and enter:
   - **Channel Name**: e.g., `Discord Incident Feed`.
   - **Webhook URL**: e.g., `https://discord.com/api/webhooks/...`.
4. Click **Send Test Notification**, verify the embed in Discord, and click **Save**.

### 3. Email (SMTP)
Send email notifications to administrators or on-call distribution lists.

1. Click **Add Channel** and select **Email**.
2. Enter your SMTP relay credentials:
   - **SMTP Host & Port**: e.g., `smtp.gmail.com` on port `587` (TLS) or `465` (SSL).
   - **Sender Email & Password**: SMTP authentication details.
   - **Recipient Email(s)**: Comma-separated list of target email addresses.
3. Send a test email and click **Save**.

### 4. Custom Webhook
Integrate with external incident management tools or automated runbooks.

1. Click **Add Channel** and select **Webhook**.
2. Provide the destination URL (e.g., `https://api.example.com/alerts`).
3. DatrixOps sends a standard HTTP POST request with a JSON payload detailing the incident, severity, server name, and timestamp.

---

## Configuring Alert Rules

Navigate to **Alerts** (`/dashboard/alerts`) and click **Create Alert Rule**:

### Rule Parameters
- **Rule Name**: Descriptive label (e.g., `High CPU Warning - Production`).
- **Target Scope**: Apply to **All Servers**, servers with specific **Tags**, or an individual server.
- **Metric Type**:
  - **CPU Utilization (%)**: Trigger when CPU exceeds threshold (e.g., `> 90%`).
  - **Memory Usage (%)**: Trigger when RAM exceeds threshold (e.g., `> 90%`).
  - **Disk Space Usage (%)**: Trigger when any mounted filesystem exceeds threshold (e.g., `> 90%`).
  - **Server Offline**: Trigger when agent heartbeats are missed for more than `2 minutes`.
  - **Website Down**: Trigger immediately upon HTTP check failure or timeout.
  - **SSL Certificate Expiring**: Trigger when SSL validity drops below `14 days`.
- **Duration / Window**: How long the condition must persist before firing (e.g., `3 minutes` to prevent alerts on temporary CPU spikes).
- **Notification Channels**: Select one or more configured channels to receive alerts for this rule.

---

## Managing Active & Historical Incidents

On the **Alerts** dashboard:
- **Active Incidents Tab**: Lists ongoing issues currently breaching thresholds. Displays the start time, current metric value, and triggered server.
- **Incident History Tab**: Complete audit log of past incidents, including duration and resolution timestamps.
- **Acknowledge Incident**: Operators can acknowledge incidents to indicate that an engineer is actively investigating.

---

## Next Steps

- Access your server's shell to resolve incidents via [Remote Web Terminal](/docs/features/web-terminal).
- Review historical trends in [Server & Resource Monitoring](/docs/features/servers).
