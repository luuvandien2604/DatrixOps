package server

import (
	"context"
	"testing"
	"time"
)

func TestProbeSingleTarget(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	tgt := targetDefinition{
		id:       "test-cloudflare",
		name:     "Cloudflare Test",
		category: "international",
		host:     "1.1.1.1",
		port:     443,
		protocol: "HTTPS",
		location: "Global",
	}

	res := probeSingleTarget(ctx, tgt, 1500*time.Millisecond)
	if res.ID != "test-cloudflare" {
		t.Fatalf("expected ID 'test-cloudflare', got '%s'", res.ID)
	}
	if res.Category != "international" {
		t.Fatalf("expected Category 'international', got '%s'", res.Category)
	}
	// Target could be reachable or blocked in isolated sandbox, but probe shouldn't panic
	if res.LatencyMs <= 0 {
		t.Fatalf("expected LatencyMs > 0, got %f", res.LatencyMs)
	}
}

func TestRunNetworkDiagnostic(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	report := RunNetworkDiagnostic(ctx, "srv-123", "Test Server", nil)
	if report == nil {
		t.Fatal("expected non-nil report")
	}
	if report.ServerID != "srv-123" {
		t.Fatalf("expected server ID 'srv-123', got '%s'", report.ServerID)
	}
	if len(report.DomesticProbes) != len(domesticTargets) {
		t.Fatalf("expected %d domestic probes, got %d", len(domesticTargets), len(report.DomesticProbes))
	}
	if len(report.InternationalProbes) != len(internationalTargets) {
		t.Fatalf("expected %d international probes, got %d", len(internationalTargets), len(report.InternationalProbes))
	}
	if len(report.SubseaCables) != 4 {
		t.Fatalf("expected 4 subsea cables, got %d", len(report.SubseaCables))
	}
	if report.DomesticStatus == "" || report.InternationalStatus == "" {
		t.Fatal("expected non-empty status strings")
	}
}
