# Agent installation

In the dashboard choose **Servers → Add Server**. DatrixOps creates a
cryptographically random enrollment token valid for 15 minutes. It is stored
only as a hash and can be used once.

The generated Linux command has this shape:

```bash
curl -fsSL https://monitor.example.com/install.sh | sudo bash -s -- \
  --server https://monitor.example.com \
  --token ONE_TIME_ENROLLMENT_TOKEN
```

The installer exchanges that token for a unique Agent credential. Only the
credential hash is stored by the control plane. Linux stores its credential in
`/etc/datrixops/agent.env` with mode 0600 and runs the binary through a
hardened systemd unit.

Required Agent connectivity is outbound HTTPS/WSS to the DatrixOps public URL.
No inbound Agent port or SSH credential is required.

Check Linux state with:

```bash
systemctl status datrixops-agent
journalctl -u datrixops-agent -n 100 --no-pager
```

The dashboard's update action uses a signed Ed25519 manifest, SHA-256, OS and
architecture matching. Manual legacy update commands derive the control-plane
URL from the installed service configuration and do not contain a fixed
domain.
