package server

import (
	"context"
	"math"
	"testing"
	"time"
)

// ---------- TestMultiProbeStrictProtocolSeparation ----------
// Verify: ICMP → PacketLoss != nil, TCP → PacketLoss == nil

func TestMultiProbeStrictProtocolSeparation(t *testing.T) {
	icmpProbe := NetworkTargetProbe{
		ProbeMethod:      "ICMP",
		TotalProbes:      5,
		SuccessfulProbes: 4,
		FailedProbes:     1,
	}
	loss := 20.0
	icmpProbe.PacketLoss = &loss

	if icmpProbe.PacketLoss == nil {
		t.Fatal("ICMP probe must have non-nil PacketLoss")
	}
	if *icmpProbe.PacketLoss != 20.0 {
		t.Fatalf("expected ICMP PacketLoss 20.0, got %f", *icmpProbe.PacketLoss)
	}

	tcpProbe := NetworkTargetProbe{
		ProbeMethod:      "TCP",
		TotalProbes:      5,
		SuccessfulProbes: 5,
		FailedProbes:     0,
		PacketLoss:       nil, // TCP must never produce packet loss
	}

	if tcpProbe.PacketLoss != nil {
		t.Fatal("TCP probe must have nil PacketLoss (N/A)")
	}
}

// ---------- TestLatencyExcludesTimeouts ----------
// Verify timeouts are never averaged into LatencyMs.

func TestLatencyExcludesTimeouts(t *testing.T) {
	result := tcpProbeResult{
		total:   4,
		success: 3,
		failed:  1,
		avgMs:   20.0,
		minMs:   10.0,
		maxMs:   30.0,
	}

	if result.avgMs != 20.0 {
		t.Fatalf("expected average latency 20.0ms, got %f", result.avgMs)
	}

	if result.success+result.failed != result.total {
		t.Fatalf("total probes mismatch: %d success + %d failed != %d total",
			result.success, result.failed, result.total)
	}
}

// ---------- TestAggregateCategoryCalculation ----------
// Verify category loss is probe-based, not target-failure ratio.

func TestAggregateCategoryCalculation(t *testing.T) {
	loss0 := 0.0
	loss20 := 20.0

	probes := []NetworkTargetProbe{
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: &loss0, LatencyMs: 4.0},
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: &loss0, LatencyMs: 5.0},
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 4, FailedProbes: 1, PacketLoss: &loss20, LatencyMs: 6.0},
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: &loss0, LatencyMs: 3.0},
	}

	result := aggregatePillar(probes)

	if result.PacketLoss == nil {
		t.Fatal("expected non-nil PacketLoss for ICMP pillar")
	}

	expectedLoss := 5.0
	if math.Abs(*result.PacketLoss-expectedLoss) > 0.2 {
		t.Fatalf("expected aggregate ICMP packet loss ~%.1f%%, got %.1f%%", expectedLoss, *result.PacketLoss)
	}

	if *result.PacketLoss > 10.0 {
		t.Fatalf("aggregate packet loss %.1f%% is too high; must be probe-based not target-based", *result.PacketLoss)
	}

	if result.TotalProbes != 20 {
		t.Fatalf("expected 20 total probes, got %d", result.TotalProbes)
	}
}

// ---------- TestSingleTargetFailureIsolation ----------

func TestSingleTargetFailureIsolation(t *testing.T) {
	loss0 := 0.0
	loss100 := 100.0

	probes := []NetworkTargetProbe{
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: &loss0, LatencyMs: 5.0},
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: &loss0, LatencyMs: 6.0},
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: &loss0, LatencyMs: 4.0},
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 0, FailedProbes: 5, PacketLoss: &loss100, LatencyMs: 0},
	}

	result := aggregatePillar(probes)

	if result.PacketLoss == nil {
		t.Fatal("expected non-nil PacketLoss")
	}
	if result.TotalProbes != 20 {
		t.Fatalf("expected 20 total probes, got %d", result.TotalProbes)
	}
	if result.FailedProbes != 5 {
		t.Fatalf("expected 5 failed probes, got %d", result.FailedProbes)
	}
	if result.LatencyMs <= 0 {
		t.Fatal("expected positive latency from successful probes")
	}
}

// ---------- TestCriticalFirstThresholdEvaluation ----------

