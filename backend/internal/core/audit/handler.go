package audit

import (
	"net/http"
	"strconv"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) ListLogs(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	query := r.URL.Query()
	filter := ListFilter{Limit: 100}

	if limitStr := query.Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			filter.Limit = l
		}
	}

	if rangeStr := query.Get("range"); rangeStr != "" {
		now := time.Now().UTC()
		var duration time.Duration
		switch rangeStr {
		case "15m":
			duration = 15 * time.Minute
		case "1h":
			duration = 1 * time.Hour
		case "3h":
			duration = 3 * time.Hour
		case "6h":
			duration = 6 * time.Hour
		case "12h":
			duration = 12 * time.Hour
		case "24h":
			duration = 24 * time.Hour
		case "7d":
			duration = 7 * 24 * time.Hour
		case "30d":
			duration = 30 * 24 * time.Hour
		}
		if duration > 0 {
			from := now.Add(-duration)
			filter.From = &from
			filter.To = &now
			if filter.Limit == 100 {
				filter.Limit = 500
			}
		}
	}

	if fromStr := query.Get("from"); fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			filter.From = &t
		}
	}

	if toStr := query.Get("to"); toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			filter.To = &t
		}
	}

	logs, err := h.repo.ListLogsFiltered(r.Context(), userID, filter)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list audit logs")
		return
	}

	response.Success(w, http.StatusOK, logs)
}
