param(
    [Alias("AgentVersion")]
    [string]$TargetVersion = "",
    [Alias("AgentArtifactBaseUrl")]
    [string]$TargetArtifactBaseUrl = "",
    [switch]$AllowDowngrade
)

$ErrorActionPreference = "Stop"

# Token-free in-place updater for an installed Windows agent.

$TestMode = if ($env:DATRIXOPS_INSTALLER_TEST_MODE -eq "1") { $true } else { $false }
$TestRoot = if ($env:DATRIXOPS_INSTALLER_ROOT) { $env:DATRIXOPS_INSTALLER_ROOT } else { "" }

if (-not $TestMode) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
    if (-not $isAdmin) {
        throw "Run PowerShell as Administrator."
    }
}

$taskName = "DatrixOpsAgent"
$installDir = if ($TestRoot) { [System.IO.Path]::Combine($TestRoot, "Program Files", "DatrixOps") } else { "C:\Program Files\DatrixOps" }
$binaryPath = "$installDir\datrixops-agent.exe"
$stagedPath = "$installDir\datrixops-agent.update.tmp"
$backupPath = "$installDir\datrixops-agent.bak"
$wrapperPath = "$installDir\run_agent.bat"

$CurrentVersion = ""
if (Test-Path $wrapperPath) {
    $versionLine = Get-Content $wrapperPath | Where-Object { $_ -match '^set "AGENT_VERSION=' } | Select-Object -First 1
    if ($versionLine) {
        $CurrentVersion = ($versionLine -replace '^set "AGENT_VERSION=', '') -replace '"$', ''
    }
}

if ([string]::IsNullOrWhiteSpace($TargetVersion) -or [string]::IsNullOrWhiteSpace($TargetArtifactBaseUrl)) {
    throw "-TargetVersion and -TargetArtifactBaseUrl are required."
}

if ($TargetVersion -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
    throw "-TargetVersion must be a valid semver version (X.Y.Z)."
}

$TargetArtifactBaseUrl = $TargetArtifactBaseUrl.TrimEnd('/')
if (-not $TestMode -and $TargetArtifactBaseUrl -notmatch '^https://') {
    throw "TargetArtifactBaseUrl must be an HTTPS URL."
}
$artifact = "datrixops-agent-windows-amd64.exe"

# Semver comparison helper: returns -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2
function Compare-SemVer([string]$v1, [string]$v2) {
    $p1 = [version]$v1
    $p2 = [version]$v2
    return $p1.CompareTo($p2)
}

if ($CurrentVersion -and $CurrentVersion -match '^[0-9]+\.[0-9]+\.[0-9]+$') {
    $cmp = Compare-SemVer $CurrentVersion $TargetVersion
    if ($cmp -gt 0 -and -not $AllowDowngrade) {
        throw "Target version ($TargetVersion) is lower than current version ($CurrentVersion). Use -AllowDowngrade to force."
    }
}

if (-not $TestMode -and -not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
    throw "The DatrixOpsAgent Scheduled Task is not installed."
}

# Fetch metadata & download update to staged path
Write-Host "Fetching release metadata..."
$versionPath = "$installDir\.agent-release.version.tmp"
$shaPath = "$installDir\.artifact.sha256.tmp"
$sizePath = "$installDir\.artifact.size.tmp"

Invoke-WebRequest -Uri "$TargetArtifactBaseUrl/agent-release.version" -OutFile $versionPath -TimeoutSec 30
$remoteVersion = (Get-Content $versionPath -Raw).Trim()
Remove-Item -Path $versionPath -Force -ErrorAction SilentlyContinue

if ($remoteVersion -ne $TargetVersion) {
    throw "Target version mismatch: remote release version is $remoteVersion, expected $TargetVersion."
}

Invoke-WebRequest -Uri "$TargetArtifactBaseUrl/$artifact.sha256" -OutFile $shaPath -TimeoutSec 30
Invoke-WebRequest -Uri "$TargetArtifactBaseUrl/$artifact.size" -OutFile $sizePath -TimeoutSec 30

$expectedSha = (Get-Content $shaPath -Raw).Trim()
$expectedSize = [int64](Get-Content $sizePath -Raw).Trim()
Remove-Item -Path $shaPath, $sizePath -Force -ErrorAction SilentlyContinue

Write-Host "Downloading DatrixOps Agent update..."
Invoke-WebRequest -Uri "$TargetArtifactBaseUrl/$artifact" -OutFile $stagedPath -TimeoutSec 180

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
if (-not $TestMode) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue | Wait-Process -Timeout 30 -ErrorAction SilentlyContinue
} else {
    if ($env:DATRIXOPS_MOCK_SCHTASKS_BIN) {
        & $env:DATRIXOPS_MOCK_SCHTASKS_BIN "stop" $taskName
    }
}

# Backup existing binary
if (Test-Path $binaryPath) {
    Copy-Item -LiteralPath $binaryPath -Destination $backupPath -Force
}

try {
    Move-Item -LiteralPath $stagedPath -Destination $binaryPath -Force
    if (-not $TestMode) {
        Start-ScheduledTask -TaskName $taskName
    } else {
        if ($env:DATRIXOPS_MOCK_SCHTASKS_BIN) {
            & $env:DATRIXOPS_MOCK_SCHTASKS_BIN "start" $taskName
        }
    }
    Start-Sleep -Seconds 2

    $healthPassed = $false
    if (-not $TestMode) {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        $proc = Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue
        if ($task -and $proc) {
            $healthPassed = $true
        }
    } else {
        if ($env:DATRIXOPS_MOCK_SCHTASKS_BIN) {
            $res = & $env:DATRIXOPS_MOCK_SCHTASKS_BIN "status" $taskName
            if ($res -eq "running") { $healthPassed = $true }
        } else {
            if (Test-Path $binaryPath) { $healthPassed = $true }
        }
    }

    if (-not $healthPassed) {
        throw "Updated agent failed restart or process health check."
    }

    Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue

    if (Test-Path $wrapperPath) {
        $wrapperLines = Get-Content $wrapperPath
        $newLines = @()
        foreach ($line in $wrapperLines) {
            if ($line -match '^set "AGENT_VERSION=') {
                $newLines += "set `"AGENT_VERSION=$TargetVersion`""
            } elseif ($line -match '^set "DATRIXOPS_AGENT_ARTIFACT_BASE_URL=') {
                $newLines += "set `"DATRIXOPS_AGENT_ARTIFACT_BASE_URL=$TargetArtifactBaseUrl`""
            } else {
                $newLines += $line
            }
        }
        $newLines | Set-Content -Path $wrapperPath -Encoding ASCII
    }

    Write-Host "DatrixOps Agent updated and restarted successfully."
} catch {
    $err = $_
    Write-Warning "Agent update failed ($err). Restoring backup binary..."
    if (Test-Path $backupPath) {
        Move-Item -LiteralPath $backupPath -Destination $binaryPath -Force
        if (-not $TestMode) {
            Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        } else {
            if ($env:DATRIXOPS_MOCK_SCHTASKS_BIN) {
                & $env:DATRIXOPS_MOCK_SCHTASKS_BIN "start" $taskName
            }
        }
    }
    throw $err
}
