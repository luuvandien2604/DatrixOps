package scheduler

import (
	"encoding/json"
	"testing"
	"time"
)

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		d        time.Duration
		expected string
	}{
		{0, "0s"},
		{45 * time.Second, "45s"},
		{2*time.Minute + 15*time.Second, "2m 15s"},
		{1*time.Hour + 20*time.Minute, "1h 20m"},
		{26*time.Hour + 10*time.Minute, "1d 2h 10m"},
	}

	for _, tt := range tests {
		got := formatDuration(tt.d)
		if got != tt.expected {
			t.Errorf("formatDuration(%v) = %q, want %q", tt.d, got, tt.expected)
		}
	}
}

func TestEvaluateContainerCondition(t *testing.T) {
	snap := map[string]interface{}{
		"docker_containers": []interface{}{
			map[string]interface{}{"name": "web_app", "state": "running"},
			map[string]interface{}{"name": "redis_db", "state": "exited"},
		},
	}
	raw, err := json.Marshal(snap)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	// 1. Target "web_app" is running -> should not satisfy violation condition
	satisfied, val, ok := evaluateContainerCondition("web_app", raw)
	if !ok {
		t.Fatalf("expected ok=true")
	}
	if satisfied {
		t.Errorf("expected satisfied=false for running container, got val=%f", val)
	}

	// 2. Target "redis_db" is exited -> should satisfy violation condition
	satisfied, val, ok = evaluateContainerCondition("redis_db", raw)
	if !ok {
		t.Fatalf("expected ok=true")
	}
	if !satisfied {
		t.Errorf("expected satisfied=true for exited container, got val=%f", val)
	}

	// 3. Target "missing_db" -> should satisfy violation condition
	satisfied, val, ok = evaluateContainerCondition("missing_db", raw)
	if !ok {
		t.Fatalf("expected ok=true")
	}
	if !satisfied {
		t.Errorf("expected satisfied=true for missing container, got val=%f", val)
	}
}

func TestEvaluateServiceCondition(t *testing.T) {
	snap := map[string]interface{}{
		"services": []interface{}{
			map[string]interface{}{"name": "nginx.service", "status": "running"},
			map[string]interface{}{"name": "mariadb.service", "status": "failed"},
		},
	}
	raw, err := json.Marshal(snap)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	// 1. Service "nginx" is running -> should not satisfy violation
	satisfied, val, ok := evaluateServiceCondition("nginx", raw)
	if !ok {
		t.Fatalf("expected ok=true")
	}
	if satisfied {
		t.Errorf("expected satisfied=false for active service, got val=%f", val)
	}

	// 2. Service "mariadb" is failed -> should satisfy violation
	satisfied, val, ok = evaluateServiceCondition("mariadb", raw)
	if !ok {
		t.Fatalf("expected ok=true")
	}
	if !satisfied {
		t.Errorf("expected satisfied=true for failed service, got val=%f", val)
	}

	// 3. Service "missing" -> should satisfy violation
	satisfied, val, ok = evaluateServiceCondition("missing", raw)
	if !ok {
		t.Fatalf("expected ok=true")
	}
	if !satisfied {
		t.Errorf("expected satisfied=true for missing service, got val=%f", val)
	}
}

func TestFailureLabel(t *testing.T) {
	if got := failureLabel("connection_refused"); got != "Connection Refused" {
		t.Errorf("expected 'Connection Refused', got %s", got)
	}
	if got := failureLabel("tls_certificate_expired_or_not_yet_valid"); got != "SSL Certificate Expired" {
		t.Errorf("expected 'SSL Certificate Expired', got %s", got)
	}
}
