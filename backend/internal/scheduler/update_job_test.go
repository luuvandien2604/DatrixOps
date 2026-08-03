package scheduler

import (
	"log/slog"
	"os"
	"testing"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
)

func TestCompareSemVer(t *testing.T) {
	tests := []struct {
		v1       string
		v2       string
		expected int
	}{
		{"1.5.4", "1.5.3", 1},
		{"1.5.3", "1.5.4", -1},
		{"1.5.3", "1.5.3", 0},
		{"v2.0.0", "1.9.9", 1},
		{"1.10.0", "1.9.0", 1},
	}

	for _, tt := range tests {
		res := CompareSemVer(tt.v1, tt.v2)
		if res != tt.expected {
			t.Errorf("CompareSemVer(%q, %q) = %d, expected %d", tt.v1, tt.v2, res, tt.expected)
		}
	}
}

func TestUpdateJobGetStatus(t *testing.T) {
	cfg := &config.Config{
		AgentVersion: "1.5.3",
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	job := NewUpdateJob(cfg, logger)

	status := job.GetStatus()
	if status.CurrentVersion != "1.5.3" {
		t.Errorf("expected CurrentVersion 1.5.3, got %s", status.CurrentVersion)
	}

	globalStatus := GetUpdateStatus()
	if globalStatus.CurrentVersion != "1.5.3" {
		t.Errorf("expected global CurrentVersion 1.5.3, got %s", globalStatus.CurrentVersion)
	}
}
