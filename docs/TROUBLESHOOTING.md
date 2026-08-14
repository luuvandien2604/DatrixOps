# Troubleshooting

Start with:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml ps
docker compose --env-file .env -f deploy/docker-compose.yml logs --tail=200
curl -fsS https://monitor.example.com/health/ready
```

If an Agent is offline, verify outbound HTTPS, system time, the service log and
that `PUBLIC_URL` matches its certificate. Re-enrollment is required only when
the Agent credential has been revoked or lost.

If migration fails, do not delete the database volume. Read the migrate
container log and restore the pre-upgrade backup if necessary.

## Reset an administrator password

Use the management CLI so the password is not stored in shell history:

```bash
datrix reset-password
```

To view the login URL and administrator username:

```bash
datrix info
```

Passwords are not stored in plaintext. If the password is unavailable, use
`datrix reset-password` and save the new value in a password manager.

If the management CLI is not available on an older installation, pipe the new
password on stdin:

```bash
printf '%s\n' 'A-new-long-random-password' | \
  docker compose --env-file .env -f deploy/docker-compose.yml \
  run --rm -T backend ./reset_admin admin
```

The command updates only an existing administrator and revokes all refresh
sessions.
