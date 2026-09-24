package server

import (
	"context"
	"encoding/json"
	"errors"
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

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
)

var (
	isCloudDeploymentMu sync.RWMutex
	isCloudDeployment   bool
)

// SetCloudDeployment configures whether network diagnostics run in a multi-tenant Cloud environment.
func SetCloudDeployment(isCloud bool) {
	isCloudDeploymentMu.Lock()
	defer isCloudDeploymentMu.Unlock()
	isCloudDeployment = isCloud
}

// IsCloudDeployment reports whether Cloud SSRF rules apply to network diagnostic probes.
func IsCloudDeployment() bool {
	isCloudDeploymentMu.RLock()
	defer isCloudDeploymentMu.RUnlock()
	return isCloudDeployment
}

// ValidateNetworkTargetHost checks if the target host is valid and safe to probe.
// In Cloud mode (isCloud = true), target hosts are strictly restricted to public IPs or hostnames
// that resolve only to public IPs, preventing internal SSRF probes against cloud/container infrastructure.
// On Community Edition (self-hosted), LAN targets are permitted, but loopback, localhost, and
// cloud metadata services (169.254.169.254 / link-local) are strictly prohibited.
func ValidateNetworkTargetHost(ctx context.Context, host string, isGateway bool, isCloud bool) error {
	trimmed := strings.TrimSpace(host)
	if isGateway {
		if trimmed == "" || strings.EqualFold(trimmed, "gateway") {
			return nil
		}
		if isCloud {
			return errors.New("gateway target cannot use custom IP address in Cloud mode")
		}
	}

	if trimmed == "" {
		return errors.New("target host is required")
	}

	if strings.Contains(trimmed, "://") || strings.Contains(trimmed, "/") || strings.Contains(trimmed, "@") {
		return errors.New("target host must be a hostname or IP address without protocol, credentials, or path")
	}

	if strings.Contains(trimmed, ":") {
		if !strings.HasPrefix(trimmed, "[") && strings.Count(trimmed, ":") == 1 {
			return errors.New("target host must not include a port; specify port in the port field")
		}
	}

	cleanHost := strings.Trim(trimmed, "[]")
	cleanHost = strings.TrimSuffix(strings.ToLower(cleanHost), ".")

	if cleanHost == "localhost" || strings.HasSuffix(cleanHost, ".localhost") {
		return errors.New("target host must not target localhost")
	}

	if ip := net.ParseIP(cleanHost); ip != nil {
		if ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || cleanHost == "169.254.169.254" {
			return errors.New("target host must not target loopback, unspecified, or link-local/cloud metadata addresses")
		}
		if isCloud && !notifier.IsPublicIP(ip) {
			return errors.New("target host must be a public IP address in Cloud mode")
		}
		return nil
	}

	var validHostname = regexp.MustCompile(`^[a-z0-9]([a-z0-9\-\.]*[a-z0-9])?$`)
	if !validHostname.MatchString(cleanHost) {
		return errors.New("target host contains invalid characters")
	}

	if isCloud {
		resolver := net.DefaultResolver
		lookupCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		addrs, err := resolver.LookupIPAddr(lookupCtx, cleanHost)
		if err != nil {
			return fmt.Errorf("unable to resolve target host: %w", err)
		}
		if len(addrs) == 0 {
			return errors.New("target host does not resolve to any IP address")
		}
		for _, addr := range addrs {
			if !notifier.IsPublicIP(addr.IP) {
				return errors.New("target host resolves to a non-public or internal IP address")
			}
		}
	}

	return nil
}

// ---------- Configuration Constants ----------

const (
	// ProbesPerTarget is the default number of probes sent to each target per diagnostic run.
	ProbesPerTarget = 5

	// ProbeIntervalMs is the approximate pacing between probes to the same target.
	ProbeIntervalMs = 80

	// ICMPTimeoutSec is the per-probe ICMP timeout in seconds.
	ICMPTimeoutSec = 2

	// TCPProbeTimeout is the per-probe TCP connection timeout.
	TCPProbeTimeout = 2500 * time.Millisecond
)

// ---------- Threshold Fallback Defaults ----------
// Used when a target's user-configured threshold values are NULL.

