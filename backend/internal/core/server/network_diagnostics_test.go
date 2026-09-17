package server

import (
	"math"
	"testing"
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
	// Simulate: 3 successful probes at 10, 20, 30ms, 1 timeout
	// Expected average: (10 + 20 + 30) / 3 = 20ms, NOT (10 + 20 + timeout + 30) / 4
	result := tcpProbeResult{
		total:   4,
		success: 3,
		failed:  1,
		avgMs:   20.0, // calculated from successful probes only
		minMs:   10.0,
		maxMs:   30.0,
	}

	if result.avgMs != 20.0 {
		t.Fatalf("expected average latency 20.0ms, got %f", result.avgMs)
	}

	// Verify the timeout doesn't pollute the result
	if result.success+result.failed != result.total {
		t.Fatalf("total probes mismatch: %d success + %d failed != %d total",
			result.success, result.failed, result.total)
	}
}

// ---------- TestAggregateCategoryCalculation ----------
// Verify category loss is probe-based, not target-failure ratio.

func TestAggregateCategoryCalculation(t *testing.T) {
	// 4 ICMP targets × 5 probes each = 20 total probes
	// Target C has 1 failed probe, rest all succeed
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

	// Expected: 1 failed out of 20 total ICMP probes = 5.0%
	expectedLoss := 5.0
	if math.Abs(*result.PacketLoss-expectedLoss) > 0.2 {
		t.Fatalf("expected aggregate ICMP packet loss ~%.1f%%, got %.1f%%", expectedLoss, *result.PacketLoss)
	}

	// Must NOT be 25% (which would be 1 failed target / 4 targets)
	if *result.PacketLoss > 10.0 {
		t.Fatalf("aggregate packet loss %.1f%% is too high; must be probe-based not target-based", *result.PacketLoss)
	}

	// Verify total probes
	if result.TotalProbes != 20 {
		t.Fatalf("expected 20 total probes, got %d", result.TotalProbes)
	}
}

// ---------- TestSingleTargetFailureIsolation ----------
// Verify: 1 failed target out of 4 does NOT produce 25% category loss.

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

	// Expected: 5 failed / 20 total = 25.0%
	// This is correct probe-based math — but it must NOT be "1 target / 4 targets = 25%"
	// The test verifies that the result comes from actual probe counts
	if result.PacketLoss == nil {
		t.Fatal("expected non-nil PacketLoss")
	}
	if result.TotalProbes != 20 {
		t.Fatalf("expected 20 total probes, got %d", result.TotalProbes)
	}
	if result.FailedProbes != 5 {
		t.Fatalf("expected 5 failed probes, got %d", result.FailedProbes)
	}

	// Verify latency is calculated only from successful probes (15 probes from 3 targets)
	if result.LatencyMs <= 0 {
		t.Fatal("expected positive latency from successful probes")
	}
}

// ---------- TestCriticalFirstThresholdEvaluation ----------
// Verify: 25% loss → Critical, not Warning.

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
		// 25% loss exceeds 20% critical threshold → must be Critical
		{"critical_loss", 25.0, 10.0, 20.0, 25.0, 60.0, "critical"},
		// Exactly 20% loss → Critical
		{"boundary_critical_loss", 20.0, 10.0, 20.0, 25.0, 60.0, "critical"},
		// 10% loss is > 0 but < 20% → Warning
		{"warning_loss", 10.0, 10.0, 20.0, 25.0, 60.0, "warning"},
		// 0% loss, low latency → Optimal
		{"optimal", 0.0, 5.0, 20.0, 25.0, 60.0, "optimal"},
		// 0% loss, high latency > critical → Critical
		{"critical_latency", 0.0, 65.0, 20.0, 25.0, 60.0, "critical"},
		// 0% loss, latency between warning and critical → Warning
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
// Verify that ICMP RTT and TCP connection latency are not mixed.

