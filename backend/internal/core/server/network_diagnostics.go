package server

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ---------- Configuration Constants ----------

const (
	// ProbesPerTarget is the number of probes sent to each target per diagnostic run.
	ProbesPerTarget = 5

	// ProbeIntervalMs is the approximate pacing between probes to the same target.
	ProbeIntervalMs = 80

	// ICMPTimeoutSec is the per-probe ICMP timeout in seconds.
	ICMPTimeoutSec = 2

	// TCPProbeTimeout is the per-probe TCP connection timeout.
	TCPProbeTimeout = 2500 * time.Millisecond
)

// ---------- Gateway Thresholds ----------

const (
	GatewayLatencyCritical = 50.0
	GatewayLatencyWarning  = 5.0
	GatewayLossCritical    = 20.0
)

// ---------- Domestic Thresholds ----------

const (
	DomesticLatencyCritical = 60.0
	DomesticLatencyWarning  = 25.0
	DomesticLossCritical    = 20.0
)

// ---------- International Thresholds ----------

const (
	InternationalLatencyCritical = 160.0
	InternationalLatencyWarning  = 90.0
	InternationalLossCritical    = 20.0
)

// ---------- Data Models ----------

// NetworkTargetProbe represents the multi-probe measurement result for a single target.
type NetworkTargetProbe struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Category         string   `json:"category"` // "domestic" | "international"
	Host             string   `json:"host"`
	Port             int      `json:"port"`
	Location         string   `json:"location"`
	ProbeMethod      string   `json:"probe_method"` // "ICMP" | "TCP"
	ProbeStatus      string   `json:"probe_status"` // "success" | "timeout" | "refused" | "unavailable" | "unsupported"
	TotalProbes      int      `json:"total_probes"`
	SuccessfulProbes int      `json:"successful_probes"`
	FailedProbes     int      `json:"failed_probes"`
	PacketLoss       *float64 `json:"packet_loss"` // nil for TCP measurements (N/A)
	LatencyMs        float64  `json:"latency_ms"`  // average of successful probes only
	MinLatencyMs     float64  `json:"min_latency_ms"`
	MaxLatencyMs     float64  `json:"max_latency_ms"`
	Status           string   `json:"status"` // "optimal" | "warning" | "critical" | "reachable" | "unreachable"
	ErrorMessage     string   `json:"error_message,omitempty"`
}

// NetworkPillarResult represents an aggregate summary for Gateway, Domestic, or International.
type NetworkPillarResult struct {
	Status            string   `json:"status"` // "optimal" | "warning" | "critical" | "unavailable" | "reachable"
	LatencyMs         float64  `json:"latency_ms"`
	PacketLoss        *float64 `json:"packet_loss"` // nil if no ICMP probes available
	TotalProbes       int      `json:"total_probes"`
	SuccessfulProbes  int      `json:"successful_probes"`
	FailedProbes      int      `json:"failed_probes"`
	MeasurementMethod string   `json:"measurement_method"` // "ICMP" | "TCP" | "MIXED"
	Summary           string   `json:"summary"`
}

// NetworkAlertEvaluation evaluates whether network health exceeds operational alert thresholds.
type NetworkAlertEvaluation struct {
	IsTriggered     bool     `json:"is_triggered"`
	Severity        string   `json:"severity"` // "none" | "warning" | "critical"
	Reasons         []string `json:"reasons"`
	SuggestedAction string   `json:"suggested_action,omitempty"`
}

// ServerNetworkTelemetry merges agent-reported local NIC and gateway data.
type ServerNetworkTelemetry struct {
	PrimaryUplink     string  `json:"primary_uplink,omitempty"`
	DefaultGateway    string  `json:"default_gateway,omitempty"`
	GatewayLatencyMs  float64 `json:"gateway_latency_ms,omitempty"`
	GatewayPacketLoss float64 `json:"gateway_packet_loss"`
	DNSLatencyMs      float64 `json:"dns_latency_ms,omitempty"`
	DNSResolvable     bool    `json:"dns_resolvable"`
	ActiveErrors      uint64  `json:"active_errors"`
	ActiveDropped     uint64  `json:"active_dropped"`
	LifetimeErrors    uint64  `json:"lifetime_errors"`
	LifetimeDropped   uint64  `json:"lifetime_dropped"`
	ErrorRatePerMin   float64 `json:"error_rate_per_min"`
	DropRatePerMin    float64 `json:"drop_rate_per_min"`
	Status            string  `json:"status"`
	StatusReason      string  `json:"status_reason,omitempty"`
}

