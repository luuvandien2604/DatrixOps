# Alerts

Alert rules currently support CPU, RAM, disk and Agent offline conditions.
Choose a target Agent or the fleet, threshold/operator, condition duration and
one or more notification channels.

A condition first enters `pending`. It opens one `firing` state only after the
configured duration and does not duplicate on every worker cycle. State is in
PostgreSQL, so worker restarts do not reset the timer. Recovery changes the
same state to `ok` and creates a recovery notification.

Missing telemetry is not treated as numeric zero and does not falsely resolve
an incident. Dedicated no-data, website/SSL, silence, maintenance, cooldown
and full incident timelines remain tracked as partial work in
[AUDIT.md](AUDIT.md).
