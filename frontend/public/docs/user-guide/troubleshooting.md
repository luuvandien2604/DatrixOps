# Troubleshooting

## 1. A server shows “No data”

If Monitoring shows an empty state, the dashboard has not received metrics from that server during the selected time range.

### Agent is not installed

Open **Server Management**, use the installation action next to the server, and run the generated command on the target machine.

### Agent version is outdated

After a dashboard upgrade, an older agent may not support newer time-series, network, or disk telemetry fields. Run the current installation command again to replace the old binary and resume reporting.

### Outbound network access is blocked

Confirm that the server firewall allows outbound internet access. The agent must reach the dashboard domain over port `443` or `80`.

## 2. PowerShell installation errors

Parser or “Unexpected token” errors can be caused by text encoding or an outdated PowerShell version.

Use the **CMD** installation tab and run its `cmd.exe /c ...` command from an Administrator Command Prompt. The batch installer avoids common encoding problems on older Windows Server environments.