// NetworkDiagnosticReport is the comprehensive network diagnostic report.
type NetworkDiagnosticReport struct {
	ServerID            string                  `json:"server_id"`
	ServerName          string                  `json:"server_name"`
	Timestamp           time.Time               `json:"timestamp"`
	SampleSize          int                     `json:"sample_size"`
	Gateway             NetworkPillarResult     `json:"gateway"`
	Domestic            NetworkPillarResult     `json:"domestic"`
	International       NetworkPillarResult     `json:"international"`
	DomesticProbes      []NetworkTargetProbe    `json:"domestic_probes"`
	InternationalProbes []NetworkTargetProbe    `json:"international_probes"`
	AlertEvaluation     NetworkAlertEvaluation  `json:"alert_evaluation"`
	ServerTelemetry     *ServerNetworkTelemetry `json:"server_telemetry,omitempty"`
}

// ---------- Target Definitions ----------

type targetDefinition struct {
	id       string
	name     string
	category string
	host     string
	port     int // 0 means ICMP-only (no TCP port)
	location string
}

var domesticTargets = []targetDefinition{
	{id: "viettel", name: "Viettel Telecom Core", category: "domestic", host: "203.113.131.1", port: 0, location: "Hanoi / Nationwide"},
	{id: "vnpt", name: "VNPT Telecom Core", category: "domestic", host: "203.162.4.190", port: 0, location: "HCMC / Nationwide"},
	{id: "fpt", name: "FPT Telecom Core", category: "domestic", host: "210.245.24.20", port: 0, location: "Hanoi / HCMC"},
	{id: "vnnic", name: "VNNIC (National VNIX Exchange)", category: "domestic", host: "203.119.9.9", port: 0, location: "National VNIX POP"},
	{id: "core-dc", name: "Core Data Center", category: "domestic", host: "103.200.23.1", port: 0, location: "HCMC Data Center"},
}

var internationalTargets = []targetDefinition{
	{id: "cloudflare", name: "Cloudflare DNS", category: "international", host: "1.1.1.1", port: 0, location: "APAC Anycast"},
	{id: "google", name: "Google DNS", category: "international", host: "8.8.8.8", port: 0, location: "Global Anycast"},
	{id: "github", name: "GitHub API", category: "international", host: "api.github.com", port: 443, location: "US East / Global CDN"},
	{id: "aws", name: "AWS APAC", category: "international", host: "s3.ap-southeast-1.amazonaws.com", port: 443, location: "Singapore Region"},
}

// ---------- ICMP Ping Implementation ----------

// icmpPingResult holds the parsed result of a multi-probe ICMP ping.
type icmpPingResult struct {
	available   bool
	total       int
	received    int
	lost        int
	lossPercent float64
	avgMs       float64
	minMs       float64
	maxMs       float64
}

// runICMPPing shells out to the OS ping command. Returns parsed result.
// count is the number of pings. timeoutSec is the per-packet wait timeout.
func runICMPPing(ctx context.Context, host string, count int, timeoutSec int) icmpPingResult {
	var cmd *exec.Cmd
	countStr := strconv.Itoa(count)
	timeoutStr := strconv.Itoa(timeoutSec)

	switch runtime.GOOS {
	case "darwin":
		cmd = exec.CommandContext(ctx, "ping", "-c", countStr, "-t", timeoutStr, host)
	case "windows":
		wMs := strconv.Itoa(timeoutSec * 1000)
		cmd = exec.CommandContext(ctx, "ping", "-n", countStr, "-w", wMs, host)
	default: // linux
		cmd = exec.CommandContext(ctx, "ping", "-c", countStr, "-W", timeoutStr, host)
	}

	out, err := cmd.Output()
	if err != nil && len(out) == 0 {
		return icmpPingResult{available: false}
	}

	return parsePingOutput(string(out), count)
}

