# Agent Update Security

The official Agent source and signing flow live in the Community repository.

Security requirements:

- Ed25519 manifest verification.
- SHA-256 artifact verification.
- OS and architecture matching.
- Anti-downgrade policy.
- Backup of the old binary.
- Atomic replacement and service restart.
- Heartbeat confirmation and update event reporting.
- Rollback when self-test or restart confirmation fails.

The Ed25519 private signing key must never be committed and must not exist on
production VPS hosts. Public verification keys may be embedded in the Agent.
