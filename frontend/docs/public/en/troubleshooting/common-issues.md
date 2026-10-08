---
title: Common Issues & Solutions
description: Diagnose offline agents, network probe errors, web terminal timeouts, and SSL renewal.
---

# Common Issues & Solutions

This guide provides practical troubleshooting steps for the most common operational issues encountered when deploying, connecting, and managing servers with DatrixOps.

---

## 1. Agent Shows "Offline" or Disconnected

### Symptoms
- A newly enrolled server stays in `Offline` or `Pending` status.
- An existing server stops sending telemetry and turns red.

### Troubleshooting Steps

#### Step 1: Check the Agent Service Status on the Host
SSH into the monitored host and check if the agent daemon is active:

```bash
sudo systemctl status datrix-agent
```

If the service is stopped or failed, restart it:

```bash
sudo systemctl restart datrix-agent
```

#### Step 2: Inspect Agent Service Logs
View the latest error logs:

```bash
sudo journalctl -u datrix-agent -n 50 --no-pager
```

#### Step 3: Test Outbound Connectivity to DatrixOps
Ensure the host can reach your DatrixOps control plane over HTTPS/WSS:

```bash
curl -Iv https://<your-datrix-domain>/health
```

- If the command hangs or times out, your host firewall, VPC egress rule, or corporate proxy is blocking outbound traffic to port `443`.
- If you see an SSL certificate error (`certificate signed by unknown authority`), verify that your DatrixOps server has a valid SSL certificate.

---

## 2. Web Terminal Fails to Connect or Times Out

### Symptoms
- The Web Terminal window displays `Connecting to server…` and eventually times out.
- The browser console shows `WebSocket connection to 'wss://.../ws/terminal' failed`.

### Common Causes & Fixes

#### Issue: Reverse Proxy Missing WebSocket Headers
If you placed an external reverse proxy (e.g., Nginx, Traefik, or AWS ALB) in front of DatrixOps:
Ensure WebSocket upgrade headers are passed through:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
```

*(Note: The built-in Caddy gateway in DatrixOps handles WebSocket upgrades automatically).*

#### Issue: Cloudflare Proxy Buffering
If your domain uses Cloudflare (orange-cloud proxy enabled):
1. Log in to the Cloudflare Dashboard.
2. Go to **Network** settings.
3. Ensure **WebSockets** is toggled to **ON**.

---

## 3. Network Quality Probes Report 100% Packet Loss

### Symptoms
- ICMP targets report `100% packet loss` or `Critical` status while the host has regular internet access.

### Common Causes & Fixes

#### Issue: Monitored Target Blocks ICMP Ping
Many enterprise firewalls, CDNs, and cloud gateways drop ICMP echo requests by default.
- **Fix**: Switch the probe method from `ICMP (Ping)` to `TCP (Socket)` targeting an open port (e.g., port `443` or `80`).

#### Issue: Linux Raw Socket Permissions
On minimal Linux containers (such as Alpine or Docker containers running without `NET_RAW` capability), ping utilities require raw socket permissions:

```bash
sudo setcap cap_net_raw+ep /usr/local/bin/datrix-agent
```

---

## 4. Custom Domain SSL Provisioning Fails (Caddy)

### Symptoms
- When setting `CADDY_SITE_ADDRESS=ops.example.com`, the browser shows `SSL Connection Error` or `Connection Refused`.

### Troubleshooting Steps

1. **Verify DNS Propagation**:
   Ensure your domain's DNS `A` or `AAAA` record points directly to your server's public IP address:
   ```bash
   dig +short ops.example.com
   ```
2. **Verify Inbound Ports 80 and 443**:
   Let's Encrypt requires ports `80` (HTTP-01 challenge) and `443` to reach Caddy:
   ```bash
   sudo ufw status
   # If ports are closed, allow them:
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```
3. **Inspect Caddy Container Logs**:
   ```bash
   sudo datrix logs
   ```
   Look for lines tagged `[caddy]` describing ACME challenge results.

---

## 5. Resetting Lost Administrator Password

If you are locked out of the web dashboard:

1. SSH into the server hosting the DatrixOps control plane.
2. Run the interactive management utility:
   ```bash
   sudo datrix reset-password
   ```
3. Follow the on-screen prompt to specify your username and enter a new password. The update takes effect immediately without restarting containers.

---

## Next Steps

- Consult the [Frequently Asked Questions](/docs/troubleshooting/faq) for answers to architectural and operational queries.
- Check configuration parameters in [Environment Variables (.env)](/docs/reference/configuration).
