---
title: "Common Issues"
description: "Troubleshoot common DatrixOps agent and monitoring problems."
role: "public"
order: 9
---

# Common Issues

## A running server appears offline

Check the agent service and its logs, then confirm that outbound access to the DatrixOps endpoint is available. Restart the service if necessary.

## Alerts are not delivered

Confirm that the rule and notification channel are enabled. Validate the Telegram credentials or Discord webhook directly, then allow at least one evaluation interval.

## Docker actions appear delayed

Remote actions run when the agent receives its next task. Wait for another heartbeat, refresh the page, and confirm that the Docker daemon is running.

## Detailed tabs are empty

Processes, services, and Docker snapshots update less often than core telemetry. Wait for the next snapshot and refresh.

## Website checks fail

Verify the full URL, including `https://`, and confirm that the target firewall or WAF does not block the monitoring service.
