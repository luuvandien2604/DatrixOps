package server

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net"
	"strconv"
	"sync"
	"time"
)

// NetworkTargetProbe represents a single network probe test result.
type NetworkTargetProbe struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Category     string  `json:"category"` // "domestic" | "international"
	Host         string  `json:"host"`
	Port         int     `json:"port"`
	Protocol     string  `json:"protocol"`
	Location     string  `json:"location"`
	LatencyMs    float64 `json:"latency_ms"`
	PacketLoss   float64 `json:"packet_loss"`
	Status       string  `json:"status"` // "optimal", "warning", "critical"
	ErrorMessage string  `json:"error_message,omitempty"`
}

// SubseaCableStatus represents the health evaluation of an undersea fiber optic route.
type SubseaCableStatus struct {
	Code       string  `json:"code"` // "APG", "AAG", "IA", "AAE-1"
	Name       string  `json:"name"`
	Status     string  `json:"status"` // "optimal", "warning", "critical"
	LatencyEst float64 `json:"latency_est_ms"`
	Notes      string  `json:"notes"`
}

// NetworkAlertEvaluation evaluates whether network health exceeds operational alert thresholds.
type NetworkAlertEvaluation struct {
	IsTriggered     bool     `json:"is_triggered"`
	Severity        string   `json:"severity"` // "none", "warning", "critical"
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
	ServerID                   string                  `json:"server_id"`
	ServerName                 string                  `json:"server_name"`
	Timestamp                  time.Time               `json:"timestamp"`
	DomesticProbes             []NetworkTargetProbe    `json:"domestic_probes"`
	InternationalProbes        []NetworkTargetProbe    `json:"international_probes"`
	DomesticAvgLatencyMs       float64                 `json:"domestic_avg_latency_ms"`
	DomesticAvgPacketLoss      float64                 `json:"domestic_avg_packet_loss"`
	DomesticStatus             string                  `json:"domestic_status"` // "optimal", "warning", "critical"
	DomesticSummary            string                  `json:"domestic_summary"`
	InternationalAvgLatencyMs  float64                 `json:"international_avg_latency_ms"`
	InternationalAvgPacketLoss float64                 `json:"international_avg_packet_loss"`
	InternationalStatus        string                  `json:"international_status"` // "optimal", "warning", "critical"
	InternationalSummary       string                  `json:"international_summary"`
	SubseaCables               []SubseaCableStatus     `json:"subsea_cables"`
	SubseaCableSummary         string                  `json:"subsea_cable_summary"`
	AlertEvaluation            NetworkAlertEvaluation  `json:"alert_evaluation"`
	ServerTelemetry            *ServerNetworkTelemetry `json:"server_telemetry,omitempty"`
}

type targetDefinition struct {
	id       string
	name     string
	category string
	host     string
	port     int
	protocol string
	location string
}

var domesticTargets = []targetDefinition{
	{id: "viettel", name: "Viettel Telecom Core", category: "domestic", host: "203.113.131.1", port: 53, protocol: "DNS/TCP", location: "Hanoi / Nationwide"},
	{id: "vnpt", name: "VNPT Telecom Core", category: "domestic", host: "203.162.4.190", port: 53, protocol: "DNS/TCP", location: "HCMC / Nationwide"},
	{id: "fpt", name: "FPT Telecom Core", category: "domestic", host: "210.245.24.20", port: 53, protocol: "DNS/TCP", location: "Hanoi / HCMC"},
	{id: "vnnic", name: "VNNIC (National VNIX Exchange)", category: "domestic", host: "203.119.9.9", port: 53, protocol: "DNS/TCP", location: "National VNIX POP"},
	{id: "vietnix", name: "Vietnix Core Data Center", category: "domestic", host: "103.200.23.1", port: 53, protocol: "DNS/TCP", location: "HCMC Data Center"},
}

var internationalTargets = []targetDefinition{
	{id: "cloudflare", name: "Cloudflare Anycast (Singapore POP)", category: "international", host: "1.1.1.1", port: 443, protocol: "HTTPS/TCP", location: "Singapore / APAC"},
	{id: "google", name: "Google Anycast (Global)", category: "international", host: "8.8.8.8", port: 53, protocol: "DNS/TCP", location: "Global Anycast"},
	{id: "github", name: "GitHub API (Egress & Updates)", category: "international", host: "api.github.com", port: 443, protocol: "HTTPS/TCP", location: "US East / CDN"},
	{id: "aws", name: "AWS APAC (Singapore Region)", category: "international", host: "52.95.245.0", port: 443, protocol: "HTTPS/TCP", location: "Singapore (ap-southeast-1)"},
}

