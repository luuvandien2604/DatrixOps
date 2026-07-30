# Development

Required toolchains are Go 1.25 for Backend, Go 1.24 for Agent and Node.js 22
with npm for Frontend.

```bash
(cd backend && go test ./... && go test -race ./... && go vet ./...)
(cd agent && go test ./... && go test -race ./... && go vet ./...)
(cd frontend && npm ci && npm run lint && npx tsc --noEmit --incremental false && npm run build)
docker compose --env-file .env -f docker-compose.yml config
```

Add database changes as a new ordered SQL file. Applied migration checksums
are immutable. Never commit `.env`, generated binaries, `.next`, `node_modules`,
coverage, release signing keys or local databases.

Pull requests must preserve ownership checks, body limits, secret masking and
the default-off state of advanced Agent actions.
