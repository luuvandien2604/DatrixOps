param (
    [Parameter(Mandatory=$true)]
    [string]$Token
)

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "🚀 DatrixOps Agent Installer (Windows)" -ForegroundColor Cyan
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

# Create directory
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

Write-Host "📥 Downloading DatrixOps Agent..."
Invoke-WebRequest -Uri $BinaryUrl -OutFile $ExePath

Write-Host "⚙️ Creating Scheduled Task to run agent on startup..."

# Action: run agent
$Action = New-ScheduledTaskAction -Execute $ExePath

# Trigger: at startup
$Trigger = New-ScheduledTaskTrigger -AtStartup

# Settings: don't stop on battery, restart on failure if possible (simplified here)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable

# System account
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Environment Variables (Note: Windows Scheduled Tasks don't natively inject custom env vars easily without a wrapper script. 
# So we will set Machine-level environment variables for the SYSTEM user to pick up).
[Environment]::SetEnvironmentVariable("DATRIXOPS_SERVER_URL", $ApiUrl, "Machine")
[Environment]::SetEnvironmentVariable("DATRIXOPS_AGENT_TOKEN", $Token, "Machine")

# Register task
$TaskName = "DatrixOpsAgent"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null

Write-Host "🔄 Starting DatrixOps Agent..."
Start-ScheduledTask -TaskName $TaskName

Write-Host "✅ DatrixOps Agent installed successfully!" -ForegroundColor Green
Write-Host "📡 The agent is now running in the background and will auto-start on boot."
Write-Host "=================================================" -ForegroundColor Cyan
