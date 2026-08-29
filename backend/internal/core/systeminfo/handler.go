package systeminfo

import (
	"net/http"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
	"github.com/luuvandien2604/DatrixOps/backend/internal/scheduler"
)

type Handler struct {
	db      *database.DB
	cfg     *config.Config
	version string
	commit  string
}

func NewHandler(db *database.DB, cfg *config.Config, version, commit string) *Handler {
	return &Handler{db: db, cfg: cfg, version: version, commit: commit}
}

func (h *Handler) Info(w http.ResponseWriter, r *http.Request) {
	var (
		systemName       string
		timezone         string
		setupCompletedAt *time.Time
	)
	if err := h.db.Pool.QueryRow(r.Context(), `
		SELECT system_name, timezone, setup_completed_at
		FROM system_settings
		WHERE id = 1
	`).Scan(&systemName, &timezone, &setupCompletedAt); err != nil {
		response.Error(w, http.StatusServiceUnavailable, "SYSTEM_INFO_UNAVAILABLE", "Unable to read control plane information")
		return
	}

	dataOwnership := "customer-controlled"
	if h.cfg.DeploymentMode == "managed" {
		dataOwnership = "provider-managed"
	}

	cpVersion := h.version
	if cpVersion == "" || cpVersion == "dev" {
		if h.cfg.DatrixopsVersion != "" {
			cpVersion = h.cfg.DatrixopsVersion
		} else {
			cpVersion = "1.8.5"
		}
	}

	w.Header().Set("Cache-Control", "no-store")
	agentVer := h.cfg.AgentVersion
	if latest := scheduler.GetLatestAgentVersion(); latest != "" && (agentVer == "" || scheduler.CompareSemVer(latest, agentVer) > 0) {
		agentVer = latest
	}
	agentArtifactBaseURL := h.cfg.AgentArtifactBaseURL
	if strings.Contains(agentArtifactBaseURL, "github.com") && strings.Contains(agentArtifactBaseURL, "/releases/download/") && agentVer != "" {
		idx := strings.Index(agentArtifactBaseURL, "/releases/download/")
		prefix := agentArtifactBaseURL[:idx+len("/releases/download/")]
		agentArtifactBaseURL = prefix + "agent-v" + agentVer
	} else if agentArtifactBaseURL == "" && agentVer != "" {
		agentArtifactBaseURL = "https://github.com/luuvandien2604/DatrixOps/releases/download/agent-v" + agentVer
	}

	response.Success(w, http.StatusOK, map[string]any{
		"edition":                 h.cfg.Edition,
		"deployment_mode":         h.cfg.DeploymentMode,
		"data_ownership":          dataOwnership,
		"system_name":             systemName,
		"timezone":                timezone,
		"public_url":              h.cfg.PublicURL,
		"agent_release_url":       h.cfg.AgentReleaseURL,
		"agent_release_layout":    h.cfg.AgentReleaseLayout,
		"agent_artifact_base_url": agentArtifactBaseURL,
		"agent_version":           agentVer,
		"control_plane":           map[string]string{"version": cpVersion, "commit": h.commit},
		"version":                 cpVersion,
		"update_check":            scheduler.GetUpdateStatus(),
		"setup_completed":         setupCompletedAt != nil,
		"registration_enabled":    h.cfg.PublicRegistration,
		"retention": map[string]int{
			"metrics_days":     h.cfg.MetricsRetentionDays,
			"operational_days": h.cfg.OperationalRetentionDays,
		},
		"features": map[string]bool{
			"web_terminal":     h.cfg.EnableWebTerminal,
			"remote_scripts":   h.cfg.EnableRemoteScripts,
			"service_controls": h.cfg.EnableServiceControls,
			"read_only_logs":   h.cfg.EnableReadOnlyLogs,
		},
	})
}