// parsePingOutput extracts loss and latency from ping command output.
func parsePingOutput(output string, expectedCount int) icmpPingResult {
	result := icmpPingResult{
		available: true,
		total:     expectedCount,
	}

	// Parse packet loss
	lossRe := regexp.MustCompile(`(\d+(?:\.\d+)?)\s*%\s*(?:packet\s+)?loss`)
	if m := lossRe.FindStringSubmatch(output); len(m) > 1 {
		if v, err := strconv.ParseFloat(m[1], 64); err == nil {
			result.lossPercent = v
		}
	}

	// Parse received packets: "X packets received" or "Received = X"
	recvRe := regexp.MustCompile(`(\d+)\s*(?:packets?\s*)?received|Received\s*=\s*(\d+)`)
	if m := recvRe.FindStringSubmatch(output); len(m) > 0 {
		for i := 1; i < len(m); i++ {
			if m[i] != "" {
				if v, err := strconv.Atoi(m[i]); err == nil {
					result.received = v
				}
				break
			}
		}
	}
	if result.received == 0 && result.lossPercent < 100 {
		result.received = expectedCount
	}
	result.lost = result.total - result.received
	if result.lost < 0 {
		result.lost = 0
	}

	// Recalculate loss from actual counts if we have received info
	if result.total > 0 {
		result.lossPercent = float64(result.lost) / float64(result.total) * 100
	}

	// Parse RTT statistics: min/avg/max or Minimum/Average/Maximum
	rttRe := regexp.MustCompile(`(?:rtt|round-trip)\s+min/avg/max/(?:mdev|stddev)\s*=\s*([\d.]+)/([\d.]+)/([\d.]+)`)
	if m := rttRe.FindStringSubmatch(output); len(m) > 3 {
		result.minMs, _ = strconv.ParseFloat(m[1], 64)
		result.avgMs, _ = strconv.ParseFloat(m[2], 64)
		result.maxMs, _ = strconv.ParseFloat(m[3], 64)
	} else {
		// Windows format: Minimum = Xms, Maximum = Xms, Average = Xms
		winRe := regexp.MustCompile(`Minimum\s*=\s*(\d+)\s*ms.*Maximum\s*=\s*(\d+)\s*ms.*Average\s*=\s*(\d+)\s*ms`)
		if m := winRe.FindStringSubmatch(output); len(m) > 3 {
			result.minMs, _ = strconv.ParseFloat(m[1], 64)
			result.maxMs, _ = strconv.ParseFloat(m[2], 64)
			result.avgMs, _ = strconv.ParseFloat(m[3], 64)
		}
	}

	return result
}

// ---------- TCP Probe Implementation ----------

// tcpProbeResult holds the result of multi-probe TCP connection tests.
type tcpProbeResult struct {
	total     int
	success   int
	failed    int
	avgMs     float64
	minMs     float64
	maxMs     float64
	lastError string
}

// runTCPProbe performs multiple TCP connection probes with pacing.
func runTCPProbe(ctx context.Context, host string, port int, count int) tcpProbeResult {
	result := tcpProbeResult{total: count}
	var latencies []float64

	// For hostname targets, resolve DNS first so TCP latency is pure handshake.
	ip := host
	if net.ParseIP(host) == nil {
		ips, err := net.DefaultResolver.LookupHost(ctx, host)
		if err != nil || len(ips) == 0 {
			result.failed = count
			result.lastError = fmt.Sprintf("DNS resolution failed: %v", err)
			return result
		}
		ip = ips[0]
	}

	addr := net.JoinHostPort(ip, strconv.Itoa(port))

	for i := 0; i < count; i++ {
		if i > 0 {
			time.Sleep(time.Duration(ProbeIntervalMs) * time.Millisecond)
		}

		d := net.Dialer{Timeout: TCPProbeTimeout}
		t0 := time.Now()
		conn, err := d.DialContext(ctx, "tcp", addr)
		elapsed := time.Since(t0)

		if err != nil {
			result.failed++
			result.lastError = err.Error()
			continue
		}
		_ = conn.Close()

		ms := math.Round(elapsed.Seconds()*10000) / 10
		if ms < 0.1 {
			ms = 0.1
		}
		latencies = append(latencies, ms)
	}

	result.success = result.total - result.failed

	if len(latencies) > 0 {
		var sum float64
		result.minMs = latencies[0]
		result.maxMs = latencies[0]
		for _, l := range latencies {
			sum += l
			if l < result.minMs {
				result.minMs = l
			}
			if l > result.maxMs {
				result.maxMs = l
			}
		}
		result.avgMs = math.Round(sum/float64(len(latencies))*10) / 10
	}

	return result
}