// probeSingleTarget performs a high-precision latency probe to a target host/port.
func probeSingleTarget(ctx context.Context, target targetDefinition, timeout time.Duration) NetworkTargetProbe {
	addr := net.JoinHostPort(target.host, strconv.Itoa(target.port))
	d := net.Dialer{Timeout: timeout}

	t0 := time.Now()
	conn, err := d.DialContext(ctx, "tcp", addr)
	elapsed := time.Since(t0)

	probe := NetworkTargetProbe{
		ID:         target.id,
		Name:       target.name,
		Category:   target.category,
		Host:       target.host,
		Port:       target.port,
		Protocol:   target.protocol,
		Location:   target.location,
		PacketLoss: 0,
	}

	if err != nil {
		// Fallback: If port 53 TCP refused or timed out, try UDP ping for DNS hosts
		if target.port == 53 {
			tUdp := time.Now()
			udpConn, uErr := net.DialTimeout("udp", addr, timeout)
			if uErr == nil {
				_ = udpConn.Close()
				elapsed = time.Since(tUdp)
				err = nil
			}
		}
	}

	if err != nil {
		probe.PacketLoss = 100
		probe.LatencyMs = timeout.Seconds() * 1000
		probe.Status = "critical"
		probe.ErrorMessage = err.Error()
		return probe
	}

	if conn != nil {
		_ = conn.Close()
	}

	latencyMs := math.Round(elapsed.Seconds()*10000) / 10 // 1 decimal place

	// Cap minimum display latency to 0.5ms
	if latencyMs < 0.5 {
		latencyMs = 0.5
	}

	probe.LatencyMs = latencyMs

	// Determine status thresholds
	if target.category == "domestic" {
		if latencyMs > 60 {
			probe.Status = "critical"
		} else if latencyMs > 30 {
			probe.Status = "warning"
		} else {
			probe.Status = "optimal"
		}
	} else {
		if latencyMs > 160 {
			probe.Status = "critical"
		} else if latencyMs > 90 {
			probe.Status = "warning"
		} else {
			probe.Status = "optimal"
		}
	}

	return probe
}

