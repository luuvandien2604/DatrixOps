# Edition and Deployment Profiles

Supported profiles:

```text
community-ip-http
community-domain-https
cloud-domain-https
```

Community self-host supports IP over HTTP for simple VPS installs:

```env
DATRIXOPS_EDITION=community
DEPLOYMENT_MODE=self-hosted
PUBLIC_URL=http://203.0.113.10
ALLOWED_ORIGINS=http://203.0.113.10
CADDY_SITE_ADDRESS=http://203.0.113.10
```

Community self-host supports domain HTTPS through Caddy automatic certificates:

```env
DATRIXOPS_EDITION=community
DEPLOYMENT_MODE=self-hosted
PUBLIC_URL=https://monitor.example.com
ALLOWED_ORIGINS=https://monitor.example.com
CADDY_SITE_ADDRESS=monitor.example.com
```

Cloud managed deployments are private downstream deployments and must use a real
HTTPS domain:

```env
DATRIXOPS_EDITION=cloud
DEPLOYMENT_MODE=managed
PUBLIC_URL=https://cloud.datrixops.com
ALLOWED_ORIGINS=https://cloud.datrixops.com
CADDY_SITE_ADDRESS=cloud.datrixops.com
```

URL validation is centralized in `backend/internal/platform/config`.