// ---------- Per-Target Probing ----------

// probeTarget runs a full multi-probe measurement against a single target.
// It tries ICMP first; if ICMP is unavailable, falls back to TCP.
func probeTarget(ctx context.Context, target targetDefinition) NetworkTargetProbe {
	probe := NetworkTargetProbe{
		ID:          target.id,
		Name:        target.name,
		Category:    target.category,
		Host:        target.host,
		Port:        target.port,
		Location:    target.location,
		TotalProbes: ProbesPerTarget,
	}

	// Try ICMP first (for IP-based targets)
	if net.ParseIP(target.host) != nil {
		icmpResult := runICMPPing(ctx, target.host, ProbesPerTarget, ICMPTimeoutSec)
		if icmpResult.available && icmpResult.total > 0 {
			probe.ProbeMethod = "ICMP"
			probe.SuccessfulProbes = icmpResult.received
			probe.FailedProbes = icmpResult.lost
			loss := math.Round(icmpResult.lossPercent*10) / 10
			probe.PacketLoss = &loss
			probe.LatencyMs = math.Round(icmpResult.avgMs*10) / 10
			probe.MinLatencyMs = math.Round(icmpResult.minMs*10) / 10
			probe.MaxLatencyMs = math.Round(icmpResult.maxMs*10) / 10

			if probe.SuccessfulProbes > 0 {
				probe.ProbeStatus = "success"
			} else {
				probe.ProbeStatus = "timeout"
			}

			probe.Status = evaluateTargetStatus(target.category, probe.PacketLoss, probe.LatencyMs, probe.ProbeMethod)
			return probe
		}
	}

	// Fallback to TCP if ICMP unavailable or target is a hostname
	tcpPort := target.port
	if tcpPort == 0 {
		tcpPort = 53 // DNS port for IP targets that didn't respond to ICMP
	}

	probe.Port = tcpPort
	tcpResult := runTCPProbe(ctx, target.host, tcpPort, ProbesPerTarget)
	probe.ProbeMethod = "TCP"
	probe.TotalProbes = tcpResult.total
	probe.SuccessfulProbes = tcpResult.success
	probe.FailedProbes = tcpResult.failed
	probe.PacketLoss = nil // TCP does not produce ICMP packet loss
	probe.LatencyMs = tcpResult.avgMs
	probe.MinLatencyMs = tcpResult.minMs
	probe.MaxLatencyMs = tcpResult.maxMs

	if tcpResult.success > 0 {
		probe.ProbeStatus = "success"
		probe.Status = "reachable"
	} else {
		probe.ProbeStatus = "timeout"
		probe.Status = "unreachable"
		probe.ErrorMessage = tcpResult.lastError
	}

	return probe
}

// evaluateTargetStatus determines status for an individual target using Critical-first.
func evaluateTargetStatus(category string, packetLoss *float64, latencyMs float64, method string) string {
	if method == "TCP" {
		return "reachable"
	}

	loss := 0.0
	if packetLoss != nil {
		loss = *packetLoss
	}

	switch category {
	case "domestic":
		if loss >= DomesticLossCritical || latencyMs > DomesticLatencyCritical {
			return "critical"
		}
		if loss > 0 || latencyMs > DomesticLatencyWarning {
			return "warning"
		}
		return "optimal"
	default: // international
		if loss >= InternationalLossCritical || latencyMs > InternationalLatencyCritical {
			return "critical"
		}
		if loss > 0 || latencyMs > InternationalLatencyWarning {
			return "warning"
		}
		return "optimal"
	}
}

// ---------- Pillar Aggregation ----------

