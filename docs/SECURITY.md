# Security

- Use HTTPS and a unique 32+ byte JWT secret.
- Keep `.env`, signing keys and backup archives mode 0600 and off Git.
- PostgreSQL and Backend stay on the internal Compose network.
- Enrollment tokens expire after 15 minutes, are single-use and stored hashed.
- Permanent Agent credentials are unique and stored hashed by new enrollments.
- Rate limits and body limits protect authentication and Agent endpoints.
- Setup and public registration are locked by default after initialization.

Advanced features are disabled by default:

```dotenv
ENABLE_WEB_TERMINAL=false
ENABLE_REMOTE_SCRIPTS=false
ENABLE_SERVICE_CONTROLS=false
ENABLE_READ_ONLY_LOGS=false
```

Enable them only after reviewing host privilege and audit implications. They
are not required for monitoring.

Rotate a leaked secret immediately, revoke sessions, and inspect audit logs.
Agent release private signing keys belong in an external secret store or
GitHub Actions secret and must never be copied into an image or repository.

Security limitations and incomplete RBAC are documented in
[AUDIT.md](AUDIT.md).
