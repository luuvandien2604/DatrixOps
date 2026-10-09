package systeminfo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
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
			cpVersion = "1.8.46"
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

type SystemSettingsDTO struct {
	SystemName          string `json:"system_name"`
	Timezone            string `json:"timezone"`
	PublicURL           string `json:"public_url"`
	RegistrationEnabled bool   `json:"registration_enabled"`
	SMTPEnabled         bool   `json:"smtp_enabled"`
	SMTPHost            string `json:"smtp_host"`
	SMTPPort            int    `json:"smtp_port"`
	SMTPUsername        string `json:"smtp_username"`
	SMTPPasswordSet     bool   `json:"smtp_password_set"`
	SMTPFromEmail       string `json:"smtp_from_email"`
	SMTPFromName        string `json:"smtp_from_name"`
	SMTPEncryption      string `json:"smtp_encryption"`
}

func (h *Handler) GetSettings(w http.ResponseWriter, r *http.Request) {
	var s SystemSettingsDTO
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT 
			system_name, timezone, public_url, registration_enabled,
			smtp_enabled, smtp_host, smtp_port, smtp_username,
			(smtp_password != ''), smtp_from_email, smtp_from_name, smtp_encryption
		FROM system_settings
		WHERE id = 1
	`).Scan(
		&s.SystemName, &s.Timezone, &s.PublicURL, &s.RegistrationEnabled,
		&s.SMTPEnabled, &s.SMTPHost, &s.SMTPPort, &s.SMTPUsername,
		&s.SMTPPasswordSet, &s.SMTPFromEmail, &s.SMTPFromName, &s.SMTPEncryption,
	)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to retrieve system settings")
		return
	}

	if s.PublicURL == "" && h.cfg.PublicURL != "" {
		s.PublicURL = h.cfg.PublicURL
	}

	response.Success(w, http.StatusOK, s)
}

type UpdateSettingsRequest struct {
	SystemName          string `json:"system_name"`
	Timezone            string `json:"timezone"`
	PublicURL           string `json:"public_url"`
	RegistrationEnabled bool   `json:"registration_enabled"`
	SMTPEnabled         bool   `json:"smtp_enabled"`
	SMTPHost            string `json:"smtp_host"`
	SMTPPort            int    `json:"smtp_port"`
	SMTPUsername        string `json:"smtp_username"`
	SMTPPassword        string `json:"smtp_password"`
	SMTPFromEmail       string `json:"smtp_from_email"`
	SMTPFromName        string `json:"smtp_from_name"`
	SMTPEncryption      string `json:"smtp_encryption"`
}

func (h *Handler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req UpdateSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "Invalid JSON request body")
		return
	}

	req.SystemName = strings.TrimSpace(req.SystemName)
	if req.SystemName == "" {
		req.SystemName = "DatrixOps"
	}

	if req.SMTPPort <= 0 || req.SMTPPort > 65535 {
		req.SMTPPort = 587
	}

	req.SMTPHost = strings.TrimSpace(req.SMTPHost)
	req.SMTPFromEmail = strings.TrimSpace(req.SMTPFromEmail)
	req.SMTPFromName = strings.TrimSpace(req.SMTPFromName)
	if req.SMTPFromName == "" {
		req.SMTPFromName = "DatrixOps"
	}

	req.SMTPEncryption = strings.ToLower(strings.TrimSpace(req.SMTPEncryption))
	if req.SMTPEncryption != "ssl" && req.SMTPEncryption != "none" {
		req.SMTPEncryption = "tls"
	}

	if req.SMTPEnabled {
		if req.SMTPHost == "" {
			response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "SMTP host is required when SMTP is enabled")
			return
		}
		if req.SMTPFromEmail == "" || !strings.Contains(req.SMTPFromEmail, "@") {
			response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Valid sender (From) email address is required")
			return
		}
	}

	var err error
	if strings.TrimSpace(req.SMTPPassword) != "" {
		_, err = h.db.Pool.Exec(r.Context(), `
			UPDATE system_settings
			SET system_name = $1,
			    timezone = $2,
			    public_url = $3,
			    registration_enabled = $4,
			    smtp_enabled = $5,
			    smtp_host = $6,
			    smtp_port = $7,
			    smtp_username = $8,
			    smtp_password = $9,
			    smtp_from_email = $10,
			    smtp_from_name = $11,
			    smtp_encryption = $12,
			    updated_at = NOW()
			WHERE id = 1
		`, req.SystemName, req.Timezone, req.PublicURL, req.RegistrationEnabled,
			req.SMTPEnabled, req.SMTPHost, req.SMTPPort, req.SMTPUsername,
			req.SMTPPassword, req.SMTPFromEmail, req.SMTPFromName, req.SMTPEncryption)
	} else {
		_, err = h.db.Pool.Exec(r.Context(), `
			UPDATE system_settings
			SET system_name = $1,
			    timezone = $2,
			    public_url = $3,
			    registration_enabled = $4,
			    smtp_enabled = $5,
			    smtp_host = $6,
			    smtp_port = $7,
			    smtp_username = $8,
			    smtp_from_email = $9,
			    smtp_from_name = $10,
			    smtp_encryption = $11,
			    updated_at = NOW()
			WHERE id = 1
		`, req.SystemName, req.Timezone, req.PublicURL, req.RegistrationEnabled,
			req.SMTPEnabled, req.SMTPHost, req.SMTPPort, req.SMTPUsername,
			req.SMTPFromEmail, req.SMTPFromName, req.SMTPEncryption)
	}

	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update system settings")
		return
	}

	response.Success(w, http.StatusOK, map[string]string{"message": "Settings updated successfully"})
}

type TestSMTPPayload struct {
	ToEmail string `json:"to_email"`
}

func (h *Handler) TestSMTP(w http.ResponseWriter, r *http.Request) {
	var payload TestSMTPPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_BODY", "Invalid JSON request body")
		return
	}

	payload.ToEmail = strings.TrimSpace(payload.ToEmail)
	if payload.ToEmail == "" || !strings.Contains(payload.ToEmail, "@") {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "A valid destination email is required for testing")
		return
	}

	var (
		smtpHost       string
		smtpPort       int
		smtpUsername   string
		smtpPassword   string
		smtpFromEmail  string
		smtpFromName   string
		smtpEncryption string
	)
	err := h.db.Pool.QueryRow(r.Context(), `
		SELECT smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_encryption
		FROM system_settings
		WHERE id = 1
	`).Scan(&smtpHost, &smtpPort, &smtpUsername, &smtpPassword, &smtpFromEmail, &smtpFromName, &smtpEncryption)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to read SMTP settings")
		return
	}

	if smtpHost == "" || smtpFromEmail == "" {
		response.Error(w, http.StatusBadRequest, "SMTP_NOT_CONFIGURED", "SMTP host and From email must be configured before testing")
		return
	}

	fromHeader := smtpFromEmail
	if smtpFromName != "" {
		fromHeader = fmt.Sprintf("%s <%s>", smtpFromName, smtpFromEmail)
	}

	emailConfig := notifier.EmailConfig{
		Host:     smtpHost,
		Port:     smtpPort,
		Username: smtpUsername,
		Password: smtpPassword,
		From:     fromHeader,
		To:       payload.ToEmail,
		UseTLS:   smtpEncryption == "ssl" || smtpPort == 465,
	}

	htmlBody := fmt.Sprintf(`
		<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 8px;">
			<h2 style="color: #10b981; margin-top: 0;">✓ SMTP Configuration Verified</h2>
			<p>This is a test notification sent from your <strong>DatrixOps</strong> instance.</p>
			<p>Your SMTP host connection and authentication parameters were verified successfully.</p>
			<hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
			<p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">Sent at: %s UTC</p>
		</div>
	`, time.Now().UTC().Format(time.RFC3339))



	if err := notifier.SendEmail(emailConfig, "[DatrixOps] Test Email Delivery", htmlBody); err != nil {
		response.Error(w, http.StatusBadGateway, "SMTP_DELIVERY_FAILED", fmt.Sprintf("Failed to send test email: %v", err))
		return
	}

	response.Success(w, http.StatusOK, map[string]string{
		"message": fmt.Sprintf("Test email sent successfully to %s", payload.ToEmail),
	})
}