// aggregatePillar calculates the aggregate result for a set of probes.
// It only uses ICMP probes for packet loss calculation.
// ICMP and TCP latencies are never mixed.
func aggregatePillar(probes []NetworkTargetProbe) NetworkPillarResult {
	result := NetworkPillarResult{}

	var icmpProbes, tcpProbes []NetworkTargetProbe
	for _, p := range probes {
		if p.ProbeMethod == "ICMP" {
			icmpProbes = append(icmpProbes, p)
		} else {
			tcpProbes = append(tcpProbes, p)
		}
	}

	hasICMP := len(icmpProbes) > 0
	hasTCP := len(tcpProbes) > 0

	if hasICMP && hasTCP {
		result.MeasurementMethod = "MIXED"
	} else if hasICMP {
		result.MeasurementMethod = "ICMP"
	} else if hasTCP {
		result.MeasurementMethod = "TCP"
	} else {
		result.MeasurementMethod = "ICMP"
	}

	// Calculate totals across all probes
	for _, p := range probes {
		result.TotalProbes += p.TotalProbes
		result.SuccessfulProbes += p.SuccessfulProbes
		result.FailedProbes += p.FailedProbes
	}

	// Aggregate packet loss from ICMP probes only
	if hasICMP {
		var totalICMPProbes, failedICMPProbes int
		var icmpLatencySum float64
		var icmpSuccessCount int

		for _, p := range icmpProbes {
			totalICMPProbes += p.TotalProbes
			failedICMPProbes += p.FailedProbes
			if p.SuccessfulProbes > 0 {
				icmpLatencySum += p.LatencyMs * float64(p.SuccessfulProbes)
				icmpSuccessCount += p.SuccessfulProbes
			}
		}

		if totalICMPProbes > 0 {
			loss := math.Round(float64(failedICMPProbes)/float64(totalICMPProbes)*1000) / 10
			result.PacketLoss = &loss
		}

		// Category latency comes from ICMP when available
		if icmpSuccessCount > 0 {
			result.LatencyMs = math.Round(icmpLatencySum/float64(icmpSuccessCount)*10) / 10
		}
	} else if hasTCP {
		// If only TCP, use TCP latency but packet loss stays nil
		result.PacketLoss = nil
		var tcpLatencySum float64
		var tcpSuccessCount int
		for _, p := range tcpProbes {
			if p.SuccessfulProbes > 0 {
				tcpLatencySum += p.LatencyMs * float64(p.SuccessfulProbes)
				tcpSuccessCount += p.SuccessfulProbes
			}
		}
		if tcpSuccessCount > 0 {
			result.LatencyMs = math.Round(tcpLatencySum/float64(tcpSuccessCount)*10) / 10
		}
	}

	return result
}

// evaluatePillarStatus determines the pillar status using Critical-first evaluation order.
func evaluatePillarStatus(pillar *NetworkPillarResult, lossCrit, latWarn, latCrit float64) {
	if pillar.TotalProbes == 0 || pillar.SuccessfulProbes == 0 {
		pillar.Status = "unavailable"
		pillar.Summary = "Network quality could not be measured using the available probe method."
		return
	}

	loss := 0.0
	hasLoss := pillar.PacketLoss != nil
	if hasLoss {
		loss = *pillar.PacketLoss
	}

	// Critical first
	if (hasLoss && loss >= lossCrit) || pillar.LatencyMs > latCrit {
		pillar.Status = "critical"
		pillar.Summary = "Significant network degradation was detected during this test."
		return
	}

	// Then warning
	if (hasLoss && loss > 0) || pillar.LatencyMs > latWarn {
		pillar.Status = "warning"
		pillar.Summary = "Slightly elevated latency or packet loss was detected."
		return
	}

	// If only TCP with no packet loss info, status is "reachable"
	if !hasLoss {
		pillar.Status = "reachable"
		pillar.Summary = "TCP connectivity confirmed; ICMP measurement unavailable."
		return
	}

	pillar.Status = "optimal"
	pillar.Summary = "Network connectivity is operating normally."
}

// ---------- Gateway Probing ----------