func TestCriticalFirstThresholdEvaluation(t *testing.T) {
	tests := []struct {
		name       string
		loss       float64
		latency    float64
		lossCrit   float64
		latWarn    float64
		latCrit    float64
		wantStatus string
	}{
		{"critical_loss", 25.0, 10.0, 20.0, 25.0, 60.0, "critical"},
		{"boundary_critical_loss", 20.0, 10.0, 20.0, 25.0, 60.0, "critical"},
		{"warning_loss", 10.0, 10.0, 20.0, 25.0, 60.0, "warning"},
		{"optimal", 0.0, 5.0, 20.0, 25.0, 60.0, "optimal"},
		{"critical_latency", 0.0, 65.0, 20.0, 25.0, 60.0, "critical"},
		{"warning_latency", 0.0, 30.0, 20.0, 25.0, 60.0, "warning"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pillar := &NetworkPillarResult{
				TotalProbes:      5,
				SuccessfulProbes: 5,
				PacketLoss:       &tt.loss,
				LatencyMs:        tt.latency,
			}
			evaluatePillarStatus(pillar, tt.lossCrit, tt.latWarn, tt.latCrit)
			if pillar.Status != tt.wantStatus {
				t.Fatalf("loss=%.1f%%, latency=%.1fms: expected status %q, got %q",
					tt.loss, tt.latency, tt.wantStatus, pillar.Status)
			}
		})
	}
}

// ---------- TestNoMixedProtocolLatencyAggregation ----------

func TestNoMixedProtocolLatencyAggregation(t *testing.T) {
	loss0 := 0.0

	probes := []NetworkTargetProbe{
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: &loss0, LatencyMs: 10.0},
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: &loss0, LatencyMs: 20.0},
		{ProbeMethod: "TCP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: nil, LatencyMs: 100.0},
	}

	result := aggregatePillar(probes)

	expectedLatency := 15.0
	if math.Abs(result.LatencyMs-expectedLatency) > 0.5 {
		t.Fatalf("expected category latency ~%.1fms from ICMP only, got %.1fms", expectedLatency, result.LatencyMs)
	}

	if result.PacketLoss == nil {
		t.Fatal("expected non-nil PacketLoss from ICMP probes")
	}
	if *result.PacketLoss != 0.0 {
		t.Fatalf("expected 0%% ICMP packet loss, got %.1f%%", *result.PacketLoss)
	}

	if result.MeasurementMethod != "MIXED" {
		t.Fatalf("expected MIXED measurement method, got %s", result.MeasurementMethod)
	}
}

// ---------- TestUnavailableProbeHandling ----------

