param(
    [string]$ServerUrl = ""
)

$ErrorActionPreference = "Stop"

# Token-free in-place updater for an installed Windows agent.

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    throw "Run PowerShell as Administrator."
}

$taskName = "DatrixOpsAgent"
$installDir = "C:\Program Files\DatrixOps"
$binaryPath = "$installDir\datrixops-agent.exe"
$stagedPath = "$installDir\datrixops-agent.update.tmp"
$backupPath = "$installDir\datrixops-agent.bak"
$wrapperPath = "$installDir\run-agent.cmd"

if ([string]::IsNullOrWhiteSpace($ServerUrl) -and (Test-Path $wrapperPath)) {
    $serverLine = Get-Content $wrapperPath |
        Where-Object { $_ -match '^set "DATRIXOPS_SERVER_URL=' } |
        Select-Object -First 1
    if ($serverLine) {
        $ServerUrl = ($serverLine -replace '^set "DATRIXOPS_SERVER_URL=', '') -replace '"$', ''
    }
}
$ServerUrl = $ServerUrl.TrimEnd('/') -replace '/api/v1$', ''
if ($ServerUrl -notmatch '^https://') {
    throw "Unable to determine a secure DatrixOps Server URL. Pass -ServerUrl https://monitor.example.com."
}

$releaseBaseUrl = if ($env:AGENT_RELEASE_BASE_URL) { $env:AGENT_RELEASE_BASE_URL.TrimEnd('/') } else { $ServerUrl }
$artifact = "datrixops-agent-windows-amd64.exe"

if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
    throw "The DatrixOpsAgent Scheduled Task is not installed."
}

# Fetch metadata & download update to staged path
Write-Host "Fetching release metadata..."
$shaPath = "$installDir\.artifact.sha256.tmp"
$sizePath = "$installDir\.artifact.size.tmp"

Invoke-WebRequest -Uri "$releaseBaseUrl/$artifact.sha256" -OutFile $shaPath -TimeoutSec 30
Invoke-WebRequest -Uri "$releaseBaseUrl/$artifact.size" -OutFile $sizePath -TimeoutSec 30

$expectedSha = (Get-Content $shaPath -Raw).Trim()
$expectedSize = [int64](Get-Content $sizePath -Raw).Trim()
Remove-Item -Path $shaPath, $sizePath -Force -ErrorAction SilentlyContinue

Write-Host "Downloading DatrixOps Agent update..."
Invoke-WebRequest -Uri "$releaseBaseUrl/$artifact" -OutFile $stagedPath -TimeoutSec 180

$actualSize = (Get-Item $stagedPath).Length
if ($actualSize -ne $expectedSize) {
    Remove-Item -Path $stagedPath -Force -ErrorAction SilentlyContinue
    throw "Downloaded binary size ($actualSize bytes) does not match expected ($expectedSize bytes)."
}

$actualSha = (Get-FileHash -Path $stagedPath -Algorithm SHA256).Hash.ToLower()
if ($actualSha -ne $expectedSha.ToLower()) {
    Remove-Item -Path $stagedPath -Force -ErrorAction SilentlyContinue
    throw "Downloaded binary SHA-256 ($actualSha) does not match expected ($expectedSha)."
}

# Stop process/task before renaming executable
Write-Host "Stopping current Agent process..."
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue | Wait-Process -Timeout 30 -ErrorAction SilentlyContinue

# Backup existing binary
if (Test-Path $binaryPath) {
    Copy-Item -LiteralPath $binaryPath -Destination $backupPath -Force
}

try {
    Move-Item -LiteralPath $stagedPath -Destination $binaryPath -Force
    Start-ScheduledTask -TaskName $taskName
    Start-Sleep -Seconds 2

    if (-not (Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue)) {
        throw "Agent process failed to start after update."
    }
    Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
    Write-Host "DatrixOps Agent updated and restarted successfully."
} catch {
    Write-Warning "Update failed. Restoring previous binary from backup..."
    if (Test-Path $backupPath) {
        Move-Item -LiteralPath $backupPath -Destination $binaryPath -Force
        Start-ScheduledTask -TaskName $taskName
    }
    Remove-Item -LiteralPath $stagedPath -Force -ErrorAction SilentlyContinue
    throw
}