// probeGateway runs ICMP probes against the default gateway from agent telemetry.
func probeGateway(ctx context.Context, telemetry *ServerNetworkTelemetry) NetworkPillarResult {
	result := NetworkPillarResult{
		MeasurementMethod: "ICMP",
	}

	if telemetry == nil || telemetry.DefaultGateway == "" {
		result.Status = "unavailable"
		result.Summary = "Default gateway information is not available from the agent."
		return result
	}

	gw := telemetry.DefaultGateway

	// Use agent-reported data first (the agent already runs ICMP pings to the gateway)
	if telemetry.GatewayLatencyMs > 0 || telemetry.GatewayPacketLoss > 0 {
		result.LatencyMs = math.Round(telemetry.GatewayLatencyMs*10) / 10
		loss := math.Round(telemetry.GatewayPacketLoss*10) / 10
		result.PacketLoss = &loss
		result.TotalProbes = 5
		result.SuccessfulProbes = 5 - int(math.Round(telemetry.GatewayPacketLoss/100*5))
		if result.SuccessfulProbes < 0 {
			result.SuccessfulProbes = 0
		}
		result.FailedProbes = result.TotalProbes - result.SuccessfulProbes

		evaluatePillarStatus(&result, GatewayLossCritical, GatewayLatencyWarning, GatewayLatencyCritical)
		return result
	}

	// Fallback: run ICMP from the backend server itself
	icmpResult := runICMPPing(ctx, gw, ProbesPerTarget, ICMPTimeoutSec)
	if !icmpResult.available {
		result.Status = "unavailable"
		result.Summary = "ICMP probe to gateway is not available from the server environment."
		return result
	}

	result.TotalProbes = icmpResult.total
	result.SuccessfulProbes = icmpResult.received
	result.FailedProbes = icmpResult.lost
	result.LatencyMs = math.Round(icmpResult.avgMs*10) / 10
	loss := math.Round(icmpResult.lossPercent*10) / 10
	result.PacketLoss = &loss

	evaluatePillarStatus(&result, GatewayLossCritical, GatewayLatencyWarning, GatewayLatencyCritical)
	return result
}

// ---------- Main Diagnostic Entry Point ----------

// RunNetworkDiagnostic executes concurrent network diagnostics for gateway, domestic & international targets.
func RunNetworkDiagnostic(ctx context.Context, serverID, serverName string, serverSnapshotRaw []byte) *NetworkDiagnosticReport {
	report := &NetworkDiagnosticReport{
		ServerID:   serverID,
		ServerName: serverName,
		Timestamp:  time.Now(),
		SampleSize: ProbesPerTarget,
	}

	// Parse server telemetry from snapshot if available
	var telemetry *ServerNetworkTelemetry
	if len(serverSnapshotRaw) > 0 {
		var snap struct {
			NetworkDiagnostics *ServerNetworkTelemetry `json:"network_diagnostics"`
		}
		if err := json.Unmarshal(serverSnapshotRaw, &snap); err == nil && snap.NetworkDiagnostics != nil {
			telemetry = snap.NetworkDiagnostics
			report.ServerTelemetry = telemetry
		}
	}

	// Gateway probe (from agent telemetry or server-side ICMP)
	report.Gateway = probeGateway(ctx, telemetry)

	// Probe all domestic and international targets concurrently
	allTargets := make([]targetDefinition, 0, len(domesticTargets)+len(internationalTargets))
	allTargets = append(allTargets, domesticTargets...)
	allTargets = append(allTargets, internationalTargets...)
	probeResults := make([]NetworkTargetProbe, len(allTargets))

	var wg sync.WaitGroup
	for i, tgt := range allTargets {
		wg.Add(1)
		go func(idx int, t targetDefinition) {
			defer wg.Done()
			probeResults[idx] = probeTarget(ctx, t)
		}(i, tgt)
	}
	wg.Wait()

	// Split results into domestic and international
	var domProbes, intProbes []NetworkTargetProbe
	for _, p := range probeResults {
		if p.Category == "domestic" {
			domProbes = append(domProbes, p)
		} else {
			intProbes = append(intProbes, p)
		}
	}
	report.DomesticProbes = domProbes
	report.InternationalProbes = intProbes

	// Aggregate pillars
	report.Domestic = aggregatePillar(domProbes)
	evaluatePillarStatus(&report.Domestic, DomesticLossCritical, DomesticLatencyWarning, DomesticLatencyCritical)

	report.International = aggregatePillar(intProbes)
	evaluatePillarStatus(&report.International, InternationalLossCritical, InternationalLatencyWarning, InternationalLatencyCritical)

	// Evaluate alert criteria
	report.AlertEvaluation = evaluateAlerts(report)

	return report
}

