param (
    [Parameter(Mandatory=$true)]
    [string]$Token,
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,
    [Parameter(Mandatory=$true)]
    [string]$AgentVersion,
    [Parameter(Mandatory=$true)]
    [string]$AgentArtifactBaseUrl,
    [Parameter(Mandatory=$false)]
    [string]$AgentReleaseLayout = "github",
    [Parameter(Mandatory=$false)]
    [string]$Services = "",
    [Parameter(Mandatory=$false)]
    [switch]$AllowInsecureHttp
)

$ErrorActionPreference = "Stop"

if ($AgentReleaseLayout -and $AgentReleaseLayout -notmatch '^(github|default|legacy_direct)$') {
    Write-Error "Invalid AgentReleaseLayout. Must be 'github', 'default', or 'legacy_direct'."
    exit 1
}

if ($Services -and $Services -notmatch '^[A-Za-z0-9._@,$ \-]+$') {
    Write-Error "Services contains unsupported characters."
    exit 1
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "[*] DatrixOps Agent Installer (Windows)" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$TestMode = if ($env:DATRIXOPS_INSTALLER_TEST_MODE -eq "1") { $true } else { $false }
$TestRoot = if ($env:DATRIXOPS_INSTALLER_ROOT) { $env:DATRIXOPS_INSTALLER_ROOT } else { "" }

if (-not $TestMode) {
    # Ensure admin rights
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Error "Please run PowerShell as Administrator."
        exit 1
    }
}

$ServerUrl = $ServerUrl.TrimEnd("/")
$AgentArtifactBaseUrl = $AgentArtifactBaseUrl.TrimEnd("/")

if ($ServerUrl -notmatch '^https?://[A-Za-z0-9._:-]+$') {
    Write-Error "ServerUrl must be a valid HTTP or HTTPS URL."
    exit 1
}

if (-not $TestMode -and $AgentArtifactBaseUrl -notmatch '^https://') {
    Write-Error "AgentArtifactBaseUrl must be an HTTPS URL."
    exit 1
}

if ($ServerUrl -match '^http://') {
    $hostPart = ($ServerUrl -replace '^http://', '') -replace '/.*', '' -replace ':[0-9]+', ''
    if ($hostPart -ne "localhost" -and $hostPart -ne "127.0.0.1" -and -not $AllowInsecureHttp) {
        Write-Error "Insecure HTTP control-plane origin requires -AllowInsecureHttp switch. HTTP control planes should only be used on trusted private networks."
        exit 1
    }
    if ($AllowInsecureHttp) {
        Write-Warning "HTTP control plane transport is unencrypted. Credentials should only be sent over trusted networks."
    }
}

$ApiUrl = "$ServerUrl/api/v1"
$ArtifactName = "datrixops-agent-windows-amd64.exe"
$InstallDir = if ($TestRoot) { [System.IO.Path]::Combine($TestRoot, "Program Files", "DatrixOps") } else { "C:\Program Files\DatrixOps" }
$ExePath = "$InstallDir\datrixops-agent.exe"
$BatPath = "$InstallDir\run_agent.bat"
$TempDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "datrixops-installer-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

if ($AgentVersion -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
    Write-Error "AgentVersion must be a valid semver version (X.Y.Z)."
    exit 1
}

$BootstrapRollbackToken = $null
$Enrolled = $false