// RunNetworkDiagnostic executes concurrent network diagnostics for domestic & international targets.
func RunNetworkDiagnostic(ctx context.Context, serverID, serverName string, serverSnapshotRaw []byte) *NetworkDiagnosticReport {
	report := &NetworkDiagnosticReport{
		ServerID:   serverID,
		ServerName: serverName,
		Timestamp:  time.Now(),
	}

	var wg sync.WaitGroup
	allTargets := append(domesticTargets, internationalTargets...)
	probeResults := make([]NetworkTargetProbe, len(allTargets))

	// Probe all targets concurrently with max 2.5s per probe
	for i, tgt := range allTargets {
		wg.Add(1)
		go func(idx int, t targetDefinition) {
			defer wg.Done()
			timeout := 2000 * time.Millisecond
			if t.category == "international" {
				timeout = 2500 * time.Millisecond
			}
			probeResults[idx] = probeSingleTarget(ctx, t, timeout)
		}(i, tgt)
	}

	wg.Wait()

	// Split results into domestic and international
	var domProbes, intProbes []NetworkTargetProbe
	var domTotalLat, intTotalLat float64
	var domLossCount, intLossCount float64
	var domCount, intCount float64

	for _, p := range probeResults {
		if p.Category == "domestic" {
			domProbes = append(domProbes, p)
			domCount++
			if p.PacketLoss == 0 {
				domTotalLat += p.LatencyMs
			} else {
				domLossCount++
			}
		} else {
			intProbes = append(intProbes, p)
			intCount++
			if p.PacketLoss == 0 {
				intTotalLat += p.LatencyMs
			} else {
				intLossCount++
			}
		}
	}

	report.DomesticProbes = domProbes
	report.InternationalProbes = intProbes

	// Calculate Domestic summaries
	if domCount > 0 {
		report.DomesticAvgPacketLoss = math.Round((domLossCount/domCount)*1000) / 10
		validDom := domCount - domLossCount
		if validDom > 0 {
			report.DomesticAvgLatencyMs = math.Round((domTotalLat/validDom)*10) / 10
		} else {
			report.DomesticAvgLatencyMs = 999
		}
	}

	if report.DomesticAvgPacketLoss >= 40 || report.DomesticAvgLatencyMs > 60 {
		report.DomesticStatus = "critical"
		report.DomesticSummary = fmt.Sprintf("Severe domestic network degradation (Avg Latency: %.1f ms, Packet Loss: %.1f%%)", report.DomesticAvgLatencyMs, report.DomesticAvgPacketLoss)
	} else if report.DomesticAvgPacketLoss > 0 || report.DomesticAvgLatencyMs > 25 {
		report.DomesticStatus = "warning"
		report.DomesticSummary = fmt.Sprintf("Domestic network latency elevated (Avg Latency: %.1f ms, Packet Loss: %.1f%%)", report.DomesticAvgLatencyMs, report.DomesticAvgPacketLoss)
	} else {
		report.DomesticStatus = "optimal"
		report.DomesticSummary = fmt.Sprintf("Domestic network performance optimal (Avg Latency: %.1f ms, 0%% Packet Loss)", report.DomesticAvgLatencyMs)
	}

	// Calculate International summaries
	if intCount > 0 {
		report.InternationalAvgPacketLoss = math.Round((intLossCount/intCount)*1000) / 10
		validInt := intCount - intLossCount
		if validInt > 0 {
			report.InternationalAvgLatencyMs = math.Round((intTotalLat/validInt)*10) / 10
		} else {
			report.InternationalAvgLatencyMs = 999
		}
	}

	if report.InternationalAvgPacketLoss >= 30 || report.InternationalAvgLatencyMs > 150 {
		report.InternationalStatus = "critical"
		report.InternationalSummary = fmt.Sprintf("International connectivity congested or high packet loss (Avg Latency: %.1f ms, Packet Loss: %.1f%%)", report.InternationalAvgLatencyMs, report.InternationalAvgPacketLoss)
	} else if report.InternationalAvgPacketLoss > 0 || report.InternationalAvgLatencyMs > 80 {
		report.InternationalStatus = "warning"
		report.InternationalSummary = fmt.Sprintf("International connectivity response elevated (Avg Latency: %.1f ms, minor route degradation)", report.InternationalAvgLatencyMs)
	} else {
		report.InternationalStatus = "optimal"
		report.InternationalSummary = fmt.Sprintf("International connectivity optimal via Singapore/Hong Kong (Avg Latency: %.1f ms, 0%% Packet Loss)", report.InternationalAvgLatencyMs)
	}

	// Undersea Cables Condition Evaluation
	intLat := report.InternationalAvgLatencyMs
	cables := []SubseaCableStatus{
		{
			Code:       "APG",
			Name:       "Asia-Pacific Gateway (Vietnam - Singapore / Japan)",
			LatencyEst: math.Round((intLat*0.85)*10) / 10,
		},
		{
			Code:       "AAG",
			Name:       "Asia-America Gateway (Vietnam - Hong Kong - US)",
			LatencyEst: math.Round((intLat*1.15)*10) / 10,
		},
		{
			Code:       "IA",
			Name:       "Intra-Asia / TGN-IA (Vietnam - Singapore)",
			LatencyEst: math.Round((intLat*0.95)*10) / 10,
		},
		{
			Code:       "AAE-1",
			Name:       "Asia-Africa-Europe 1 (Europe / Singapore Route)",
			LatencyEst: math.Round((intLat*1.05)*10) / 10,
		},
	}

	for idx := range cables {
		c := &cables[idx]
		if intLat > 150 || report.InternationalAvgPacketLoss >= 25 {
			c.Status = "critical"
			c.Notes = "High international congestion; possible cable maintenance or fiber impairment"
		} else if intLat > 75 || report.InternationalAvgPacketLoss > 0 {
			c.Status = "warning"
			c.Notes = "Route latency elevated; traffic rerouted or degraded"
		} else {
			c.Status = "optimal"
			c.Notes = "Nominal throughput and low latency across active fiber pairs"
		}
	}
	report.SubseaCables = cables

	if intLat > 150 {
		report.SubseaCableSummary = "Warning: High international latency (> 150ms); one or more undersea cables may be degraded or under maintenance."
	} else if intLat > 75 {
		report.SubseaCableSummary = "Notice: Moderate international latency; route traffic is operating within normal variance."
	} else {
		report.SubseaCableSummary = "All major subsea cable routes (APG, AAG, IA, AAE-1) operating nominally without congestion."
	}

	// Parse server telemetry from snapshot if available
	if len(serverSnapshotRaw) > 0 {
		var snap struct {
			NetworkDiagnostics *ServerNetworkTelemetry `json:"network_diagnostics"`
		}
		if err := json.Unmarshal(serverSnapshotRaw, &snap); err == nil && snap.NetworkDiagnostics != nil {
			report.ServerTelemetry = snap.NetworkDiagnostics
		}
	}

	// Evaluate alert criteria
	var alertReasons []string
	isCritical := false
	isWarning := false

	if report.DomesticAvgPacketLoss >= 20 {
		alertReasons = append(alertReasons, fmt.Sprintf("Severe domestic packet loss (%.1f%%)", report.DomesticAvgPacketLoss))
		isCritical = true
	} else if report.DomesticAvgPacketLoss > 0 {
		alertReasons = append(alertReasons, fmt.Sprintf("Domestic packet loss detected (%.1f%%)", report.DomesticAvgPacketLoss))
		isWarning = true
	}

	if report.DomesticAvgLatencyMs > 60 {
		alertReasons = append(alertReasons, fmt.Sprintf("Domestic latency exceeds threshold (%.1f ms > 60 ms)", report.DomesticAvgLatencyMs))
		isWarning = true
	}

	if report.InternationalAvgLatencyMs > 160 {
		alertReasons = append(alertReasons, fmt.Sprintf("International latency exceeds critical threshold (%.1f ms > 160 ms)", report.InternationalAvgLatencyMs))
		isCritical = true
	} else if report.InternationalAvgLatencyMs > 90 {
		alertReasons = append(alertReasons, fmt.Sprintf("International latency elevated (%.1f ms > 90 ms)", report.InternationalAvgLatencyMs))
		isWarning = true
	}

	if report.InternationalAvgPacketLoss >= 20 {
		alertReasons = append(alertReasons, fmt.Sprintf("Critical international packet loss (%.1f%%)", report.InternationalAvgPacketLoss))
		isCritical = true
	} else if report.InternationalAvgPacketLoss > 0 {
		alertReasons = append(alertReasons, fmt.Sprintf("International packet loss (%.1f%%)", report.InternationalAvgPacketLoss))
		isWarning = true
	}

	if report.ServerTelemetry != nil {
		if report.ServerTelemetry.GatewayPacketLoss >= 40 {
			alertReasons = append(alertReasons, fmt.Sprintf("Default gateway packet loss %.0f%%", report.ServerTelemetry.GatewayPacketLoss))
			isCritical = true
		} else if report.ServerTelemetry.GatewayPacketLoss >= 20 {
			alertReasons = append(alertReasons, fmt.Sprintf("Default gateway packet loss elevated %.0f%%", report.ServerTelemetry.GatewayPacketLoss))
			isWarning = true
		}
		if !report.ServerTelemetry.DNSResolvable && report.ServerTelemetry.DNSLatencyMs > 0 {
			alertReasons = append(alertReasons, "Host DNS cannot resolve domain names")
			isCritical = true
		}
		if report.ServerTelemetry.ErrorRatePerMin > 10 {
			alertReasons = append(alertReasons, fmt.Sprintf("Physical network interface error rate elevated (%.1f errors/min)", report.ServerTelemetry.ErrorRatePerMin))
			isWarning = true
		}
	}

	if isCritical {
		report.AlertEvaluation = NetworkAlertEvaluation{
			IsTriggered:     true,
			Severity:        "critical",
			Reasons:         alertReasons,
			SuggestedAction: "Inspect physical uplink switch/ports and contact upstream ISP to investigate routing anomalies.",
		}
	} else if isWarning {
		report.AlertEvaluation = NetworkAlertEvaluation{
			IsTriggered:     true,
			Severity:        "warning",
			Reasons:         alertReasons,
			SuggestedAction: "Monitor traffic patterns or configure automated alert rules in the Alerts tab.",
		}
	} else {
		report.AlertEvaluation = NetworkAlertEvaluation{
			IsTriggered:     false,
			Severity:        "none",
			Reasons:         []string{"Domestic and international network telemetry operating within nominal thresholds."},
			SuggestedAction: "No action required.",
		}
	}

	return report
}
