package alert

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

// Handler cung cấp HTTP API cho alert rules và notification channels.
type Handler struct {
	repo *Repository
}

// NewHandler tạo alert handler mới.
func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

// ListRules trả các rule của user cùng channel đã chọn cho từng rule.
func (h *Handler) ListRules(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	rules, err := h.repo.ListRules(r.Context(), userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list rules")
		return
	}
	response.Success(w, http.StatusOK, rules)
}

// CreateRule xác thực payload, yêu cầu ít nhất một channel và tạo rule atomically.
func (h *Handler) CreateRule(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	var rule AlertRule
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&rule); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request payload")
		return
	}

	rule.Name = strings.TrimSpace(rule.Name)
	rule.Metric = strings.TrimSpace(rule.Metric)
	rule.Operator = strings.TrimSpace(rule.Operator)
	if validationMessage := validateRule(rule); validationMessage != "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", validationMessage)
		return
	}

	rule.Enabled = true
	rule.UserID = userID
	if rule.DurationMinutes <= 0 {
		rule.DurationMinutes = 1
	}

	if err := h.repo.CreateRule(r.Context(), &rule); err != nil {
		if errors.Is(err, ErrInvalidChannelSelection) {
			response.Error(w, http.StatusBadRequest, "INVALID_CHANNEL_SELECTION", "One or more notification channels are invalid, disabled, or unavailable")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create rule")
		return
	}
	response.Success(w, http.StatusCreated, rule)
}

// DeleteRule xóa một rule thuộc user hiện tại.
func (h *Handler) DeleteRule(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	if err := h.repo.DeleteRule(r.Context(), id, userID); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to delete rule")
		return
	}
	response.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ListChannels trả các channel đã cấu hình để frontend quản lý và chọn cho rule.
func (h *Handler) ListChannels(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	channels, err := h.repo.ListChannels(r.Context(), userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list channels")
		return
	}
	response.Success(w, http.StatusOK, channels)
}

// CreateChannel xác thực cấu hình cơ bản rồi lưu channel mới.
func (h *Handler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	var channel AlertChannel
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&channel); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request payload")
		return
	}

	channel.Name = strings.TrimSpace(channel.Name)
	channel.Type = strings.TrimSpace(channel.Type)
	if validationMessage := validateChannel(channel); validationMessage != "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", validationMessage)
		return
	}

	channel.Enabled = true
	channel.UserID = userID
	if err := h.repo.CreateChannel(r.Context(), &channel); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create channel")
		return
	}
	response.Success(w, http.StatusCreated, channel)
}

// DeleteChannel xóa channel chưa được rule nào sử dụng.
// Nếu đang được dùng, API trả 409 để frontend hướng dẫn người dùng xóa rule trước.
func (h *Handler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	if err := h.repo.DeleteChannel(r.Context(), id, userID); err != nil {
		if errors.Is(err, ErrChannelInUse) {
			response.Error(w, http.StatusConflict, "CHANNEL_IN_USE", "This channel is used by one or more alert rules")
			return
		}
		if errors.Is(err, ErrChannelNotFound) {
			response.Error(w, http.StatusNotFound, "CHANNEL_NOT_FOUND", "Notification channel not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to delete notification channel")
		return
	}
	response.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// userIDFromRequest đọc user ID đã được authentication middleware đưa vào context.
func userIDFromRequest(r *http.Request) (string, bool) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	return userID, ok && userID != ""
}

// validateRule kiểm tra điều kiện nghiệp vụ tối thiểu trước khi truy cập database.
func validateRule(rule AlertRule) string {
	if rule.Name == "" {
		return "Alert name is required"
	}
	if rule.Metric != "cpu" && rule.Metric != "ram" && rule.Metric != "status" {
		return "Unsupported alert metric"
	}
	if rule.Metric != "status" && rule.Operator != ">" && rule.Operator != "<" {
		return "Unsupported alert operator"
	}
	if rule.Metric != "status" && (rule.Threshold < 0 || rule.Threshold > 100) {
		return "Threshold must be between 0 and 100"
	}
	if len(rule.ChannelIDs) == 0 {
		return "Select at least one notification channel"
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
