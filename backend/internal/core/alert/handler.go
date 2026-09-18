package alert

import (
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/auditlog"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

// Handler implements HTTP APIs for alert rules, channels, and dashboard notifications.
type Handler struct {
	repo *Repository
}

// NewHandler creates an HTTP handler with the provided alert repository.
func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

// ListRules returns alert rules with their target servers and channels.
func (h *Handler) ListRules(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	rules, err := h.repo.ListRules(r.Context(), userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list alert rules")
		return
	}
	response.Success(w, http.StatusOK, rules)
}

// CreateRule creates a new alert rule for all servers or a specific server.
// Channels and servers are verified against the current authenticated user.
func (h *Handler) CreateRule(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	var rule AlertRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request payload")
		return
	}

	rule.Name = strings.TrimSpace(rule.Name)
	if rule.ServerID != nil {
		normalizedServerID := strings.TrimSpace(*rule.ServerID)
		if normalizedServerID == "" {
			rule.ServerID = nil
		} else {
			rule.ServerID = &normalizedServerID
		}
	}
	if rule.Metric == "status" || rule.Metric == "container" || rule.Metric == "service" {
		rule.Operator = "=="
		rule.Threshold = 0
	}
	if rule.TargetName != nil {
		normalizedTarget := strings.TrimSpace(*rule.TargetName)
		if normalizedTarget == "" {
			rule.TargetName = nil
		} else {
			rule.TargetName = &normalizedTarget
		}
	}
	if validationMessage := validateRule(rule); validationMessage != "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", validationMessage)
		return
	}

	rule.Enabled = true
	rule.UserID = userID
	if err := h.repo.CreateRule(r.Context(), &rule); err != nil {
		switch {
		case errors.Is(err, ErrInvalidChannelSelection):
			response.Error(w, http.StatusBadRequest, "INVALID_CHANNEL_SELECTION", "One or more notification channels are invalid, disabled, or unavailable")
		case errors.Is(err, ErrInvalidServerSelection):
			response.Error(w, http.StatusBadRequest, "INVALID_AGENT_SELECTION", "The selected agent is invalid or unavailable")
		default:
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create alert rule")
		}
		return
	}
	auditlog.Record(r.Context(), h.repo.db, userID, "CREATE_ALERT_RULE", "ALERT_RULE", rule.ID, map[string]any{
		"name":                    rule.Name,
		"metric":                  rule.Metric,
		"operator":                rule.Operator,
		"threshold":               rule.Threshold,
		"duration_minutes":        rule.DurationMinutes,
		"repeat_interval_minutes": rule.RepeatIntervalMinutes,
		"target_name":             rule.TargetName,
		"server_id":               rule.ServerID,
		"channel_ids":             rule.ChannelIDs,
	})
	response.Success(w, http.StatusCreated, rule)
}

// UpdateRule cập nhật alert rule thuộc về user hiện tại.
func (h *Handler) UpdateRule(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Rule ID is required")
		return
	}

	var rule AlertRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request payload")
		return
	}

	rule.ID = id
	rule.UserID = userID
	rule.Name = strings.TrimSpace(rule.Name)
	if rule.ServerID != nil {
		normalizedServerID := strings.TrimSpace(*rule.ServerID)
		if normalizedServerID == "" {
			rule.ServerID = nil
		} else {
			rule.ServerID = &normalizedServerID
		}
	}
	if rule.Metric == "status" || rule.Metric == "container" || rule.Metric == "service" {
		rule.Operator = "=="
		rule.Threshold = 0
	}
	if rule.TargetName != nil {
		normalizedTarget := strings.TrimSpace(*rule.TargetName)
		if normalizedTarget == "" {
			rule.TargetName = nil
		} else {
			rule.TargetName = &normalizedTarget
		}
	}
	if validationMessage := validateRule(rule); validationMessage != "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", validationMessage)
		return
	}

	if err := h.repo.UpdateRule(r.Context(), &rule); err != nil {
		switch {
		case errors.Is(err, ErrRuleNotFound):
			response.Error(w, http.StatusNotFound, "ALERT_RULE_NOT_FOUND", "Alert rule not found")
		case errors.Is(err, ErrInvalidChannelSelection):
			response.Error(w, http.StatusBadRequest, "INVALID_CHANNEL_SELECTION", "One or more notification channels are invalid, disabled, or unavailable")
		case errors.Is(err, ErrInvalidServerSelection):
			response.Error(w, http.StatusBadRequest, "INVALID_AGENT_SELECTION", "The selected agent is invalid or unavailable")
		default:
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update alert rule")
		}
		return
	}
	auditlog.Record(r.Context(), h.repo.db, userID, "UPDATE_ALERT_RULE", "ALERT_RULE", rule.ID, map[string]any{
		"name":                    rule.Name,
		"metric":                  rule.Metric,
		"operator":                rule.Operator,
		"threshold":               rule.Threshold,
		"duration_minutes":        rule.DurationMinutes,
		"repeat_interval_minutes": rule.RepeatIntervalMinutes,
		"target_name":             rule.TargetName,
		"server_id":               rule.ServerID,
		"channel_ids":             rule.ChannelIDs,
	})
	response.Success(w, http.StatusOK, rule)
}

