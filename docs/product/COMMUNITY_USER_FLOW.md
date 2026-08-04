# DatrixOps Community User Flow

DatrixOps Community Edition is a self-hosted control plane. It does not provide a public SaaS signup flow.

## First Installation

1. The instance starts with `DATRIXOPS_EDITION=community` and `DEPLOYMENT_MODE=self-hosted`.
2. A visitor opening `/` calls the setup status endpoint.
3. If the instance is not configured, `/` redirects to `/setup`.
4. `/setup` creates the first local administrator and marks the instance configured.
5. After setup, the user continues to `/dashboard` or signs in through `/login`.

## Existing Installation

1. `/` checks setup and authentication state.
2. Configured and authenticated users are sent to `/dashboard`.
3. Configured unauthenticated users are sent to `/login`.
4. If the backend cannot be reached, `/` shows a retry state instead of assuming first-install setup.

## Registration

Community Edition has no public signup.

`/register` redirects by setup state:

- unconfigured instance: `/setup`
- configured instance: `/login`

Additional users are managed by an authenticated local administrator. If richer invitations are needed, that is a future Community administration task, not the Cloud signup flow.
