# ==============================================================================
# DatrixOps Network Diagnostics Tool (PowerShell for Windows)
# 6-Step comprehensive network health & error detection
# ==============================================================================
$ErrorActionPreference = "SilentlyContinue"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  DatrixOps Network Diagnostics & Troubleshooting (Windows)  " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Timestamp: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss UTC'))"
Write-Host "  Host:      $env:COMPUTERNAME (Windows)"

$OverallStatus = "HEALTHY"
$Issues = @()
$Warnings = @()

function Log-Header($step, $title) {
    Write-Host "`n=== Step $step: $title ===" -ForegroundColor Blue
}

function Log-Pass($msg) {
    Write-Host "  ✔ [OK] $msg" -ForegroundColor Green
}

function Log-Warn($msg) {
    Write-Host "  ⚠ [WARN] $msg" -ForegroundColor Yellow
    $script:Warnings += $msg
    if ($script:OverallStatus -eq "HEALTHY") {
        $script:OverallStatus = "WARNING"
    }
}

function Log-Fail($msg) {
    Write-Host "  ✖ [FAIL] $msg" -ForegroundColor Red
    $script:Issues += $msg
    $script:OverallStatus = "CRITICAL"
}

function Log-Info($msg) {
    Write-Host "  ℹ [INFO] $msg" -ForegroundColor DarkCyan
}

# ==============================================================================
# Step 1: Default Route & Primary Uplink Interface
# ==============================================================================
Log-Header 1 "Default Route & Primary Uplink Interface"

$DefaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
$PrimaryIface = $null
$DefaultGateway = ""

if ($DefaultRoute) {
    $DefaultGateway = $DefaultRoute.NextHop
    $IfaceIndex = $DefaultRoute.InterfaceIndex
    $PrimaryIface = Get-NetAdapter -InterfaceIndex $IfaceIndex -ErrorAction SilentlyContinue
}

if (-not $PrimaryIface) {
    $PrimaryIface = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1
}

if ($PrimaryIface -and $DefaultGateway) {
    Log-Pass "Primary Uplink Interface: $($PrimaryIface.Name) ($($PrimaryIface.InterfaceDescription))"
    Log-Pass "Default Gateway IP:       $DefaultGateway"
    $IPConfig = Get-NetIPAddress -InterfaceIndex $PrimaryIface.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($IPConfig) { Log-Info "Interface IPv4:  $($IPConfig.IPAddress)" }
    Log-Info "Interface MAC:   $($PrimaryIface.MacAddress)"
} elseif ($PrimaryIface) {
    Log-Warn "Primary Uplink Interface: $($PrimaryIface.Name) (Default Gateway not resolved)"
} else {
    Log-Fail "No active network interface or default route detected!"
}

# ==============================================================================
# Step 2: Gateway Reachability & Latency (5 Packets)
# ==============================================================================
Log-Header 2 "Gateway Reachability & Latency Test (5 packets)"

if ($DefaultGateway) {
    Log-Info "Pinging Default Gateway ($DefaultGateway)..."
    $PingRes = Test-Connection -ComputerName $DefaultGateway -Count 5 -ErrorAction SilentlyContinue
    $Received = ($PingRes | Measure-Object).Count
    $Lost = 5 - $Received
    $LossPct = ($Lost / 5.0) * 100.0

    if ($Received -gt 0) {
        $AvgLat = ($PingRes | Measure-Object -Property ResponseTime -Average).Average
        if ($LossPct -eq 0) {
            Log-Pass "Gateway Reachable: 0% packet loss (Avg Latency: $([math]::Round($AvgLat, 1)) ms)"
        } elseif ($LossPct -lt 40) {
            Log-Warn "Gateway Degraded: $LossPct% packet loss (Avg Latency: $([math]::Round($AvgLat, 1)) ms)"
        } else {
            Log-Fail "Gateway Critical: $LossPct% packet loss! High drop rate to next-hop gateway."
        }

        if ($AvgLat -gt 100) {
            Log-Warn "High Gateway Latency: $([math]::Round($AvgLat, 1)) ms (Expected < 50ms)"
        }
    } else {
        Log-Fail "Gateway Critical: 100% packet loss! Default gateway unreachable."
    }
} else {
    Log-Fail "Skipped gateway ping: No default gateway IP available."
}

# ==============================================================================
# Step 3: DNS Resolution & Resolver Health Check
# ==============================================================================
Log-Header 3 "DNS Resolution & Resolver Health Check"

$Domains = @("google.com", "cloudflare.com", "github.com")
$DnsSuccess = 0

foreach ($domain in $Domains) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $dnsRecord = Resolve-DnsName -Name $domain -Type A -QuickTimeout -ErrorAction SilentlyContinue | Select-Object -First 1
    $sw.Stop()

    if ($dnsRecord -and $dnsRecord.IPAddress) {
        Log-Pass "DNS: $domain -> $($dnsRecord.IPAddress) ($($sw.ElapsedMilliseconds) ms)"
        $DnsSuccess++
    } else {
        Log-Fail "DNS: Failed to resolve $domain (timeout or NXDOMAIN)"
    }
}