// ToggleRule toggles enable/disable status for an alert rule.
func (h *Handler) ToggleRule(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	id := r.PathValue("id")
	var body struct {
		Enabled *bool `json:"enabled"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	rule, err := h.repo.ToggleRule(r.Context(), id, userID, body.Enabled)
	if err != nil {
		if errors.Is(err, ErrRuleNotFound) {
			response.Error(w, http.StatusNotFound, "ALERT_RULE_NOT_FOUND", "Alert rule not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update alert rule")
		return
	}
	auditlog.Record(r.Context(), h.repo.db, userID, "UPDATE_ALERT_RULE_STATUS", "ALERT_RULE", id, map[string]any{"enabled": rule.Enabled})
	response.Success(w, http.StatusOK, rule)
}

// DeleteRule deletes an alert rule belonging to the current user.
func (h *Handler) DeleteRule(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	id := r.PathValue("id")
	if err := h.repo.DeleteRule(r.Context(), id, userID); err != nil {
		if errors.Is(err, ErrRuleNotFound) {
			response.Error(w, http.StatusNotFound, "ALERT_RULE_NOT_FOUND", "Alert rule not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to delete alert rule")
		return
	}
	auditlog.Record(r.Context(), h.repo.db, userID, "DELETE_ALERT_RULE", "ALERT_RULE", id, nil)
	response.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ListChannels returns notification channels and rule usage counts.
func (h *Handler) ListChannels(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	channels, err := h.repo.ListChannels(r.Context(), userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list notification channels")
		return
	}
	for i := range channels {
		channels[i].Config = sanitizedChannelConfig(channels[i])
	}
	response.Success(w, http.StatusOK, channels)
}

// CreateChannel creates a new Telegram, Discord, or Email notification channel.
func (h *Handler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	var channel AlertChannel
	if err := json.NewDecoder(r.Body).Decode(&channel); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request payload")
		return
	}

	channel.Name = strings.TrimSpace(channel.Name)
	channel.Type = strings.ToLower(strings.TrimSpace(channel.Type))
	if validationMessage := validateChannel(channel); validationMessage != "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", validationMessage)
		return
	}

	channel.Enabled = true
	channel.UserID = userID
	if err := h.repo.CreateChannel(r.Context(), &channel); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create notification channel")
		return
	}
	auditlog.Record(r.Context(), h.repo.db, userID, "CREATE_ALERT_CHANNEL", "ALERT_CHANNEL", channel.ID, map[string]any{
		"name": channel.Name,
		"type": channel.Type,
	})
	response.Success(w, http.StatusCreated, channel)
}

// DeleteChannel deletes a notification channel if not referenced by active rules.
func (h *Handler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	id := r.PathValue("id")
	if err := h.repo.DeleteChannel(r.Context(), id, userID); err != nil {
		switch {
		case errors.Is(err, ErrChannelInUse):
			response.Error(w, http.StatusConflict, "CHANNEL_IN_USE", "This channel is used by one or more alert rules")
		case errors.Is(err, ErrChannelNotFound):
			response.Error(w, http.StatusNotFound, "CHANNEL_NOT_FOUND", "Notification channel not found")
		default:
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to delete notification channel")
		}
		return
	}
	auditlog.Record(r.Context(), h.repo.db, userID, "DELETE_ALERT_CHANNEL", "ALERT_CHANNEL", id, nil)
	response.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// TestChannelConfig tests sending a sample notification using unsaved configuration.
func (h *Handler) TestChannelConfig(w http.ResponseWriter, r *http.Request) {
	_, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	var payload struct {
		Type   string                 `json:"type"`
		Config map[string]interface{} `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request payload")
		return
	}

	payload.Type = strings.ToLower(strings.TrimSpace(payload.Type))
	tempChannel := AlertChannel{
		Name:   "Test Channel",
		Type:   payload.Type,
		Config: payload.Config,
	}
	if validationMessage := validateChannel(tempChannel); validationMessage != "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", validationMessage)
		return
	}

	if err := sendTestNotification(payload.Type, payload.Config); err != nil {
		response.Error(w, http.StatusBadRequest, "TEST_FAILED", "Failed to send test notification: "+err.Error())
		return
	}

	response.Success(w, http.StatusOK, map[string]string{
		"status":  "success",
		"message": "Test notification sent successfully",
	})
}

