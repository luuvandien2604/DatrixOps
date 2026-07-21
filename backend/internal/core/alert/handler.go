package alert

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

// Handler triển khai HTTP API cho alert rules, channels và dashboard notifications.
type Handler struct {
	repo *Repository
}

// NewHandler tạo HTTP handler dùng alert repository hiện tại.
func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

// ListRules trả các alert rule cùng agent mục tiêu và channel đã chọn.
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

// CreateRule tạo rule mới cho toàn bộ agent hoặc một agent cụ thể.
// Channel và agent đều được repository xác thực thuộc đúng user hiện tại.
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
	if rule.Metric == "status" {
		rule.Operator = "=="
		rule.Threshold = 0
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
	response.Success(w, http.StatusCreated, rule)
}

// DeleteRule xóa một rule thuộc user hiện tại.
func (h *Handler) DeleteRule(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	id := r.PathValue("id")
	if err := h.repo.DeleteRule(r.Context(), id, userID); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to delete alert rule")
		return
	}
	response.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ListChannels trả các notification channel và số rule đang sử dụng từng channel.
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
	response.Success(w, http.StatusOK, channels)
}

// CreateChannel tạo Telegram hoặc Discord channel mới.
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
	response.Success(w, http.StatusCreated, channel)
}

// DeleteChannel xóa channel nếu channel chưa được alert rule nào sử dụng.
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
	response.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ListNotifications trả danh sách notification mới nhất và unread_count cho badge.
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

// MarkNotificationRead đánh dấu một notification cụ thể là đã xem.
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

// MarkAllNotificationsRead đánh dấu toàn bộ notification chưa xem của user.
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

// userIDFromRequest lấy user ID do authentication middleware đưa vào context.
func userIDFromRequest(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return "", false
	}
	return userID, true
}

// validateRule kiểm tra điều kiện cảnh báo trước khi truy cập database.
func validateRule(rule AlertRule) string {
	if rule.Name == "" {
		return "Alert name is required"
	}
	if rule.DurationMinutes <= 0 {
		return "Duration must be greater than zero"
	}
	if len(rule.ChannelIDs) == 0 {
		return "Select at least one notification channel"
	}

	switch rule.Metric {
	case "cpu", "ram":
		if rule.Operator != ">" && rule.Operator != "<" {
			return "Unsupported alert condition"
		}
		if rule.Threshold < 0 || rule.Threshold > 100 {
			return "Threshold must be between 0 and 100"
		}
	case "status":
		rule.Operator = "=="
	default:
		return "Unsupported alert metric"
	}
	return ""
}

// validateChannel kiểm tra loại channel và các secret bắt buộc theo từng nền tảng.
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
	case "discord":
		webhookURL, _ := channel.Config["webhook_url"].(string)
		if strings.TrimSpace(webhookURL) == "" {
			return "Discord webhook URL is required"
		}
	default:
		return "Unsupported notification channel type"
	}
	return ""
}
