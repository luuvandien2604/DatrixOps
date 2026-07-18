---
title: "API Keys"
description: "Create and manage API keys for third-party integrations."
role: "public"
order: 7
---

# API Keys

API keys authenticate scripts, CI/CD pipelines, Postman, and other integrations without an interactive user session.

## Create a key

1. Open **Manage → API**.
2. Select **Create Key** and provide a descriptive name.
3. Copy the generated value immediately. It is shown only once.

Send the key in the authorization header:

```http
Authorization: Bearer <your_api_key>
```

Revoke a key immediately if it may have been exposed. Use a separate, clearly named key for each integration.