// evaluateAlerts builds the alert evaluation from pillar results.
func evaluateAlerts(report *NetworkDiagnosticReport) NetworkAlertEvaluation {
	var reasons []string
	isCritical := false
	isWarning := false

	// Gateway
	if report.Gateway.Status == "critical" {
		reasons = append(reasons, fmt.Sprintf("Gateway connectivity critical (Latency: %.1f ms)", report.Gateway.LatencyMs))
		isCritical = true
	} else if report.Gateway.Status == "warning" {
		reasons = append(reasons, fmt.Sprintf("Gateway latency elevated (%.1f ms)", report.Gateway.LatencyMs))
		isWarning = true
	}

	// Domestic
	if report.Domestic.PacketLoss != nil {
		loss := *report.Domestic.PacketLoss
		if loss >= DomesticLossCritical {
			reasons = append(reasons, fmt.Sprintf("Domestic packet loss %.1f%% exceeds critical threshold", loss))
			isCritical = true
		} else if loss > 0 {
			reasons = append(reasons, fmt.Sprintf("Domestic packet loss detected (%.1f%%)", loss))
			isWarning = true
		}
	}
	if report.Domestic.LatencyMs > DomesticLatencyCritical {
		reasons = append(reasons, fmt.Sprintf("Domestic latency %.1f ms exceeds critical threshold", report.Domestic.LatencyMs))
		isCritical = true
	} else if report.Domestic.LatencyMs > DomesticLatencyWarning {
		reasons = append(reasons, fmt.Sprintf("Domestic latency elevated (%.1f ms)", report.Domestic.LatencyMs))
		isWarning = true
	}

	// International
	if report.International.PacketLoss != nil {
		loss := *report.International.PacketLoss
		if loss >= InternationalLossCritical {
			reasons = append(reasons, fmt.Sprintf("International packet loss %.1f%% exceeds critical threshold", loss))
			isCritical = true
		} else if loss > 0 {
			reasons = append(reasons, fmt.Sprintf("International packet loss detected (%.1f%%)", loss))
			isWarning = true
		}
	}
	if report.International.LatencyMs > InternationalLatencyCritical {
		reasons = append(reasons, fmt.Sprintf("International latency %.1f ms exceeds critical threshold", report.International.LatencyMs))
		isCritical = true
	} else if report.International.LatencyMs > InternationalLatencyWarning {
		reasons = append(reasons, fmt.Sprintf("International latency elevated (%.1f ms)", report.International.LatencyMs))
		isWarning = true
	}

	// Agent-reported telemetry checks
	if report.ServerTelemetry != nil {
		if report.ServerTelemetry.GatewayPacketLoss >= 40 {
			reasons = append(reasons, fmt.Sprintf("Agent reports gateway packet loss %.0f%%", report.ServerTelemetry.GatewayPacketLoss))
			isCritical = true
		} else if report.ServerTelemetry.GatewayPacketLoss >= 20 {
			reasons = append(reasons, fmt.Sprintf("Agent reports elevated gateway packet loss %.0f%%", report.ServerTelemetry.GatewayPacketLoss))
			isWarning = true
		}
		if !report.ServerTelemetry.DNSResolvable && report.ServerTelemetry.DNSLatencyMs > 0 {
			reasons = append(reasons, "Host DNS cannot resolve domain names")
			isCritical = true
		}
		if report.ServerTelemetry.ErrorRatePerMin > 10 {
			reasons = append(reasons, fmt.Sprintf("Network interface error rate elevated (%.1f errors/min)", report.ServerTelemetry.ErrorRatePerMin))
			isWarning = true
		}
	}

	if isCritical {
		return NetworkAlertEvaluation{
			IsTriggered:     true,
			Severity:        "critical",
			Reasons:         reasons,
			SuggestedAction: "Inspect physical uplink switch/ports and contact upstream ISP to investigate routing anomalies.",
		}
	}
	if isWarning {
		return NetworkAlertEvaluation{
			IsTriggered:     true,
			Severity:        "warning",
			Reasons:         reasons,
			SuggestedAction: "Monitor traffic patterns or configure automated alert rules in the Alerts tab.",
		}
	}
	return NetworkAlertEvaluation{
		IsTriggered: false,
		Severity:    "none",
		Reasons:     []string{"Network health is operating within nominal thresholds."},
	}
}

// Ensure regexp and strings are used (suppress unused import warnings)
var _ = regexp.Compile
var _ = strings.Contains
