package scheduler

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/core/alert"
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

func TestFormatDurationShort(t *testing.T) {
	tests := []struct {
		d        time.Duration
		expected string
	}{
		{0, "0s"},
		{45 * time.Second, "45s"},
		{60 * time.Second, "1m"},
		{2*time.Minute + 15*time.Second, "2m 15s"},
		{1 * time.Hour, "1h"},
		{1*time.Hour + 20*time.Minute, "1h 20m"},
		{26 * time.Hour, "1d 2h"},
	}

	for _, tt := range tests {
		got := formatDurationShort(tt.d)
		if got != tt.expected {
			t.Errorf("formatDurationShort(%v) = %q, want %q", tt.d, got, tt.expected)
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

	// 3. Service "apache2" with status "stopped" and sub_status "dead"
	snapApache := map[string]interface{}{
		"services": []interface{}{
			map[string]interface{}{
				"name":         "apache2",
				"display_name": "apache2.service",
				"status":       "stopped",
				"sub_status":   "dead",
			},
		},
	}
	rawApache, _ := json.Marshal(snapApache)

	// 3a. Target "apache2" -> should satisfy violation (alert firing)
	satisfied, val, ok = evaluateServiceCondition("apache2", rawApache)
	if !ok || !satisfied {
		t.Errorf("expected satisfied=true for stopped apache2 service, got satisfied=%v, val=%f", satisfied, val)
	}

	// 3b. Target "apache2.service" -> should satisfy violation
	satisfied, val, ok = evaluateServiceCondition("apache2.service", rawApache)
	if !ok || !satisfied {
		t.Errorf("expected satisfied=true for stopped apache2.service, got satisfied=%v, val=%f", satisfied, val)
	}

	// 4. Service "missing" -> should satisfy violation
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

func TestBuildAlertNotification_LayoutAndCustomFields(t *testing.T) {
	started := time.Now().Add(-5 * time.Minute)

	// 1. Metric Resolved: Failed at and Recovered at must be on the same row (in the same <tr>)
	rule := alert.AlertRule{
		Name:      "High CPU Alert (> 10%)",
		Metric:    "cpu",
		Operator:  ">",
		Threshold: 10.0,
	}
	_, _, notif := buildAlertNotification(rule, "Control Plane", 2.53, false, 5*time.Minute, false, &started)

	// Verify email contains RESOLVED badge
	if !strings.Contains(notif.emailHTML, "RESOLVED") {
		t.Errorf("expected emailHTML to contain RESOLVED, got %s", notif.emailHTML)
	}
	// Verify email contains same-row Failed at and Recovered at
	expectedRow := `<td class="stat" width="50%"><div class="stat-label">Failed at</div>`
	if !strings.Contains(notif.emailHTML, expectedRow) {
		t.Errorf("expected emailHTML to contain %q", expectedRow)
	}
	expectedPair := `<td class="stat" width="50%"><div class="stat-label">Recovered at</div>`
	if !strings.Contains(notif.emailHTML, expectedPair) {
		t.Errorf("expected emailHTML to contain %q", expectedPair)
	}

	// 2. Container Firing: Should have Container custom field
	target := "redis-cache"
	containerRule := alert.AlertRule{
		Name:       "Redis Down",
		Metric:     "container",
		TargetName: &target,
	}
	_, _, cNotif := buildAlertNotification(containerRule, "Prod-01", 0, true, 0, false, nil)
	if !strings.Contains(cNotif.emailHTML, "redis-cache") {
		t.Errorf("expected emailHTML to contain container name redis-cache")
	}
	if !strings.Contains(cNotif.discordEmbed.Fields[1].Name, "Container") {
		t.Errorf("expected discord embed to have Container field")
	}

	// 3. Service Resolved: Should have Service custom field and Downtime
	svcTarget := "apache2"
	svcRule := alert.AlertRule{
		Name:       "Apache2 Service",
		Metric:     "service",
		TargetName: &svcTarget,
	}
	_, _, sNotif := buildAlertNotification(svcRule, "Prod-01", 0, false, 3*time.Minute, false, &started)
	if !strings.Contains(sNotif.emailHTML, "apache2") {
		t.Errorf("expected emailHTML to contain service name apache2")
	}
	if !strings.Contains(sNotif.emailHTML, "Downtime") {
		t.Errorf("expected emailHTML to contain Downtime")
	}
}

