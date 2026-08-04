# Community Route Ownership

## CE_ONLY

- `/setup`: first administrator setup for `community/self-hosted` only.
- `/login`: local instance sign-in.
- `/register`: compatibility route that redirects to setup or login.
- `/`: dynamic router to setup, login or dashboard.

## SHARED_CORE

- `/dashboard`
- `/dashboard/*`
- monitoring, alerts, terminal, Docker, Agent and shared authentication primitives.

## OPTIONAL_PUBLIC

- `/docs`: self-host documentation may be served locally or linked to public documentation.

## NOT_EXPOSED

Community Edition must not expose SaaS routes:

- `/signup`
- `/signin` as a separate Cloud form
- `/pricing`
- `/features`
- `/organizations`
- `/billing`
- `/subscription`

The backend public register API returns `REGISTRATION_DISABLED`. The setup API is registered only for `DATRIXOPS_EDITION=community` and `DEPLOYMENT_MODE=self-hosted`.
