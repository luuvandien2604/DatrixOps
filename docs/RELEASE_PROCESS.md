# Release process

DatrixOps uses semantic tags such as `v1.0.0`. The release workflow tests
Backend, Agent and Frontend; builds version-pinned GHCR images; builds Agent
artifacts for Linux amd64/arm64, Windows amd64 and macOS amd64/arm64; signs the
manifest with Ed25519; generates SHA-256 checksums; and publishes a GitHub
Release.

Configure the repository secret `AGENT_SIGNING_PRIVATE_KEY` as a base64 Ed25519
seed/private key. Never print or commit it.

Before tagging:

1. Update changelog and migration notes.
2. Run every command in [DEVELOPMENT.md](DEVELOPMENT.md).
3. Test fresh install, Agent enrollment, offline/recovery alert, notification,
   backup, upgrade and clean-host restore.
4. Confirm advanced features remain default-off.
5. Tag the tested commit: `git tag -s vX.Y.Z && git push origin vX.Y.Z`.

Production documentation must pin a version. `latest` may exist for discovery
but must not be the only supported tag.