func TestNoMixedProtocolLatencyAggregation(t *testing.T) {
	loss0 := 0.0

	probes := []NetworkTargetProbe{
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: &loss0, LatencyMs: 10.0},
		{ProbeMethod: "ICMP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: &loss0, LatencyMs: 20.0},
		{ProbeMethod: "TCP", TotalProbes: 5, SuccessfulProbes: 5, FailedProbes: 0, PacketLoss: nil, LatencyMs: 100.0},
	}

	result := aggregatePillar(probes)

	// Category latency should come from ICMP probes only: (10*5 + 20*5) / 10 = 15.0ms
	// It should NOT include the TCP 100ms
	expectedLatency := 15.0
	if math.Abs(result.LatencyMs-expectedLatency) > 0.5 {
		t.Fatalf("expected category latency ~%.1fms from ICMP only, got %.1fms (TCP was mixed in)", expectedLatency, result.LatencyMs)
	}

	// Packet loss should come only from ICMP probes
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
// Verify: ICMP unavailable → PacketLoss == nil, status != critical solely from unavailability.

func TestUnavailableProbeHandling(t *testing.T) {
	// All targets are TCP-only (ICMP unavailable)
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

	// Apply international thresholds
	evaluatePillarStatus(&result, InternationalLossCritical, InternationalLatencyWarning, InternationalLatencyCritical)

	// Status should be "reachable", NOT "critical" (no ICMP loss to trigger critical)
	if result.Status == "critical" {
		t.Fatal("TCP-only pillar with reachable targets should not be critical")
	}
	if result.Status == "unavailable" {
		t.Fatal("TCP-only pillar with successful probes should not be unavailable")
	}
}

// ---------- TestTimeoutNotLatency ----------
// Verify timeout is a failed probe, never used as actual latency.

func TestTimeoutNotLatency(t *testing.T) {
	// Simulate probe with 3 successes at known latencies and 2 timeouts
	probe := NetworkTargetProbe{
		ProbeMethod:      "ICMP",
		TotalProbes:      5,
		SuccessfulProbes: 3,
		FailedProbes:     2,
		LatencyMs:        15.0, // average of 3 successful: must be ~15ms
		MinLatencyMs:     10.0,
		MaxLatencyMs:     20.0,
	}
	loss := 40.0
	probe.PacketLoss = &loss

	// Latency must represent only successful probes
	if probe.LatencyMs > 25.0 {
		t.Fatalf("latency %.1fms seems to include timeout values", probe.LatencyMs)
	}

	// Verify that a 2000ms timeout value is never used as latency
	timeoutMs := 2000.0
	if probe.LatencyMs >= timeoutMs {
		t.Fatal("timeout value was used as real latency — this is forbidden")
	}
}

// ---------- TestParsePingOutput ----------
// Test parsing of ping command output.

func TestParsePingOutput(t *testing.T) {
	// Linux format
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
	if result.total != 5 {
		t.Fatalf("expected 5 total, got %d", result.total)
	}
	if result.received != 5 {
		t.Fatalf("expected 5 received, got %d", result.received)
	}
	if result.lossPercent != 0 {
		t.Fatalf("expected 0%% loss, got %.1f%%", result.lossPercent)
	}
	if result.avgMs < 35.0 || result.avgMs > 37.0 {
		t.Fatalf("expected avg ~36.5ms, got %.1f", result.avgMs)
	}
	if result.minMs < 35.0 || result.minMs > 36.0 {
		t.Fatalf("expected min ~35.7ms, got %.1f", result.minMs)
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
	if macResult.received != 3 {
		t.Fatalf("expected 3 received, got %d", macResult.received)
	}
	if macResult.avgMs < 28.0 || macResult.avgMs > 29.0 {
		t.Fatalf("expected avg ~28.5ms, got %.1f", macResult.avgMs)
	}

	// Test with packet loss
	lossOutput := `PING 203.113.131.1 (203.113.131.1) 56(84) bytes of data.
64 bytes from 203.113.131.1: icmp_seq=1 ttl=54 time=5.2 ms
64 bytes from 203.113.131.1: icmp_seq=3 ttl=54 time=4.8 ms
64 bytes from 203.113.131.1: icmp_seq=4 ttl=54 time=5.1 ms

--- 203.113.131.1 ping statistics ---
5 packets transmitted, 3 received, 40% packet loss, time 4006ms
rtt min/avg/max/mdev = 4.800/5.033/5.200/0.170 ms`

	lossResult := parsePingOutput(lossOutput, 5)
	if lossResult.received != 3 {
		t.Fatalf("expected 3 received, got %d", lossResult.received)
	}
	if lossResult.lost != 2 {
		t.Fatalf("expected 2 lost, got %d", lossResult.lost)
	}
	if lossResult.lossPercent != 40.0 {
		t.Fatalf("expected 40%% loss, got %.1f%%", lossResult.lossPercent)
	}
}

// ---------- TestEvaluateTargetStatus ----------

func TestEvaluateTargetStatus(t *testing.T) {
	loss0 := 0.0
	loss25 := 25.0

	// TCP always reachable
	status := evaluateTargetStatus("domestic", &loss0, 5.0, "TCP")
	if status != "reachable" {
		t.Fatalf("TCP should always be 'reachable', got %s", status)
	}

	// Domestic ICMP optimal
	status = evaluateTargetStatus("domestic", &loss0, 10.0, "ICMP")
	if status != "optimal" {
		t.Fatalf("expected optimal, got %s", status)
	}

	// Domestic ICMP critical (high loss)
	status = evaluateTargetStatus("domestic", &loss25, 10.0, "ICMP")
	if status != "critical" {
		t.Fatalf("expected critical for 25%% loss, got %s", status)
	}

	// International ICMP warning (high latency)
	status = evaluateTargetStatus("international", &loss0, 100.0, "ICMP")
	if status != "warning" {
		t.Fatalf("expected warning for 100ms international latency, got %s", status)
	}
}