func TestUnavailableProbeHandling(t *testing.T) {
	probes := []NetworkTargetProbe{
		{ProbeMethod: "TCP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: nil, LatencyMs: 35.0},
		{ProbeMethod: "TCP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: nil, LatencyMs: 40.0},
	}

	result := aggregatePillar(probes)

	if result.PacketLoss != nil {
		t.Fatalf("expected nil PacketLoss for TCP-only pillar, got %f", *result.PacketLoss)
	}

	if result.MeasurementMethod != "TCP" {
		t.Fatalf("expected TCP measurement method, got %s", result.MeasurementMethod)
	}

	evaluatePillarStatus(&result, DefaultLossCriticalPct, DefaultLatencyWarningMs, DefaultLatencyCriticalMs)

	if result.Status == "critical" {
		t.Fatal("TCP-only pillar with reachable targets should not be critical")
	}
	if result.Status == "unavailable" {
		t.Fatal("TCP-only pillar with successful probes should not be unavailable")
	}
}

// ---------- TestTimeoutNotLatency ----------

func TestTimeoutNotLatency(t *testing.T) {
	probe := NetworkTargetProbe{
		ProbeMethod:      "ICMP",
		TotalProbes:      5,
		SuccessfulProbes: 3,
		FailedProbes:     2,
		LatencyMs:        15.0,
		MinLatencyMs:     10.0,
		MaxLatencyMs:     20.0,
	}
	loss := 40.0
	probe.PacketLoss = &loss

	if probe.LatencyMs > 25.0 {
		t.Fatalf("latency %.1fms seems to include timeout values", probe.LatencyMs)
	}
	timeoutMs := 2000.0
	if probe.LatencyMs >= timeoutMs {
		t.Fatal("timeout value was used as real latency")
	}
}

// ---------- TestParsePingOutput (Linux, Alpine BusyBox, macOS) ----------

func TestParsePingOutput(t *testing.T) {
	// Standard Linux (iputils) format
	linuxOutput := `PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
64 bytes from 1.1.1.1: icmp_seq=1 ttl=54 time=35.7 ms
64 bytes from 1.1.1.1: icmp_seq=2 ttl=54 time=35.8 ms
64 bytes from 1.1.1.1: icmp_seq=3 ttl=54 time=36.5 ms
64 bytes from 1.1.1.1: icmp_seq=4 ttl=54 time=38.0 ms
64 bytes from 1.1.1.1: icmp_seq=5 ttl=54 time=36.6 ms

--- 1.1.1.1 ping statistics ---
5 packets transmitted, 5 received, 0% packet loss, time 4005ms
rtt min/avg/max/mdev = 35.700/36.520/38.000/0.819 ms`

	result := parsePingOutput(linuxOutput, 5)
	if !result.available {
		t.Fatal("expected available=true")
	}
	if result.total != 5 || result.received != 5 || result.lossPercent != 0 {
		t.Fatalf("unexpected loss or count: %+v", result)
	}
	if result.avgMs < 35.0 || result.avgMs > 37.0 {
		t.Fatalf("expected avg ~36.5ms, got %.1f", result.avgMs)
	}

	// Alpine Linux BusyBox ping format (no /mdev column)
	busyboxOutput := `PING 8.8.8.8 (8.8.8.8): 56 data bytes
64 bytes from 8.8.8.8: seq=0 ttl=114 time=28.377 ms
64 bytes from 8.8.8.8: seq=1 ttl=114 time=28.541 ms

--- 8.8.8.8 ping statistics ---
2 packets transmitted, 2 packets received, 0% packet loss
round-trip min/avg/max = 28.377/28.459/28.541 ms`

	bbResult := parsePingOutput(busyboxOutput, 2)
	if !bbResult.available {
		t.Fatal("expected BusyBox output parsed as available")
	}
	if bbResult.received != 2 {
		t.Fatalf("expected 2 received, got %d", bbResult.received)
	}
	if bbResult.avgMs < 28.0 || bbResult.avgMs > 29.0 {
		t.Fatalf("expected avg ~28.5ms from BusyBox ping, got %.1f", bbResult.avgMs)
	}

	// macOS format
	macOutput := `PING 8.8.8.8 (8.8.8.8): 56 data bytes
64 bytes from 8.8.8.8: icmp_seq=0 ttl=114 time=28.377 ms
64 bytes from 8.8.8.8: icmp_seq=1 ttl=114 time=28.541 ms
64 bytes from 8.8.8.8: icmp_seq=2 ttl=114 time=28.520 ms

--- 8.8.8.8 ping statistics ---
3 packets transmitted, 3 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 28.377/28.479/28.541/0.073 ms`

	macResult := parsePingOutput(macOutput, 3)
	if !macResult.available {
		t.Fatal("expected macOS output parsed as available")
	}
	if macResult.avgMs < 28.0 || macResult.avgMs > 29.0 {
		t.Fatalf("expected avg ~28.5ms, got %.1f", macResult.avgMs)
	}
}

// ---------- TestEvaluateTargetStatus ----------

func TestEvaluateTargetStatus(t *testing.T) {
	loss0 := 0.0
	loss25 := 25.0

	target := NetworkTarget{
		Name: "Test Target",
		Tag:  "Trong nước",
	}

	// TCP always reachable
	status := evaluateTargetStatus(target, &loss0, 5.0, "TCP")
	if status != "reachable" {
		t.Fatalf("TCP should always be 'reachable', got %s", status)
	}

	// Domestic ICMP optimal
	status = evaluateTargetStatus(target, &loss0, 10.0, "ICMP")
	if status != "optimal" {
		t.Fatalf("expected optimal, got %s", status)
	}

	// Domestic ICMP critical (high loss >= 20%)
	status = evaluateTargetStatus(target, &loss25, 10.0, "ICMP")
	if status != "critical" {
		t.Fatalf("expected critical for 25%% loss, got %s", status)
	}

	// ICMP warning (elevated latency > 50ms default)
	status = evaluateTargetStatus(target, &loss0, 60.0, "ICMP")
	if status != "warning" {
		t.Fatalf("expected warning for 60ms latency, got %s", status)
	}
}

// ---------- TestDynamicTagGroupingInDiagnosticReport ----------

func TestDynamicTagGroupingInDiagnosticReport(t *testing.T) {
	ctx := context.Background()

	// Probes with 2 custom tags
	customTargets := []NetworkTarget{
		{
			ID:           "tgt-1",
			Name:         "Gateway Router",
			Host:         "127.0.0.1",
			Tag:          "Hạ tầng nội bộ",
			ProbeMethod:  "ICMP",
			ProbesPerRun: 2,
			Enabled:      true,
			IsGateway:    true,
		},
		{
			ID:           "tgt-2",
			Name:         "Khách hàng A Web",
			Host:         "127.0.0.1",
			Port:         80,
			Tag:          "Khách hàng VIP",
			ProbeMethod:  "TCP",
			ProbesPerRun: 2,
			Enabled:      true,
		},
	}

	report, results := RunNetworkDiagnostic(ctx, "srv-1", "Server Alpha", nil, customTargets)

	if report.ServerID != "srv-1" {
		t.Fatalf("expected server_id srv-1, got %s", report.ServerID)
	}
	if report.Gateway == nil {
		t.Fatal("expected gateway result to be populated from gateway target")
	}

	// Verify group is created for "Khách hàng VIP"
	if _, ok := report.Groups["Khách hàng VIP"]; !ok {
		t.Fatalf("expected group 'Khách hàng VIP' in report.Groups, got %v", report.Groups)
	}

	if len(results) != 1 { // 1 regular target result
		t.Fatalf("expected 1 regular history result, got %d", len(results))
	}
}

func TestBuildDiagnosticReportFromTargets(t *testing.T) {
	lat := 12.5
	minLat := 10.0
	maxLat := 15.0
	loss := 0.0
	now := time.Now()

	targets := []NetworkTargetWithLatest{
		{
			NetworkTarget: NetworkTarget{
				ID:          "gw-1",
				AgentID:     "srv-1",
				Name:        "Local Gateway",
				Host:        "192.168.1.1",
				Tag:         "Network",
				ProbeMethod: "ICMP",
				Enabled:     true,
				IsGateway:   true,
			},
			LatestResult: &NetworkTargetResult{
				ID:               "res-1",
				TargetID:         "gw-1",
				LatencyMs:        &lat,
				PacketLoss:       &loss,
				TotalProbes:      5,
				SuccessfulProbes: 5,
				Status:           "optimal",
				MeasuredAt:       now,
			},
		},
		{
			NetworkTarget: NetworkTarget{
				ID:          "tgt-1",
				AgentID:     "srv-1",
				Name:        "Google DNS",
				Host:        "8.8.8.8",
				Tag:         "Quốc tế",
				ProbeMethod: "ICMP",
				Enabled:     true,
			},
			LatestResult: &NetworkTargetResult{
				ID:               "res-2",
				TargetID:         "tgt-1",
				LatencyMs:        &lat,
				MinLatencyMs:     &minLat,
				MaxLatencyMs:     &maxLat,
				PacketLoss:       &loss,
				TotalProbes:      5,
				SuccessfulProbes: 5,
				Status:           "optimal",
				MeasuredAt:       now,
			},
		},
	}

	report := BuildDiagnosticReportFromTargets("srv-1", "Server One", nil, targets)

	if report.ServerID != "srv-1" {
		t.Fatalf("expected ServerID 'srv-1', got '%s'", report.ServerID)
	}
	if report.Gateway == nil {
		t.Fatal("expected gateway result to be populated")
	}
	if report.Gateway.LatencyMs != 12.5 {
		t.Fatalf("expected gateway latency 12.5, got %f", report.Gateway.LatencyMs)
	}
	if len(report.Probes) != 1 {
		t.Fatalf("expected 1 regular probe, got %d", len(report.Probes))
	}
	if _, ok := report.Groups["Quốc tế"]; !ok {
		t.Fatal("expected group 'Quốc tế' to exist")
	}
	if report.AlertEvaluation.Severity != "none" {
		t.Fatalf("expected alert severity none, got %s", report.AlertEvaluation.Severity)
	}
}

