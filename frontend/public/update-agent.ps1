$ErrorActionPreference = "Stop"

# Token-free in-place updater for an installed Windows agent. The existing
# Scheduled Task and wrapper retain the registered agent token.

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    throw "Run PowerShell as Administrator."
}

$binaryUrl = "https://datrixops.vandien.space/datrixops-agent-windows-amd64.exe"
$taskName = "DatrixOpsAgent"
$binaryPath = "C:\Program Files\DatrixOps\datrixops-agent.exe"
$stagedPath = "$binaryPath.update"

if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
    throw "The DatrixOpsAgent Scheduled Task is not installed."
}

Write-Host "Stopping the current DatrixOps Agent..."
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue |
    Wait-Process -Timeout 30 -ErrorAction SilentlyContinue

try {
    Write-Host "Downloading the current DatrixOps Agent release..."
    Invoke-WebRequest -Uri $binaryUrl -OutFile $stagedPath
    if ((Get-Item $stagedPath).Length -eq 0) {
        throw "Downloaded agent binary is empty."
    }

    $header = [System.IO.File]::ReadAllBytes($stagedPath)[0..1]
    if ($header[0] -ne 0x4D -or $header[1] -ne 0x5A) {
        throw "Downloaded artifact is not a Windows executable."
    }

    Move-Item -LiteralPath $stagedPath -Destination $binaryPath -Force
    Start-ScheduledTask -TaskName $taskName
    Write-Host "DatrixOps Agent updated and restarted successfully."
}
finally {
    Remove-Item -LiteralPath $stagedPath -Force -ErrorAction SilentlyContinue
}
