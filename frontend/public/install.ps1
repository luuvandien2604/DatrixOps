param (
    [Parameter(Mandatory=$true)]
    [string]$Token,
    [Parameter(Mandatory=$false)]
    [string]$Services = ""
)

if ($Services -and $Services -notmatch '^[A-Za-z0-9._@,$ \-]+$') {
    Write-Error "Services contains unsupported characters."
    exit 1
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "[*] DatrixOps Agent Installer (Windows)" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Ensure admin rights
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Please run PowerShell as Administrator."
    exit 1
}

$ServerUrl = "https://datrixops.vandien.space"
$ApiUrl = "$ServerUrl/api/v1"
$BinaryUrl = "$ServerUrl/datrixops-agent-windows-amd64.exe"
$InstallDir = "C:\Program Files\DatrixOps"
$ExePath = "$InstallDir\datrixops-agent.exe"
$BatPath = "$InstallDir\run_agent.bat"

# Create directory
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

# During an update this installer can be launched by the running agent. Wait for
# that process to exit instead of terminating the Scheduled Task and its child
# updater before the new binary has been downloaded.
$TaskName = "DatrixOpsAgent"
Write-Host "[*] Waiting for the existing agent to exit (if running)..."
Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue | Wait-Process -Timeout 30 -ErrorAction SilentlyContinue

Write-Host "[*] Downloading DatrixOps Agent..."
$UpdatePath = "$ExePath.update"
Invoke-WebRequest -Uri $BinaryUrl -OutFile $UpdatePath
if ((Get-Item $UpdatePath).Length -eq 0) {
    throw "Downloaded agent binary is empty."
}
Move-Item -LiteralPath $UpdatePath -Destination $ExePath -Force

Write-Host "[*] Creating wrapper script..."
$LogPath = "$InstallDir\agent.log"
$BatContent = @(
    "@echo off",
    "set `"DATRIXOPS_SERVER_URL=$ApiUrl`"",
    "set `"DATRIXOPS_AGENT_TOKEN=$Token`"",
    "set `"DATRIXOPS_SERVICES=$Services`"",
    "`"$ExePath`" >> `"$LogPath`" 2>&1"
)
$BatContent | Set-Content -Path $BatPath -Encoding ASCII

Write-Host "[*] Creating Scheduled Task to run agent on startup..."

# Action: run agent via bat script so env vars are loaded properly
$Action = New-ScheduledTaskAction -Execute $BatPath

# Trigger: at startup
$Trigger = New-ScheduledTaskTrigger -AtStartup

# Keep the agent alive after an approved update or restart task.
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)

# System account
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Register task
$TaskName = "DatrixOpsAgent"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null

Write-Host "[*] Starting DatrixOps Agent..."
Start-ScheduledTask -TaskName $TaskName

Write-Host "[OK] DatrixOps Agent installed successfully!" -ForegroundColor Green
Write-Host "[*] The agent is now running in the background and will auto-start on boot."
Write-Host "=================================================" -ForegroundColor Cyan
