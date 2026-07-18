---
title: "Alert Configuration"
description: "Create CPU, memory, and offline rules with Telegram or Discord notifications."
role: "public"
order: 5
---

# Alert Configuration

## Add a notification channel

1. Open **Alerts** and select **Channels**.
2. Add a recognizable channel name.
3. Choose Telegram Bot or Discord Webhook.
4. Enter the required token, chat ID, or webhook URL and save.

## Add an alert rule

1. Open **Rules** and select **Add Rule**.
2. Choose CPU usage, memory usage, or offline status.
3. Configure the operator and threshold when applicable.
4. Select the destination channel and save.

Enabled rules are evaluated automatically. Start with conservative thresholds to avoid noisy notifications, then tune them using observed production behavior.
