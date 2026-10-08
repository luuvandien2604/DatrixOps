---
title: Cron Execution Telemetry
description: Record real cron job run times, exit codes, and execution history with the agent wrapper.
---

# Cron Execution Telemetry

Background scheduled jobs (such as database backups, cache purges, and report generation) often fail silently on remote servers. Traditional cron sends failure emails that are easily missed or routed to spam.

DatrixOps provides **Cron Execution Telemetry** to track scheduled task execution, record run durations, capture exit codes, and alert you immediately whenever a critical job fails.

---

## How It Works

DatrixOps offers two layers of cron visibility:

1. **System Crontab Discovery**: The Agent automatically inventories configured cron schedules on Linux hosts (from `/etc/crontab`, `/etc/cron.d/`, and user crontabs).
2. **Active Execution Telemetry**: By prefixing your scheduled command with the lightweight `datrix-agent cron wrap` helper, the agent records the exact start time, duration, output, and exit status code.

```
[ Crontab Schedule ] ──> [ datrix-agent cron wrap ] ──> [ Your Script / Command ]
                                   │
                                   ▼ Reports Run Metrics
                        [ DatrixOps Dashboard ]
```

---

## Wrapping a Cron Job for Telemetry

To enable active execution telemetry for any cron job, wrap the command in your crontab using `datrix-agent cron wrap`:

### Example: Backing Up a Database

Suppose you have an existing cron job in `/etc/crontab` or `crontab -e`:

```bash
# Original command
0 2 * * * /usr/local/bin/backup-database.sh
```

Update it to wrap execution through the DatrixOps Agent:

```bash
# Telemetry-wrapped command
0 2 * * * datrix-agent cron wrap --job "db-nightly-backup" -- /usr/local/bin/backup-database.sh
```

### Options Breakdown
- `--job "db-nightly-backup"`: A recognizable, unique identifier for the job shown in the dashboard.
- `--`: Separates the wrapper flags from your actual script and arguments.
- `/usr/local/bin/backup-database.sh`: Your regular command. It executes with identical environment variables and file permissions.

---

## Viewing Cron Telemetry in the Dashboard

Navigate to **Servers → [Select Server] → Cron Jobs**:

### 1. Job Telemetry Table
- **Job Name**: The identifier specified in `--job` or the cron script path.
- **Schedule**: The cron frequency expression (e.g., `0 2 * * *` or `*/15 * * * *`).
- **Last Run**: Relative time since the latest execution (e.g., `3 hours ago`).
- **Duration**: Exact run time (e.g., `42.5s` or `3m 12s`).
- **Exit Code**:
  - **Success (Green)**: Process exited with return code `0`.
  - **Failed (Red)**: Process exited with non-zero exit code (e.g., `1`, `127`).

### 2. Execution History & Error Logs
Click on any job to view its recent run history:
- Historical run timestamps and execution durations.
- Output snippets (stdout / stderr) recorded when an execution returns a failure exit code, allowing you to debug script errors directly from the dashboard.

---

## Best Practices

- **Critical Tasks**: Always wrap backup scripts, payment reconciliation jobs, and data synchronization cron jobs.
- **Environment Paths**: Use absolute paths (e.g., `/usr/bin/python3` instead of `python3`) inside cron scripts to prevent PATH resolution differences.
- **Permissions**: Ensure the user running the crontab has permission to execute `/usr/local/bin/datrix-agent`.

---

## Next Steps

- Set up automated notifications when a server fails in [Alerts & Notifications](/docs/features/alerts).
- Execute on-demand troubleshooting commands using [Remote Web Terminal](/docs/features/web-terminal).