const (
	DefaultLatencyWarningMs  = 50.0  // Default warning latency (50 ms)
	DefaultLatencyCriticalMs = 150.0 // Default critical latency (150 ms)
	DefaultLossCriticalPct   = 20.0  // Default critical packet loss (20%)

	// Gateway defaults: local hop should be fast, but 20ms accommodates typical cloud/VPS hypervisor gateways
	DefaultGatewayLatencyWarningMs  = 20.0
	DefaultGatewayLatencyCriticalMs = 80.0
	DefaultGatewayLossCriticalPct   = 20.0
)

// ---------- Data Models ----------

// NetworkTarget represents a user-configured monitoring target in the database.
type NetworkTarget struct {
	ID                     string    `json:"id"`
	AgentID                string    `json:"agent_id"`
	Name                   string    `json:"name"`
	Host                   string    `json:"host"`
	Port                   int       `json:"port"`
	Tag                    string    `json:"tag"`
	ProbeMethod            string    `json:"probe_method"` // "ICMP" or "TCP"
	ProbesPerRun           int       `json:"probes_per_run"`
	AlertLatencyWarningMs  *float64  `json:"alert_latency_warning_ms,omitempty"`
	AlertLatencyCriticalMs *float64  `json:"alert_latency_critical_ms,omitempty"`
	AlertLossCriticalPct   *float64  `json:"alert_loss_critical_pct,omitempty"`
	Enabled                bool      `json:"enabled"`
	IsGateway              bool      `json:"is_gateway"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

// NetworkTargetResult represents a single probe run result saved to time-series history.
type NetworkTargetResult struct {
	ID               string    `json:"id"`
	TargetID         string    `json:"target_id"`
	LatencyMs        *float64  `json:"latency_ms,omitempty"`
	MinLatencyMs     *float64  `json:"min_latency_ms,omitempty"`
	MaxLatencyMs     *float64  `json:"max_latency_ms,omitempty"`
	PacketLoss       *float64  `json:"packet_loss,omitempty"`
	TotalProbes      int       `json:"total_probes"`
	SuccessfulProbes int       `json:"successful_probes"`
	FailedProbes     int       `json:"failed_probes"`
	Status           string    `json:"status"` // "optimal", "warning", "critical", "reachable", "unreachable"
	MeasuredAt       time.Time `json:"measured_at"`
}

// NetworkTargetWithLatest joins a target with its most recent measurement and server info.
type NetworkTargetWithLatest struct {
	NetworkTarget
	ServerName   string               `json:"server_name,omitempty"`
	LatestResult *NetworkTargetResult `json:"latest_result,omitempty"`
}

// TagQualityOverview represents fleet-wide aggregated health for a tag across all agents.
type TagQualityOverview struct {
	Tag             string   `json:"tag"`
	TotalTargets    int      `json:"total_targets"`
	TotalAgents     int      `json:"total_agents"`
	CriticalAgents  int      `json:"critical_agents"`
	WarningAgents   int      `json:"warning_agents"`
	OptimalAgents   int      `json:"optimal_agents"`
	AvgLatencyMs    float64  `json:"avg_latency_ms"`
	MaxLossPct      float64  `json:"max_loss_pct"`
	Status          string   `json:"status"` // "optimal" | "warning" | "critical"
	IsWideAreaIssue bool     `json:"is_wide_area_issue"`
	AgentIDs        []string `json:"agent_ids"`
}

// NetworkTargetProbe represents the multi-probe measurement result for a single target.
type NetworkTargetProbe struct {
	ID               string   `json:"id"`
	TargetID         string   `json:"target_id,omitempty"`
	Name             string   `json:"name"`
	Tag              string   `json:"tag"`
	Host             string   `json:"host"`
	Port             int      `json:"port"`
	Location         string   `json:"location,omitempty"`
	IsGateway        bool     `json:"is_gateway"`
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

// NetworkPillarResult represents an aggregate summary for Gateway or any dynamic Tag group.
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
	ServerID        string                         `json:"server_id"`
	ServerName      string                         `json:"server_name"`
	Timestamp       time.Time                      `json:"timestamp"`
	SampleSize      int                            `json:"sample_size"`
	Gateway         *NetworkPillarResult           `json:"gateway,omitempty"`
	Groups          map[string]NetworkPillarResult `json:"groups"`      // Dynamic groups by user tag
	GroupOrder      []string                       `json:"group_order"` // Ordered unique tag names
	Probes          []NetworkTargetProbe           `json:"probes"`
	AlertEvaluation NetworkAlertEvaluation         `json:"alert_evaluation"`
	ServerTelemetry *ServerNetworkTelemetry        `json:"server_telemetry,omitempty"`
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
func runICMPPing(ctx context.Context, host string, count int, timeoutSec int) icmpPingResult {
	cleanHost := strings.Trim(strings.TrimSpace(host), "[]")
	if parsed := net.ParseIP(cleanHost); parsed != nil {
		if parsed.IsLoopback() || parsed.IsLinkLocalUnicast() || cleanHost == "169.254.169.254" {
			return icmpPingResult{available: false}
		}
		if IsCloudDeployment() && !notifier.IsPublicIP(parsed) {
			return icmpPingResult{available: false}
		}
	} else if IsCloudDeployment() {
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, cleanHost)
		if err != nil || len(ips) == 0 {
			return icmpPingResult{available: false}
		}
		for _, addr := range ips {
			if !notifier.IsPublicIP(addr.IP) {
				return icmpPingResult{available: false}
			}
		}
	}

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
// Supports Linux (iputils and BusyBox), macOS, and Windows ping output formats.
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

	// Parse RTT statistics:
	// Matches:
	// - Linux iputils: "rtt min/avg/max/mdev = 1.2/2.3/3.4/0.1 ms"
	// - Linux BusyBox: "round-trip min/avg/max = 1.2/2.3/3.4 ms"
	// - macOS: "round-trip min/avg/max/stddev = 1.2/2.3/3.4/0.1 ms"
	rttRe := regexp.MustCompile(`(?:rtt|round-trip)\s+min/avg/max(?:\/(?:mdev|stddev))?\s*=\s*([\d.]+)/([\d.]+)/([\d.]+)`)
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

// runTCPProbe performs multiple sequential TCP connection attempts with pacing.
func runTCPProbe(ctx context.Context, host string, port int, count int) tcpProbeResult {
	result := tcpProbeResult{
		total: count,
	}

	var latencies []float64

	// Resolve IP first so DNS resolution time doesn't distort TCP connection time
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

	cleanIP := strings.Trim(strings.TrimSpace(ip), "[]")
	if parsed := net.ParseIP(cleanIP); parsed != nil {
		if parsed.IsLoopback() || parsed.IsLinkLocalUnicast() || cleanIP == "169.254.169.254" {
			result.failed = count
			result.lastError = "probe destination is not allowed"
			return result
		}
		if IsCloudDeployment() && !notifier.IsPublicIP(parsed) {
			result.failed = count
			result.lastError = "probe destination is not a public IP address"
			return result
		}
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

// probeTarget runs a multi-probe measurement against a single user-configured NetworkTarget.
func probeTarget(ctx context.Context, target NetworkTarget) NetworkTargetProbe {
	probesCount := target.ProbesPerRun
	if probesCount <= 0 {
		probesCount = ProbesPerTarget
	}

	tag := strings.TrimSpace(target.Tag)
	if tag == "" {
		tag = "default"
	}

	probe := NetworkTargetProbe{
		ID:          target.ID,
		TargetID:    target.ID,
		Name:        target.Name,
		Tag:         tag,
		Host:        target.Host,
		Port:        target.Port,
		IsGateway:   target.IsGateway,
		TotalProbes: probesCount,
	}

	method := strings.ToUpper(strings.TrimSpace(target.ProbeMethod))
	if method != "TCP" {
		method = "ICMP"
	}

	// 1. If explicitly configured as TCP:
	if method == "TCP" {
		tcpPort := target.Port
		if tcpPort <= 0 {
			tcpPort = 443
		}
		probe.Port = tcpPort
		tcpResult := runTCPProbe(ctx, target.Host, tcpPort, probesCount)
		probe.ProbeMethod = "TCP"
		probe.TotalProbes = tcpResult.total
		probe.SuccessfulProbes = tcpResult.success
		probe.FailedProbes = tcpResult.failed
		probe.PacketLoss = nil // TCP never produces ICMP packet loss
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

	// 2. ICMP method: run ICMP ping (supports both IPs and hostnames)
	icmpResult := runICMPPing(ctx, target.Host, probesCount, ICMPTimeoutSec)
	if icmpResult.available && icmpResult.total > 0 {
		probe.ProbeMethod = "ICMP"
		probe.TotalProbes = icmpResult.total
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

		probe.Status = evaluateTargetStatus(target, probe.PacketLoss, probe.LatencyMs, probe.ProbeMethod)
		return probe
	}

	// 3. Fallback to TCP if ICMP is unavailable or host is hostname
	tcpPort := target.Port
	if tcpPort <= 0 {
		tcpPort = 53 // fallback to DNS port 53 for IP targets, or 443
		if net.ParseIP(target.Host) == nil {
			tcpPort = 443
		}
	}

	probe.Port = tcpPort
	tcpResult := runTCPProbe(ctx, target.Host, tcpPort, probesCount)
	probe.ProbeMethod = "TCP"
	probe.TotalProbes = tcpResult.total
	probe.SuccessfulProbes = tcpResult.success
	probe.FailedProbes = tcpResult.failed
	probe.PacketLoss = nil
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
func evaluateTargetStatus(target NetworkTarget, packetLoss *float64, latencyMs float64, method string) string {
	if method == "TCP" {
		if latencyMs > 0 {
			return "reachable"
		}
		return "unreachable"
	}

	warnLat := DefaultLatencyWarningMs
	critLat := DefaultLatencyCriticalMs
	critLoss := DefaultLossCriticalPct

	if target.IsGateway {
		warnLat = DefaultGatewayLatencyWarningMs
		critLat = DefaultGatewayLatencyCriticalMs
		critLoss = DefaultGatewayLossCriticalPct
	}

	if target.AlertLatencyWarningMs != nil && *target.AlertLatencyWarningMs > 0 {
		warnLat = *target.AlertLatencyWarningMs
	}
	if target.AlertLatencyCriticalMs != nil && *target.AlertLatencyCriticalMs > 0 {
		critLat = *target.AlertLatencyCriticalMs
	}
	if target.AlertLossCriticalPct != nil && *target.AlertLossCriticalPct > 0 {
		critLoss = *target.AlertLossCriticalPct
	}

	loss := 0.0
	if packetLoss != nil {
		loss = *packetLoss
	}

	if loss >= critLoss || latencyMs > critLat {
		return "critical"
	}
	if loss > 0 || latencyMs > warnLat {
		return "warning"
	}
	return "optimal"
}

// ProbeSingleTarget probes a single target and formats the result for saving to network_target_results.
func ProbeSingleTarget(ctx context.Context, target NetworkTarget) (NetworkTargetProbe, NetworkTargetResult) {
	probe := probeTarget(ctx, target)

	res := NetworkTargetResult{
		TargetID:         target.ID,
		TotalProbes:      probe.TotalProbes,
		SuccessfulProbes: probe.SuccessfulProbes,
		FailedProbes:     probe.FailedProbes,
		Status:           probe.Status,
		MeasuredAt:       time.Now(),
	}

	if probe.SuccessfulProbes > 0 {
		lat := probe.LatencyMs
		minLat := probe.MinLatencyMs
		maxLat := probe.MaxLatencyMs
		res.LatencyMs = &lat
		res.MinLatencyMs = &minLat
		res.MaxLatencyMs = &maxLat
	}
	if probe.PacketLoss != nil {
		loss := *probe.PacketLoss
		res.PacketLoss = &loss
	}

	return probe, res
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
		if icmpSuccessCount > 0 {
			result.LatencyMs = math.Round(icmpLatencySum/float64(icmpSuccessCount)*10) / 10
		}
	} else if hasTCP {
		// TCP only: no packet loss (nil), average TCP latency
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

// probeGateway runs ICMP probes against the default gateway from agent telemetry or dedicated gateway target.
func probeGateway(ctx context.Context, telemetry *ServerNetworkTelemetry, gwTarget *NetworkTarget) NetworkPillarResult {
	result := NetworkPillarResult{
		MeasurementMethod: "ICMP",
	}

	// 1. If user configured an explicit gateway target with an IP
	if gwTarget != nil && gwTarget.Host != "" && gwTarget.Host != "gateway" {
		probe := probeTarget(ctx, *gwTarget)
		result.TotalProbes = probe.TotalProbes
		result.SuccessfulProbes = probe.SuccessfulProbes
		result.FailedProbes = probe.FailedProbes
		result.LatencyMs = probe.LatencyMs
		result.PacketLoss = probe.PacketLoss
		evaluatePillarStatus(&result, DefaultGatewayLossCriticalPct, DefaultGatewayLatencyWarningMs, DefaultGatewayLatencyCriticalMs)
		return result
	}

	// 2. Use agent telemetry default gateway
	if telemetry == nil || telemetry.DefaultGateway == "" {
		result.Status = "unavailable"
		result.Summary = "Default gateway information is not available from the agent."
		return result
	}

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

		evaluatePillarStatus(&result, DefaultGatewayLossCriticalPct, DefaultGatewayLatencyWarningMs, DefaultGatewayLatencyCriticalMs)
		return result
	}

	// Fallback: run ICMP from the backend server itself to telemetry.DefaultGateway
	// In Cloud mode, backend must not probe private agent gateways directly.
	if IsCloudDeployment() {
		result.Status = "unavailable"
		result.Summary = "Default gateway telemetry is not available from the agent."
		return result
	}

	icmpResult := runICMPPing(ctx, telemetry.DefaultGateway, ProbesPerTarget, ICMPTimeoutSec)
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

	evaluatePillarStatus(&result, DefaultGatewayLossCriticalPct, DefaultGatewayLatencyWarningMs, DefaultGatewayLatencyCriticalMs)
	return result
}

// ---------- Main Diagnostic Entry Point ----------

// RunNetworkDiagnostic executes network diagnostics for dynamic user-configured targets.
// Returns the compiled report and a slice of historical results ready to be persisted.
func RunNetworkDiagnostic(ctx context.Context, serverID, serverName string, serverSnapshotRaw []byte, targets []NetworkTarget) (*NetworkDiagnosticReport, []NetworkTargetResult) {
	report := &NetworkDiagnosticReport{
		ServerID:   serverID,
		ServerName: serverName,
		Timestamp:  time.Now(),
		SampleSize: ProbesPerTarget,
		Groups:     make(map[string]NetworkPillarResult),
		GroupOrder: []string{},
		Probes:     []NetworkTargetProbe{},
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

	// Check if any target represents gateway
	var gwTarget *NetworkTarget
	var regularTargets []NetworkTarget
	for _, t := range targets {
		if !t.Enabled {
			continue
		}
		if t.IsGateway {
			gwCopy := t
			gwTarget = &gwCopy
		} else {
			regularTargets = append(regularTargets, t)
		}
	}

	// Gateway evaluation if telemetry or target exists
	if telemetry != nil || gwTarget != nil {
		gwResult := probeGateway(ctx, telemetry, gwTarget)
		report.Gateway = &gwResult
	}

	if len(regularTargets) == 0 {
		report.AlertEvaluation = evaluateAlerts(report)
		return report, nil
	}

	// Probe regular targets concurrently
	probeResults := make([]NetworkTargetProbe, len(regularTargets))
	historyResults := make([]NetworkTargetResult, len(regularTargets))

	var wg sync.WaitGroup
	for i, tgt := range regularTargets {
		wg.Add(1)
		go func(idx int, t NetworkTarget) {
			defer wg.Done()
			p, h := ProbeSingleTarget(ctx, t)
			probeResults[idx] = p
			historyResults[idx] = h
		}(i, tgt)
	}
	wg.Wait()

	report.Probes = probeResults

	// Group probe results dynamically by Tag
	tagProbes := make(map[string][]NetworkTargetProbe)
	tagTargets := make(map[string][]NetworkTarget)
	var groupOrder []string

	for i, p := range probeResults {
		tag := p.Tag
		if tag == "" {
			tag = "default"
		}
		if _, exists := tagProbes[tag]; !exists {
			groupOrder = append(groupOrder, tag)
		}
		tagProbes[tag] = append(tagProbes[tag], p)
		tagTargets[tag] = append(tagTargets[tag], regularTargets[i])
	}
	report.GroupOrder = groupOrder

	// Aggregate each dynamic tag group
	for _, tag := range groupOrder {
		probes := tagProbes[tag]
		groupPillar := aggregatePillar(probes)

		// Calculate thresholds for this group
		lossCrit := DefaultLossCriticalPct
		latWarn := DefaultLatencyWarningMs
		latCrit := DefaultLatencyCriticalMs

		var warnSum, critSum, lossSum float64
		var warnCount, critCount, lossCount int

		for _, t := range tagTargets[tag] {
			if t.AlertLatencyWarningMs != nil && *t.AlertLatencyWarningMs > 0 {
				warnSum += *t.AlertLatencyWarningMs
				warnCount++
			}
			if t.AlertLatencyCriticalMs != nil && *t.AlertLatencyCriticalMs > 0 {
				critSum += *t.AlertLatencyCriticalMs
				critCount++
			}
			if t.AlertLossCriticalPct != nil && *t.AlertLossCriticalPct > 0 {
				lossSum += *t.AlertLossCriticalPct
				lossCount++
			}
		}

		if warnCount > 0 {
			latWarn = warnSum / float64(warnCount)
		}
		if critCount > 0 {
			latCrit = critSum / float64(critCount)
		}
		if lossCount > 0 {
			lossCrit = lossSum / float64(lossCount)
		}

		evaluatePillarStatus(&groupPillar, lossCrit, latWarn, latCrit)
		report.Groups[tag] = groupPillar
	}

	report.AlertEvaluation = evaluateAlerts(report)
	return report, historyResults
}

// BuildDiagnosticReportFromTargets constructs a NetworkDiagnosticReport instantly using latest DB results.
func BuildDiagnosticReportFromTargets(serverID, serverName string, serverSnapshotRaw []byte, targets []NetworkTargetWithLatest) *NetworkDiagnosticReport {
	report := &NetworkDiagnosticReport{
		ServerID:   serverID,
		ServerName: serverName,
		Timestamp:  time.Now(),
		SampleSize: ProbesPerTarget,
		Groups:     make(map[string]NetworkPillarResult),
		GroupOrder: []string{},
		Probes:     []NetworkTargetProbe{},
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

	var gwTarget *NetworkTargetWithLatest
	var regularTargets []NetworkTargetWithLatest
	var latestTs time.Time

	for i := range targets {
		t := &targets[i]
		if !t.Enabled {
			continue
		}
		if t.LatestResult != nil && t.LatestResult.MeasuredAt.After(latestTs) {
			latestTs = t.LatestResult.MeasuredAt
		}
		if t.IsGateway {
			gwTarget = t
		} else {
			regularTargets = append(regularTargets, *t)
		}
	}

	if !latestTs.IsZero() {
		report.Timestamp = latestTs
	}

	// Gateway evaluation
	if gwTarget != nil && gwTarget.LatestResult != nil {
		method := gwTarget.ProbeMethod
		if method == "" {
			method = "ICMP"
		}
		lat := 0.0
		if gwTarget.LatestResult.LatencyMs != nil {
			lat = *gwTarget.LatestResult.LatencyMs
		}
		gwPillar := NetworkPillarResult{
			Status:            gwTarget.LatestResult.Status,
			LatencyMs:         lat,
			PacketLoss:        gwTarget.LatestResult.PacketLoss,
			TotalProbes:       gwTarget.LatestResult.TotalProbes,
			SuccessfulProbes:  gwTarget.LatestResult.SuccessfulProbes,
			FailedProbes:      gwTarget.LatestResult.FailedProbes,
			MeasurementMethod: method,
			Summary:           fmt.Sprintf("Gateway probe: %.1fms", lat),
		}
		report.Gateway = &gwPillar
	} else if telemetry != nil {
		gwResult := probeGateway(context.Background(), telemetry, nil)
		report.Gateway = &gwResult
	}

	if len(regularTargets) == 0 {
		report.AlertEvaluation = evaluateAlerts(report)
		return report
	}

	probeResults := make([]NetworkTargetProbe, len(regularTargets))
	for i, tgt := range regularTargets {
		p := NetworkTargetProbe{
			ID:          tgt.ID,
			TargetID:    tgt.ID,
			Name:        tgt.Name,
			Tag:         tgt.Tag,
			Host:        tgt.Host,
			Port:        tgt.Port,
			ProbeMethod: tgt.ProbeMethod,
			IsGateway:   tgt.IsGateway,
			Status:      "optimal",
			ProbeStatus: "pending",
		}
		if tgt.LatestResult != nil {
			p.Status = tgt.LatestResult.Status
			p.TotalProbes = tgt.LatestResult.TotalProbes
			p.SuccessfulProbes = tgt.LatestResult.SuccessfulProbes
			p.FailedProbes = tgt.LatestResult.FailedProbes
			p.PacketLoss = tgt.LatestResult.PacketLoss
			if tgt.LatestResult.LatencyMs != nil {
				p.LatencyMs = *tgt.LatestResult.LatencyMs
			}
			if tgt.LatestResult.MinLatencyMs != nil {
				p.MinLatencyMs = *tgt.LatestResult.MinLatencyMs
			}
			if tgt.LatestResult.MaxLatencyMs != nil {
				p.MaxLatencyMs = *tgt.LatestResult.MaxLatencyMs
			}
			if p.Status == "optimal" || p.Status == "warning" || p.Status == "reachable" {
				p.ProbeStatus = "success"
			} else if p.Status == "unreachable" {
				p.ProbeStatus = "refused"
			} else {
				p.ProbeStatus = "timeout"
			}
		}
		probeResults[i] = p
	}
	report.Probes = probeResults

	// Dynamic Tag grouping
	tagProbes := make(map[string][]NetworkTargetProbe)
	tagTargets := make(map[string][]NetworkTargetWithLatest)
	var groupOrder []string

	for i, p := range probeResults {
		tag := p.Tag
		if tag == "" {
			tag = "default"
		}
		if _, exists := tagProbes[tag]; !exists {
			groupOrder = append(groupOrder, tag)
		}
		tagProbes[tag] = append(tagProbes[tag], p)
		tagTargets[tag] = append(tagTargets[tag], regularTargets[i])
	}
	report.GroupOrder = groupOrder

	for _, tag := range groupOrder {
		probes := tagProbes[tag]
		groupPillar := aggregatePillar(probes)

		lossCrit := DefaultLossCriticalPct
		latWarn := DefaultLatencyWarningMs
		latCrit := DefaultLatencyCriticalMs

		var warnSum, critSum, lossSum float64
		var warnCount, critCount, lossCount int

		for _, t := range tagTargets[tag] {
			if t.AlertLatencyWarningMs != nil && *t.AlertLatencyWarningMs > 0 {
				warnSum += *t.AlertLatencyWarningMs
				warnCount++
			}
			if t.AlertLatencyCriticalMs != nil && *t.AlertLatencyCriticalMs > 0 {
				critSum += *t.AlertLatencyCriticalMs
				critCount++
			}
			if t.AlertLossCriticalPct != nil && *t.AlertLossCriticalPct > 0 {
				lossSum += *t.AlertLossCriticalPct
				lossCount++
			}
		}

		if warnCount > 0 {
			latWarn = warnSum / float64(warnCount)
		}
		if critCount > 0 {
			latCrit = critSum / float64(critCount)
		}
		if lossCount > 0 {
			lossCrit = lossSum / float64(lossCount)
		}

		evaluatePillarStatus(&groupPillar, lossCrit, latWarn, latCrit)
		report.Groups[tag] = groupPillar
	}

	report.AlertEvaluation = evaluateAlerts(report)
	return report
}

// evaluateAlerts builds the alert evaluation from Gateway and dynamic Tag groups.
func evaluateAlerts(report *NetworkDiagnosticReport) NetworkAlertEvaluation {
	var reasons []string
	isCritical := false
	isWarning := false

	// Gateway check
	if report.Gateway != nil {
		if report.Gateway.Status == "critical" {
			reasons = append(reasons, fmt.Sprintf("Gateway connectivity critical (Latency: %.1f ms)", report.Gateway.LatencyMs))
			isCritical = true
		} else if report.Gateway.Status == "warning" {
			reasons = append(reasons, fmt.Sprintf("Gateway latency elevated (%.1f ms)", report.Gateway.LatencyMs))
			isWarning = true
		}
	}

	// Dynamic tag groups check
	for tag, grp := range report.Groups {
		if grp.PacketLoss != nil {
			loss := *grp.PacketLoss
			if loss >= DefaultLossCriticalPct {
				reasons = append(reasons, fmt.Sprintf("Group '%s' packet loss %.1f%% exceeds critical threshold", tag, loss))
				isCritical = true
			} else if loss > 0 {
				reasons = append(reasons, fmt.Sprintf("Group '%s' packet loss detected (%.1f%%)", tag, loss))
				isWarning = true
			}
		}

		if grp.LatencyMs > DefaultLatencyCriticalMs {
			reasons = append(reasons, fmt.Sprintf("Group '%s' latency %.1f ms exceeds critical threshold", tag, grp.LatencyMs))
			isCritical = true
		} else if grp.LatencyMs > DefaultLatencyWarningMs {
			reasons = append(reasons, fmt.Sprintf("Group '%s' latency elevated (%.1f ms)", tag, grp.LatencyMs))
			isWarning = true
		}
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
			SuggestedAction: "Inspect physical uplink switch/ports or contact upstream ISP to investigate routing anomalies.",
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

// Ensure unused import suppressions
var _ = regexp.Compile
var _ = strings.Contains
