---
title: "Cron Execution Telemetry"
description: "Record real cron last-run time, exit status, and execution history with the Agent wrapper."
---

## Purpose

Cron Discovery tells DatrixOps that a job exists and lets the Agent estimate the next run from the schedule. It cannot know whether the job actually succeeded or failed unless cron reports execution telemetry.

Cron Execution Telemetry uses the `datrixops-agent cron-run` wrapper. The wrapper runs the real command, preserves the command exit code, limits captured output, and reports the execution back to the Backend with the existing Agent Token.

## When should I use the wrapper?

Use the wrapper for important operational jobs such as:

- database backups;
- SSL renewal;
- log cleanup;
- data synchronization;
- production maintenance jobs.

You do not need to wrap every small cron job if you do not need last-run time or exit status in the Dashboard.

## Migrate a cron job

1. Open the server in the Dashboard.
2. Open **Cron Monitoring**.
3. Find the cron job you want to instrument.
4. Click **Copy wrapper**.
5. Edit the server crontab and replace only the command portion with the copied wrapper command.

Original job:

```cron
0 2 * * * /usr/local/bin/backup-db.sh
```

Instrumented job:

```cron
0 2 * * * datrixops-agent cron-run --external-id <telemetry-id> -- /bin/sh -lc '/usr/local/bin/backup-db.sh'
```

Keep the five schedule fields at the beginning of the line unchanged. Replace only the command after the schedule.

## Safety rules

- DatrixOps does not rewrite crontabs automatically.
- The wrapper does not change the schedule.
- Do not wrap commands you do not understand.
- If the command depends on environment variables, keep them in the wrapped command or move the logic into a script.
- Test on a low-risk job before instrumenting important production jobs.

## Output and exit status

The wrapper forwards stdout/stderr to cron as usual and also captures the first part of the output for DatrixOps. Captured telemetry output is limited so large logs do not slow down the Dashboard.

Dashboard states:

- `Not instrumented`: the job was discovered but has not reported real execution telemetry yet.
- `completed`: the command returned exit code `0`.
- `failed`: the command returned a non-zero exit code or could not be started.
- `timed_out`: the wrapper timed out via `--timeout-seconds`.

## Optional timeout

You can set a runtime limit:

```cron
0 2 * * * datrixops-agent cron-run --external-id <telemetry-id> --timeout-seconds 1800 -- /bin/sh -lc '/usr/local/bin/backup-db.sh'
```

When the timeout is reached, the wrapper exits with code `124` and reports `timed_out`.

## If recent runs do not appear

Check:

1. The Agent has been updated to a release that includes `cron-run`.
2. Cron can find the `datrixops-agent` binary in PATH. If unsure, use the absolute binary path.
3. The Agent Token and `DATRIXOPS_SERVER_URL` are still configured for the host.
4. The cron job has actually run after migration.
5. The Dashboard still shows the cron job and Telemetry ID.

When you copy a wrapper with `external_id`, the original command can change while telemetry still maps to the displayed job. If you want DatrixOps to treat it as a new job, let the Agent rediscover the changed crontab.

