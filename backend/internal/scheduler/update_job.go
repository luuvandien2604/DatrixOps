package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
)

var semverPattern = regexp.MustCompile(`^[vV]?([0-9]+)\.([0-9]+)\.([0-9]+)`)

type UpdateStatus struct {
	CurrentVersion   string    `json:"current_version"`
	LatestVersion    string    `json:"latest_version"`
	UpdateAvailable  bool      `json:"update_available"`
	LastCheckedAt    time.Time `json:"last_checked_at"`
	UpgradeScriptURL string    `json:"upgrade_script_url"`
}

type UpdateJob struct {
	cfg    *config.Config
	logger *slog.Logger
	stop   chan struct{}
	mu     sync.RWMutex
	status UpdateStatus
}

var (
	globalUpdateJob   *UpdateJob
	globalUpdateJobMu sync.RWMutex
)

func NewUpdateJob(cfg *config.Config, logger *slog.Logger) *UpdateJob {
	job := &UpdateJob{
		cfg:    cfg,
		logger: logger.With("component", "UpdateJob"),
		stop:   make(chan struct{}),
		status: UpdateStatus{
			CurrentVersion:   cfg.AgentVersion,
			LatestVersion:    cfg.AgentVersion,
			UpdateAvailable:  false,
			LastCheckedAt:    time.Now(),
			UpgradeScriptURL: "https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh",
		},
	}

	globalUpdateJobMu.Lock()
	globalUpdateJob = job
	globalUpdateJobMu.Unlock()

	return job
}

func GetUpdateStatus() UpdateStatus {
	globalUpdateJobMu.RLock()
	job := globalUpdateJob
	globalUpdateJobMu.RUnlock()

	if job == nil {
		return UpdateStatus{
			UpdateAvailable:  false,
			UpgradeScriptURL: "https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh",
		}
	}
	return job.GetStatus()
}

func (j *UpdateJob) GetStatus() UpdateStatus {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return j.status
}

func (j *UpdateJob) Start() {
	go func() {
		// Run initial check 5 seconds after startup
		select {
		case <-time.After(5 * time.Second):
			j.run()
		case <-j.stop:
			return
		}

		// Check every 6 hours
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				j.run()
			case <-j.stop:
				return
			}
		}
	}()
}

func (j *UpdateJob) Stop() {
	close(j.stop)
}

func (j *UpdateJob) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	latestVer, err := j.fetchRemoteVersion(ctx)
	if err != nil {
		j.logger.Warn("background update check failed", "error", err)
		return
	}

	j.mu.Lock()
	defer j.mu.Unlock()

	j.status.LastCheckedAt = time.Now()
	if latestVer != "" {
		j.status.LatestVersion = latestVer
		currentVer := strings.TrimSpace(j.cfg.AgentVersion)
		if CompareSemVer(latestVer, currentVer) > 0 {
			j.status.UpdateAvailable = true
			j.logger.Info("new release detected online", "current", currentVer, "latest", latestVer)
		} else {
			j.status.UpdateAvailable = false
		}
	}
}

func (j *UpdateJob) fetchRemoteVersion(ctx context.Context) (string, error) {
	// Try 1: JSON endpoint
	jsonURL := "https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/version.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, jsonURL, nil)
	if err == nil {
		resp, err := http.DefaultClient.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var payload struct {
				Version      string `json:"version"`
				AgentVersion string `json:"agent_version"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&payload); err == nil {
				v := strings.TrimSpace(payload.Version)
				if v == "" {
					v = strings.TrimSpace(payload.AgentVersion)
				}
				if v != "" {
					return v, nil
				}
			}
		}
	}

	// Try 2: .env.example fallback
	envURL := "https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/.env.example"
	req2, err := http.NewRequestWithContext(ctx, http.MethodGet, envURL, nil)
	if err != nil {
		return "", err
	}

	resp2, err := http.DefaultClient.Do(req2)
	if err != nil {
		return "", err
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP status %d", resp2.StatusCode)
	}

	body, err := io.ReadAll(resp2.Body)
	if err != nil {
		return "", err
	}

	lines := strings.Split(string(body), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "AGENT_VERSION=") {
			val := strings.Trim(strings.TrimPrefix(line, "AGENT_VERSION="), `" '`)
			return strings.TrimSpace(val), nil
		}
	}

	return "", fmt.Errorf("AGENT_VERSION key not found in remote .env.example")
}

func CompareSemVer(v1, v2 string) int {
	p1 := parseSemVer(v1)
	p2 := parseSemVer(v2)
	for i := 0; i < 3; i++ {
		if p1[i] > p2[i] {
			return 1
		}
		if p1[i] < p2[i] {
			return -1
		}
	}
	return 0
}

func parseSemVer(v string) [3]int {
	matches := semverPattern.FindStringSubmatch(strings.TrimSpace(v))
	if len(matches) < 4 {
		return [3]int{0, 0, 0}
	}
	m0, _ := strconv.Atoi(matches[1])
	m1, _ := strconv.Atoi(matches[2])
	m2, _ := strconv.Atoi(matches[3])
	return [3]int{m0, m1, m2}
}
