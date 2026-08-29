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
	CurrentVersion       string    `json:"current_version"`
	LatestVersion        string    `json:"latest_version"`
	LatestAgentVersion   string    `json:"latest_agent_version"`
	UpdateAvailable      bool      `json:"update_available"`
	AgentUpdateAvailable bool      `json:"agent_update_available"`
	LastCheckedAt        time.Time `json:"last_checked_at"`
	UpgradeScriptURL     string    `json:"upgrade_script_url"`
	Managed              bool      `json:"managed,omitempty"`
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
	agentVer := strings.TrimSpace(cfg.AgentVersion)
	serverVer := strings.TrimSpace(cfg.DatrixopsVersion)
	if serverVer == "" {
		serverVer = agentVer
	}

	upgradeURL := "https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh"
	isManaged := cfg != nil && (cfg.DeploymentMode == "managed" || cfg.Edition == "cloud")
	if isManaged {
		upgradeURL = ""
	}

	job := &UpdateJob{
		cfg:    cfg,
		logger: logger.With("component", "UpdateJob"),
		stop:   make(chan struct{}),
		status: UpdateStatus{
			CurrentVersion:     serverVer,
			LatestVersion:      serverVer,
			LatestAgentVersion: agentVer,
			UpdateAvailable:    false,
			LastCheckedAt:      time.Now(),
			UpgradeScriptURL:   upgradeURL,
			Managed:            isManaged,
		},
	}

	globalUpdateJobMu.Lock()
	globalUpdateJob = job
	globalUpdateJobMu.Unlock()

	return job
}

func CommunityUpdateCheckerEnabled(cfg *config.Config) bool {
	return cfg != nil && cfg.Edition == "community" && cfg.DeploymentMode == "self-hosted"
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

func GetUpdateStatusForConfig(cfg *config.Config) *UpdateStatus {
	if !CommunityUpdateCheckerEnabled(cfg) {
		return nil
	}
	status := GetUpdateStatus()
	return &status
}

func GetLatestAgentVersion() string {
	globalUpdateJobMu.RLock()
	job := globalUpdateJob
	globalUpdateJobMu.RUnlock()

	if job == nil {
		return ""
	}
	job.mu.RLock()
	defer job.mu.RUnlock()
	return job.status.LatestAgentVersion
}

func (j *UpdateJob) GetStatus() UpdateStatus {
	j.mu.RLock()
	defer j.mu.RUnlock()
	return j.status
}

func (j *UpdateJob) Start() {
	go func() {
		// Run initial check 2 seconds after startup
		select {
		case <-time.After(2 * time.Second):
			j.run()
		case <-j.stop:
			return
		}

		// Check every 15 minutes for new Agent or Server updates
		ticker := time.NewTicker(15 * time.Minute)
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
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// 1. Check for Server updates
	latestServerVer, err := j.fetchRemoteServerVersion(ctx)
	if err != nil {
		j.logger.Debug("background server update check returned", "error", err)
	}

	// 2. Check for Agent updates online
	latestAgentVer, err := j.fetchRemoteAgentVersion(ctx)
	if err != nil {
		j.logger.Debug("background agent update check returned", "error", err)
	}

	j.mu.Lock()
	defer j.mu.Unlock()

	j.status.LastCheckedAt = time.Now()

	if latestServerVer != "" {
		j.status.LatestVersion = latestServerVer
		currentServerVer := strings.TrimSpace(j.cfg.DatrixopsVersion)
		if currentServerVer == "" {
			currentServerVer = strings.TrimSpace(j.cfg.AgentVersion)
		}
		if CompareSemVer(latestServerVer, currentServerVer) > 0 {
			j.status.UpdateAvailable = true
			j.logger.Info("new server release detected online", "current", currentServerVer, "latest", latestServerVer)
		} else {
			j.status.UpdateAvailable = false
		}
	}

	if latestAgentVer != "" {
		j.status.LatestAgentVersion = latestAgentVer
		currentAgentVer := strings.TrimSpace(j.cfg.AgentVersion)
		if CompareSemVer(latestAgentVer, currentAgentVer) > 0 {
			j.status.AgentUpdateAvailable = true
			j.logger.Info("new agent release detected online", "configured", currentAgentVer, "latest", latestAgentVer)
		}
	}
}

func (j *UpdateJob) fetchRemoteServerVersion(ctx context.Context) (string, error) {
	// Try 1: JSON endpoint
	jsonURL := "https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/version.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, jsonURL, nil)
	if err == nil {
		req.Header.Set("User-Agent", "DatrixOps-Server")
		resp, err := http.DefaultClient.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var payload struct {
				Version string `json:"version"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&payload); err == nil {
				v := strings.TrimSpace(payload.Version)
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
	req2.Header.Set("User-Agent", "DatrixOps-Server")

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
		if strings.HasPrefix(line, "DATRIXOPS_VERSION=") {
			val := strings.Trim(strings.TrimPrefix(line, "DATRIXOPS_VERSION="), `" '`)
			return strings.TrimSpace(val), nil
		}
	}

	return "", fmt.Errorf("DATRIXOPS_VERSION key not found in remote .env.example")
}

func (j *UpdateJob) fetchRemoteAgentVersion(ctx context.Context) (string, error) {
	// Strategy 1: Query GitHub Releases API for latest agent-v*.*.* release tag
	apiURL := "https://api.github.com/repos/luuvandien2604/DatrixOps/releases?per_page=15"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err == nil {
		req.Header.Set("User-Agent", "DatrixOps-Server")
		req.Header.Set("Accept", "application/vnd.github.v3+json")
		resp, err := http.DefaultClient.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var releases []struct {
				TagName string `json:"tag_name"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&releases); err == nil {
				var maxAgentVer string
				for _, r := range releases {
					tag := strings.TrimSpace(r.TagName)
					var ver string
					if strings.HasPrefix(tag, "agent-v") {
						ver = strings.TrimPrefix(tag, "agent-v")
					} else if strings.HasPrefix(tag, "agent-") {
						ver = strings.TrimPrefix(tag, "agent-")
					}
					if ver != "" && semverPattern.MatchString(ver) {
						if maxAgentVer == "" || CompareSemVer(ver, maxAgentVer) > 0 {
							maxAgentVer = ver
						}
					}
				}
				if maxAgentVer != "" {
					return maxAgentVer, nil
				}
			}
		}
	}

	// Strategy 2: Raw agent/version.txt from main branch
	rawURL := "https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/agent/version.txt"
	reqRaw, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err == nil {
		reqRaw.Header.Set("User-Agent", "DatrixOps-Server")
		resp, err := http.DefaultClient.Do(reqRaw)
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			body, err := io.ReadAll(resp.Body)
			if err == nil {
				v := strings.TrimSpace(string(body))
				if semverPattern.MatchString(v) {
					return v, nil
				}
			}
		}
	}

	// Strategy 3: version.json
	jsonURL := "https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/version.json"
	reqJSON, err := http.NewRequestWithContext(ctx, http.MethodGet, jsonURL, nil)
	if err == nil {
		reqJSON.Header.Set("User-Agent", "DatrixOps-Server")
		resp, err := http.DefaultClient.Do(reqJSON)
		if err == nil && resp.StatusCode == http.StatusOK {
			defer resp.Body.Close()
			var payload struct {
				AgentVersion string `json:"agent_version"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&payload); err == nil {
				v := strings.TrimSpace(payload.AgentVersion)
				if v != "" && semverPattern.MatchString(v) {
					return v, nil
				}
			}
		}
	}

	return "", fmt.Errorf("unable to discover remote agent version from online sources")
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