if ($DnsSuccess -eq 0) {
    Log-Info "Testing direct query to Public DNS (1.1.1.1)..."
    $publicDns = Resolve-DnsName -Name "google.com" -Server "1.1.1.1" -QuickTimeout -ErrorAction SilentlyContinue
    if ($publicDns) {
        Log-Warn "Local DNS resolver is failing, but direct upstream DNS (1.1.1.1) works!"
    } else {
        Log-Fail "DNS is completely unreachable (Local resolver and 1.1.1.1 both failed)!"
    }
}

# ==============================================================================
# Step 4: Outbound HTTPS Internet Connectivity (Egress)
# ==============================================================================
Log-Header 4 "Outbound HTTPS Connectivity (Egress Ports 80/443)"

function Test-Https($url, $name) {
    try {
        $req = [System.Net.HttpWebRequest]::Create($url)
        $req.Timeout = 4000
        $req.Method = "HEAD"
        $resp = $req.GetResponse()
        $resp.Close()
        Log-Pass "HTTPS Egress to $name ($url)"
        return $true
    } catch {
        Log-Fail "HTTPS Egress to $name ($url) timed out or blocked!"
        return $false
    }
}

Test-Https "https://1.1.1.1" "Cloudflare 1.1.1.1 (Direct IP / No DNS)" | Out-Null
Test-Https "https://www.google.com" "Google (Domain & SSL validation)" | Out-Null

# ==============================================================================
# Step 5: DatrixOps Dependencies & Container Registries
# ==============================================================================
Log-Header 5 "DatrixOps Dependencies & Registries"

$Endpoints = @(
    @{ Url = "https://api.github.com"; Desc = "GitHub API (Releases / Agent Update)" },
    @{ Url = "https://ghcr.io"; Desc = "GitHub Container Registry (Docker Images)" },
    @{ Url = "https://raw.githubusercontent.com"; Desc = "GitHub Raw (Install Scripts)" }
)

foreach ($ep in $Endpoints) {
    try {
        $req = [System.Net.HttpWebRequest]::Create($ep.Url)
        $req.Timeout = 4000
        $req.Method = "HEAD"
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
        Log-Pass "$($ep.Desc) (HTTP $code)"
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
            Log-Pass "$($ep.Desc) (HTTP $code)"
        } else {
            Log-Warn "$($ep.Desc) ($($ep.Url)) unreachable or timed out"
        }
    } catch {
        Log-Warn "$($ep.Desc) ($($ep.Url)) unreachable or timed out"
    }
}

# ==============================================================================
# Step 6: Local Service Ports & Interface Drop/Error Counters
# ==============================================================================
Log-Header 6 "Local Service Ports & Interface Drops/Errors"

function Test-LocalPort($port, $svc) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Log-Pass "Service Port :$port ($svc) is LISTENING"
    } else {
        Log-Info "Service Port :$port ($svc) is NOT active locally"
    }
}

Test-LocalPort 80 "HTTP / Web Proxy"
Test-LocalPort 443 "HTTPS / Web SSL"
Test-LocalPort 8080 "DatrixOps Core Service"

Write-Host ""
Log-Info "Inspecting network adapter packet statistics..."
$Adapters = Get-NetAdapter -ErrorAction SilentlyContinue
foreach ($a in $Adapters) {
    $stats = Get-NetAdapterStatistics -Name $a.Name -ErrorAction SilentlyContinue
    if ($stats) {
        $drops = $stats.ReceivedDiscardedPackets + $stats.OutboundDiscardedPackets
        $errs = $stats.ReceivedPacketErrors + $stats.OutboundPacketErrors
        Log-Info "Adapter $($a.Name): InBytes=$($stats.ReceivedBytes), OutBytes=$($stats.SentBytes), Drops=$drops, Errors=$errs"

        if ($a.Name -eq $PrimaryIface.Name -and $errs -gt 0) {
            Log-Fail "Primary uplink $($a.Name) has accumulated $errs physical packet errors!"
        } elseif ($errs -gt 0 -and $a.Virtual -eq $false) {
            Log-Warn "Physical adapter $($a.Name) has accumulated $errs physical packet errors."
        }
        if ($a.Name -eq $PrimaryIface.Name -and $drops -gt 0) {
            Log-Warn "Primary uplink $($a.Name) has accumulated $drops packet drops (buffer congestion)."
        }
    }
}

# ==============================================================================
# Summary & Diagnosis Verdict
# ==============================================================================
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  Diagnostics Summary Verdict                              " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if ($OverallStatus -eq "HEALTHY") {
    Write-Host "  Status:  🟢 HEALTHY" -ForegroundColor Green
    Write-Host "  Details: All network layers (Gateway, DNS, Egress, Ports) operational."
    Write-Host "           Zero packet loss and no physical errors detected."
    exit 0
} elseif ($OverallStatus -eq "WARNING") {
    Write-Host "  Status:  🟡 WARNING" -ForegroundColor Yellow
    Write-Host "  Details: Network is operational with non-fatal performance issues:"
    foreach ($w in $Warnings) { Write-Host "           - $w" }
    exit 0
} else {
    Write-Host "  Status:  🔴 CRITICAL" -ForegroundColor Red
    Write-Host "  Details: Severe network connectivity or hardware error detected:"
    foreach ($issue in $Issues) { Write-Host "           - $issue" }
    exit 1
}