try {
    # Step 1: Pre-enrollment Artifact Download & Verification
    Write-Host "[*] Downloading release metadata..."
    $VersionPath = "$TempDir\agent-release.version"
    $ShaPath = "$TempDir\artifact.sha256"
    $SizePath = "$TempDir\artifact.size"
    $StagedPath = "$TempDir\datrixops-agent.exe"

    Invoke-WebRequest -Uri "$AgentArtifactBaseUrl/agent-release.version" -OutFile $VersionPath -TimeoutSec 30
    $RemoteVersion = (Get-Content $VersionPath -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($AgentVersion) -or $AgentVersion -eq "auto" -or $RemoteVersion -ne $AgentVersion) {
        $AgentVersion = $RemoteVersion
    }

    Invoke-WebRequest -Uri "$AgentArtifactBaseUrl/$ArtifactName.sha256" -OutFile $ShaPath -TimeoutSec 30
    Invoke-WebRequest -Uri "$AgentArtifactBaseUrl/$ArtifactName.size" -OutFile $SizePath -TimeoutSec 30

    $ExpectedSha = (Get-Content $ShaPath -Raw).Trim()
    $ExpectedSizeStr = (Get-Content $SizePath -Raw).Trim()

    if ($ExpectedSha -notmatch '^[a-fA-F0-9]{64}$') {
        throw "Release SHA-256 metadata format is invalid."
    }
    if ($ExpectedSizeStr -notmatch '^[0-9]+$' -or [int64]$ExpectedSizeStr -le 0) {
        throw "Release size metadata format is invalid."
    }
    $ExpectedSize = [int64]$ExpectedSizeStr

    Write-Host "[*] Downloading DatrixOps Agent binary..."
    Invoke-WebRequest -Uri "$AgentArtifactBaseUrl/$ArtifactName" -OutFile $StagedPath -TimeoutSec 180

    $ActualSize = (Get-Item $StagedPath).Length
    if ($ActualSize -ne $ExpectedSize) {
        throw "Downloaded binary size ($ActualSize bytes) does not match expected size ($ExpectedSize bytes)."
    }

    $ActualSha = (Get-FileHash -Path $StagedPath -Algorithm SHA256).Hash.ToLower()
    if ($ActualSha -ne $ExpectedSha.ToLower()) {
        throw "Downloaded binary SHA-256 ($ActualSha) does not match expected ($ExpectedSha)."
    }

    $header = [System.IO.File]::ReadAllBytes($StagedPath)[0..1]
    if ($header[0] -ne 0x4D -or $header[1] -ne 0x5A) {
        throw "Downloaded file is not a valid Windows executable."
    }
    Write-Host "[OK] Pre-enrollment binary verification succeeded (SHA-256 & size match)." -ForegroundColor Green

    # Step 2: Call Enrollment API
    Write-Host "[*] Enrolling this machine with DatrixOps..."
    $EnrollmentBody = @{
        token = $Token
        os_family = "windows"
        architecture = "amd64"
    } | ConvertTo-Json -Compress

    $Enrollment = Invoke-RestMethod `
        -Method Post `
        -Uri "$ApiUrl/agent/enroll" `
        -ContentType "application/json" `
        -Body $EnrollmentBody `
        -TimeoutSec 30

    $AgentToken = [string]$Enrollment.data.agent_token
    $BootstrapRollbackToken = [string]$Enrollment.data.bootstrap_rollback_token
    if ($AgentToken -notmatch '^[A-Za-z0-9_-]{32,256}$') {
        throw "Control plane returned an invalid Agent credential."
    }
    if ($BootstrapRollbackToken -notmatch '^[A-Za-z0-9_-]{32,256}$') {
        throw "Control plane returned an invalid bootstrap rollback credential."
    }
    $Enrolled = $true

    # Step 3: Install & Start Service
    $TaskName = "DatrixOpsAgent"
    Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue | Wait-Process -Timeout 30 -ErrorAction SilentlyContinue

    Move-Item -LiteralPath $StagedPath -Destination $ExePath -Force

    $LogPath = "$InstallDir\agent.log"
    $BatContent = @(
        "@echo off",
        "set `"DATRIXOPS_SERVER_URL=$ApiUrl`"",
        "set `"DATRIXOPS_AGENT_TOKEN=$AgentToken`"",
        "set `"DATRIXOPS_SERVICES=$Services`"",
        "set `"AGENT_VERSION=$AgentVersion`"",
        "set `"DATRIXOPS_AGENT_ARTIFACT_BASE_URL=$AgentArtifactBaseUrl`"",
        "set `"DATRIXOPS_AGENT_RELEASE_LAYOUT=$AgentReleaseLayout`"",
        "`"$ExePath`" >> `"$LogPath`" 2>&1"
    )
    $BatContent | Set-Content -Path $BatPath -Encoding ASCII
    if (-not $TestMode) {
        & icacls.exe $InstallDir /inheritance:r /grant:r "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" | Out-Null
    }

    if (-not $TestMode) {
        $Action = New-ScheduledTaskAction -Execute $BatPath
        $Trigger = New-ScheduledTaskTrigger -AtStartup
        $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)
        $Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null

        Start-ScheduledTask -TaskName $TaskName
    } else {
        if ($env:DATRIXOPS_MOCK_SCHTASKS_BIN) {
            & $env:DATRIXOPS_MOCK_SCHTASKS_BIN "install" $TaskName $BatPath
        }
    }
    Start-Sleep -Seconds 2

    if (-not $TestMode -and -not (Get-Process -Name "datrixops-agent" -ErrorAction SilentlyContinue)) {
        throw "DatrixOps Agent process failed to start."
    }

    # Step 4: Bounded Wait for Backend First-Heartbeat / Bootstrap Completion
    Write-Host "[*] Verifying first heartbeat with control plane..."
    $BootstrapConfirmed = $false
    for ($i = 1; $i -le 15; $i++) {
        try {
            $Headers = @{ Authorization = "Bearer $AgentToken" }
            $StatusRes = Invoke-RestMethod -Method Get -Uri "$ApiUrl/agent/bootstrap-status" -Headers $Headers -TimeoutSec 10 -ErrorAction SilentlyContinue
            if ($StatusRes -and $StatusRes.data.bootstrap_completed -eq $true) {
                $BootstrapConfirmed = $true
                break
            }
        } catch {}
        Start-Sleep -Seconds 1
    }

    if (-not $BootstrapConfirmed) {
        throw "Control plane did not confirm first heartbeat within timeout."
    }

    Write-Host "[OK] DatrixOps Agent installed and verified successfully!" -ForegroundColor Green
} catch {
    $err = $_
    if ($Enrolled -and $BootstrapRollbackToken) {
        Write-Host "[!] Rolling back enrollment token..." -ForegroundColor Yellow
        if (-not $TestMode) {
            Unregister-ScheduledTask -TaskName "DatrixOpsAgent" -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        } else {
            if ($env:DATRIXOPS_MOCK_SCHTASKS_BIN) {
                & $env:DATRIXOPS_MOCK_SCHTASKS_BIN "remove" $TaskName
            }
        }
        $RollbackBody = @{ rollback_token = $BootstrapRollbackToken } | ConvertTo-Json -Compress
        try {
            Invoke-RestMethod -Method Post -Uri "$ApiUrl/agent/enroll/rollback" -ContentType "application/json" -Body $RollbackBody -TimeoutSec 15 | Out-Null
            Remove-Item -Path $ExePath, $BatPath -Force -ErrorAction SilentlyContinue | Out-Null
            Write-Host "[!] Enrollment token successfully released." -ForegroundColor Yellow
        } catch {
            $RecoveryFile = "$InstallDir\bootstrap-recovery.json"
            $RecoveryData = @{ rollback_token = $BootstrapRollbackToken; server_url = $ServerUrl } | ConvertTo-Json
            $RecoveryData | Set-Content -Path $RecoveryFile -Encoding ASCII
            if (-not $TestMode) {
                & icacls.exe $RecoveryFile /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" | Out-Null
            }
            Write-Warning "Rollback API call failed. Recovery state saved to $RecoveryFile (mode 0600). Operator may retry rollback before token expiry."
        }
    }
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue | Out-Null
    throw $err
} finally {
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue | Out-Null
}
