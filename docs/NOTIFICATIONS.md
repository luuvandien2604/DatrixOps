# Notifications

DatrixOps supports Telegram, Discord, SMTP email and signed system webhooks.
Channel secrets are masked in list responses and excluded from audit logs.

System webhooks use HMAC signatures, bounded attempts and exponential retry.
Delivery history records HTTP status, latency, attempt count and terminal
failure. Configure receiving endpoints to verify the signature before parsing
or acting on a payload.

SMTP channels require host, port, From and recipient addresses. Use TLS or
STARTTLS as supported by the provider. Give DatrixOps a dedicated application
password rather than a personal mailbox password.

Test each channel after install and after changing firewall or DNS. A dashboard
notification is still stored when an external provider is unavailable.