// TestExistingChannel tests sending a sample notification using a saved channel.
func (h *Handler) TestExistingChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	id := r.PathValue("id")
	channel, err := h.repo.GetChannel(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, ErrChannelNotFound) {
			response.Error(w, http.StatusNotFound, "CHANNEL_NOT_FOUND", "Notification channel not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to retrieve notification channel")
		return
	}

	if err := sendTestNotification(channel.Type, channel.Config); err != nil {
		response.Error(w, http.StatusBadRequest, "TEST_FAILED", "Failed to send test notification: "+err.Error())
		return
	}

	response.Success(w, http.StatusOK, map[string]string{
		"status":  "success",
		"message": "Test notification sent successfully",
	})
}

// TestAlertRule simulates triggering an alert rule and dispatches sample alerts to linked channels.
func (h *Handler) TestAlertRule(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	id := r.PathValue("id")
	rule, channels, err := h.repo.GetRuleWithChannels(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, ErrRuleNotFound) {
			response.Error(w, http.StatusNotFound, "RULE_NOT_FOUND", "Alert rule not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to retrieve alert rule")
		return
	}

	if len(channels) == 0 {
		response.Error(w, http.StatusBadRequest, "NO_CHANNELS", "This alert rule is not linked to any notification channels. Please edit the rule to add at least one channel.")
		return
	}

	serverName := "All servers"
	if rule.ServerName != nil && *rule.ServerName != "" {
		serverName = *rule.ServerName
	}

	metricLabel := rule.Metric
	switch rule.Metric {
	case "status":
		metricLabel = fmt.Sprintf("Server Offline (heartbeat lost > %dm)", rule.DurationMinutes)
	case "container":
		target := "*"
		if rule.TargetName != nil && *rule.TargetName != "" {
			target = *rule.TargetName
		}
		metricLabel = fmt.Sprintf("Docker Container \"%s\" stopped/unhealthy", target)
	case "service":
		target := "*"
		if rule.TargetName != nil && *rule.TargetName != "" {
			target = *rule.TargetName
		}
		metricLabel = fmt.Sprintf("Systemd Service \"%s\" inactive/failed", target)
	case "website":
		target := "All monitored websites"
		if rule.TargetName != nil && *rule.TargetName != "" {
			target = *rule.TargetName
		}
		serverName = "Website Uptime Probe"
		metricLabel = fmt.Sprintf("Website \"%s\" is DOWN", target)
	case "ssl":
		target := "All monitored websites"
		if rule.TargetName != nil && *rule.TargetName != "" {
			target = *rule.TargetName
		}
		threshold := int(rule.Threshold)
		if threshold <= 0 {
			threshold = 14
		}
		serverName = "SSL Certificate Monitor"
		metricLabel = fmt.Sprintf("Website \"%s\" SSL Certificate expiring soon (≤ %d days)", target, threshold)
	case "network_latency":
		target := "All targets"
		if rule.TargetName != nil && *rule.TargetName != "" {
			target = *rule.TargetName
		}
		metricLabel = fmt.Sprintf("Network Latency for \"%s\" %s %.1f ms (sustained > %dm)", target, rule.Operator, rule.Threshold, rule.DurationMinutes)
	case "network_loss":
		target := "All targets"
		if rule.TargetName != nil && *rule.TargetName != "" {
			target = *rule.TargetName
		}
		metricLabel = fmt.Sprintf("Network Packet Loss for \"%s\" %s %.1f%% (sustained > %dm)", target, rule.Operator, rule.Threshold, rule.DurationMinutes)
	default:
		metricLabel = fmt.Sprintf("%s %s %.1f%% (sustained > %dm)", strings.ToUpper(rule.Metric), rule.Operator, rule.Threshold, rule.DurationMinutes)
	}

	nowStr := time.Now().Format("2006-01-02 15:04:05")
	var sendErrors []string

	for _, ch := range channels {
		var sendErr error
		switch ch.Type {
		case "telegram":
			chatID, _ := ch.Config["chat_id"].(string)
			botToken, _ := ch.Config["bot_token"].(string)
			msg := fmt.Sprintf("🚨 <b>[DATRIXOPS TEST ALERT]</b>\n\n"+
				"📌 <b>Rule:</b> %s\n"+
				"🖥 <b>Server:</b> %s\n"+
				"⚙️ <b>Condition:</b> %s\n"+
				"⚡ <b>Status:</b> Simulated Test Alert\n"+
				"🕒 <b>Time:</b> %s\n\n"+
				"<i>This is a simulated test notification confirming that this alert rule is functioning properly.</i>",
				html.EscapeString(rule.Name),
				html.EscapeString(serverName),
				html.EscapeString(metricLabel),
				nowStr,
			)
			sendErr = notifier.SendTelegram(botToken, chatID, msg)
		case "discord":
			webhookURL, _ := ch.Config["webhook_url"].(string)
			embed := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("🚨 [DATRIXOPS TEST ALERT] %s", rule.Name),
				Description: "This is a simulated test notification for this alert rule.",
				Color:       0xEF4444,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Target Server", Value: serverName, Inline: true},
					{Name: "Alert Condition", Value: metricLabel, Inline: true},
					{Name: "Status", Value: "Simulated Trigger (Test Alert)", Inline: true},
					{Name: "Time", Value: nowStr, Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Alert Rule Test"},
			}
			sendErr = notifier.SendDiscordEmbed(webhookURL, embed)
		case "email":
			emailCfg := parseEmailConfig(ch.Config)
			body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; padding: 24px;">
<div style="max-width: 500px; margin: 0 auto; background: #131b2e; border: 1px solid #232f48; border-radius: 12px; padding: 24px;">
  <h2 style="color: #EF4444; margin-top: 0;">[DATRIXOPS TEST ALERT] %s</h2>
  <p>This is a simulated test notification for alert rule <strong>%s</strong>.</p>
  <ul style="color: #cbd5e1; line-height: 1.8;">
    <li><strong>Target Server:</strong> %s</li>
    <li><strong>Condition:</strong> %s</li>
    <li><strong>Timestamp:</strong> %s</li>
  </ul>
</div>
</body>
</html>`, html.EscapeString(rule.Name), html.EscapeString(rule.Name), html.EscapeString(serverName), html.EscapeString(metricLabel), nowStr)
			sendErr = notifier.SendHTMLEmail(emailCfg, fmt.Sprintf("[DATRIXOPS TEST ALERT] %s", rule.Name), body)
		}

		if sendErr != nil {
			sendErrors = append(sendErrors, fmt.Sprintf("%s: %v", ch.Name, sendErr))
		}
	}

	// Record notification to dashboard_notifications
	dashTitle := fmt.Sprintf("[TEST ALERT] %s", rule.Name)
	dashMsg := fmt.Sprintf("Simulated alert for %s (%s). Delivered to %d channel(s).", serverName, metricLabel, len(channels))
	_ = h.repo.CreateNotification(r.Context(), userID, rule.ID, rule.ServerID, "test_alert", "warning", dashTitle, dashMsg, map[string]any{
		"metric":      rule.Metric,
		"rule_name":   rule.Name,
		"server_name": serverName,
	})

	if len(sendErrors) > 0 && len(sendErrors) == len(channels) {
		response.Error(w, http.StatusBadRequest, "TEST_FAILED", fmt.Sprintf("Failed to send test alert: %s", strings.Join(sendErrors, "; ")))
		return
	}

	auditlog.Record(r.Context(), h.repo.db, userID, "TEST_ALERT_RULE", "ALERT_RULE", rule.ID, map[string]any{
		"name":     rule.Name,
		"channels": len(channels),
	})

	response.Success(w, http.StatusOK, map[string]any{
		"status":  "success",
		"message": fmt.Sprintf("Simulated test alert delivered to %d notification channel(s).", len(channels)),
	})
}

// ListNotifications returns recent dashboard notifications and unread count.
func (h *Handler) ListNotifications(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	limit := 20
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err != nil || parsedLimit < 1 || parsedLimit > 100 {
			response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Limit must be between 1 and 100")
			return
		}
		limit = parsedLimit
	}

	notifications, err := h.repo.ListNotifications(r.Context(), userID, limit)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list dashboard notifications")
		return
	}
	response.Success(w, http.StatusOK, notifications)
}

// MarkNotificationRead marks a specific notification as read.
func (h *Handler) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	if err := h.repo.MarkNotificationRead(r.Context(), r.PathValue("id"), userID); err != nil {
		if errors.Is(err, ErrNotificationNotFound) {
			response.Error(w, http.StatusNotFound, "NOTIFICATION_NOT_FOUND", "Notification not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to mark notification as read")
		return
	}
	response.Success(w, http.StatusOK, map[string]string{"status": "read"})
}

// MarkAllNotificationsRead marks all unread notifications as read.
func (h *Handler) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	updated, err := h.repo.MarkAllNotificationsRead(r.Context(), userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to mark all notifications as read")
		return
	}
	response.Success(w, http.StatusOK, map[string]int64{"updated": updated})
}

// userIDFromRequest extracts the user ID injected into context by auth middleware.
func userIDFromRequest(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return "", false
	}
	return userID, true
}

// validateRule validates alert rule parameters before database persistence.
func validateRule(rule AlertRule) string {
	if rule.Name == "" {
		return "Alert name is required"
	}
	if rule.DurationMinutes <= 0 || rule.DurationMinutes > 1440 {
		return "Duration must be between 1 and 1440 minutes"
	}
	if rule.RepeatIntervalMinutes < 0 || rule.RepeatIntervalMinutes > 1440 {
		return "Repeat interval must be between 0 and 1440 minutes"
	}
	if len(rule.ChannelIDs) == 0 {
		return "Select at least one notification channel"
	}

	switch rule.Metric {
	case "cpu", "ram", "disk":
		if rule.Operator != ">" && rule.Operator != "<" {
			return "Unsupported alert condition"
		}
		if rule.Threshold < 0 || rule.Threshold > 100 {
			return "Threshold must be between 0 and 100"
		}
	case "network_loss":
		if rule.Operator != ">" && rule.Operator != "<" {
			return "Unsupported alert condition"
		}
		if rule.Threshold < 0 || rule.Threshold > 100 {
			return "Threshold must be between 0 and 100"
		}
	case "network_latency":
		if rule.Operator != ">" && rule.Operator != "<" {
			return "Unsupported alert condition"
		}
		if rule.Threshold < 0 || rule.Threshold > 60000 {
			return "Threshold must be between 0 and 60000 ms"
		}
	case "status", "container", "service", "website", "ssl":
		rule.Operator = "=="
	default:
		return "Unsupported alert metric"
	}
	return ""
}

// validateChannel validates channel type and required secrets per provider.
func validateChannel(channel AlertChannel) string {
	if channel.Name == "" {
		return "Channel name is required"
	}
	if channel.Config == nil {
		return "Channel configuration is required"
	}

	switch channel.Type {
	case "telegram":
		botToken, _ := channel.Config["bot_token"].(string)
		chatID, _ := channel.Config["chat_id"].(string)
		if strings.TrimSpace(botToken) == "" || strings.TrimSpace(chatID) == "" {
			return "Telegram bot token and chat ID are required"
		}
		if err := notifier.ValidateTelegramBotToken(botToken); err != nil {
			return "Telegram " + err.Error()
		}
	case "discord":
		webhookURL, _ := channel.Config["webhook_url"].(string)
		if strings.TrimSpace(webhookURL) == "" {
			return "Discord webhook URL is required"
		}
		if err := notifier.ValidateDiscordWebhookURL(webhookURL); err != nil {
			return "Discord webhook " + err.Error()
		}
	case "email":
		host, _ := channel.Config["smtp_host"].(string)
		from, _ := channel.Config["from"].(string)
		to, _ := channel.Config["to"].(string)
		if strings.TrimSpace(host) == "" {
			return "SMTP host is required"
		}
		if _, err := mail.ParseAddress(strings.TrimSpace(from)); err != nil {
			return "A valid From email address is required"
		}
		if _, err := mail.ParseAddress(strings.TrimSpace(to)); err != nil {
			return "A valid recipient email address is required"
		}
		if rawPort, ok := channel.Config["smtp_port"].(float64); ok {
			port := int(rawPort)
			if port < 1 || port > 65535 {
				return "SMTP port must be between 1 and 65535"
			}
		}
	default:
		return "Unsupported notification channel type"
	}
	return ""
}

func sanitizedChannelConfig(channel AlertChannel) map[string]interface{} {
	switch channel.Type {
	case "telegram":
		return map[string]interface{}{
			"chat_id": channel.Config["chat_id"],
		}
	case "discord":
		return map[string]interface{}{
			"webhook_url": "configured",
		}
	case "email":
		return map[string]interface{}{
			"smtp_host": channel.Config["smtp_host"],
			"smtp_port": channel.Config["smtp_port"],
			"from":      channel.Config["from"],
			"to":        channel.Config["to"],
			"use_tls":   channel.Config["use_tls"],
			"username":  maskConfiguredString(channel.Config["username"]),
			"password":  maskConfiguredString(channel.Config["password"]),
		}
	default:
		return map[string]interface{}{}
	}
}

func maskConfiguredString(value interface{}) string {
	if raw, ok := value.(string); ok && strings.TrimSpace(raw) != "" {
		return "configured"
	}
	return ""
}

func sendTestNotification(channelType string, cfg map[string]interface{}) error {
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		loc = time.FixedZone("ICT", 7*3600)
	}
	nowStr := time.Now().In(loc).Format("2006-01-02 15:04:05 (GMT+7)")

	switch channelType {
	case "telegram":
		botToken, _ := cfg["bot_token"].(string)
		chatID, _ := cfg["chat_id"].(string)
		msg := fmt.Sprintf(
			"<b>[DATRIXOPS TEST] NOTIFICATION VERIFICATION</b>\n─────────────────────────────\nTelegram notification channel connected successfully!\n<b>Status:</b> Ready to receive alerts\n<b>Timestamp:</b> <code>%s</code>",
			nowStr,
		)
		return notifier.SendTelegram(botToken, chatID, msg)
	case "discord":
		webhookURL, _ := cfg["webhook_url"].(string)
		embed := notifier.DiscordEmbed{
			Title:       "[DATRIXOPS TEST] NOTIFICATION VERIFICATION",
			Description: "Discord alert notification channel has been successfully configured from DatrixOps.",
			Color:       0x10B981,
			Fields: []notifier.DiscordEmbedField{
				{Name: "Status", Value: "Ready to receive alerts", Inline: true},
				{Name: "Timestamp", Value: nowStr, Inline: true},
			},
			Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring Test"},
		}
		return notifier.SendDiscordEmbed(webhookURL, embed)
	case "email":
		emailCfg := parseEmailConfig(cfg)
		body := fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f8fafc; padding: 24px;">
<div style="max-width: 500px; margin: 0 auto; background: #131b2e; border: 1px solid #232f48; border-radius: 12px; padding: 24px;">
  <h2 style="color: #10B981; margin-top: 0;">[DATRIXOPS TEST] Email Channel Verified</h2>
  <p>DatrixOps monitoring has successfully connected to your SMTP email server.</p>
  <p style="color: #94a3b8; font-size: 13px;">Timestamp: %s</p>
</div>
</body>
</html>`, nowStr)
		return notifier.SendHTMLEmail(emailCfg, "[DATRIXOPS TEST] Email Notification Channel Verified", body)
	default:
		return errors.New("unsupported channel type")
	}
}

func parseEmailConfig(cfg map[string]interface{}) notifier.EmailConfig {
	port := 587
	switch v := cfg["smtp_port"].(type) {
	case float64:
		if v >= 1 && v <= 65535 {
			port = int(v)
		}
	case int:
		if v >= 1 && v <= 65535 {
			port = v
		}
	}
	useTLS := false
	if rawTLS, ok := cfg["use_tls"].(bool); ok {
		useTLS = rawTLS
	}
	strVal := func(k string) string {
		v, _ := cfg[k].(string)
		return v
	}
	return notifier.EmailConfig{
		Host:     strVal("smtp_host"),
		Port:     port,
		Username: strVal("username"),
		Password: strVal("password"),
		From:     strVal("from"),
		To:       strVal("to"),
		UseTLS:   useTLS,
	}
}
