package admin

import (
	"encoding/json"
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

type Handler struct {
	repo *Repository
}

func (h *Handler) ListFleetServers(w http.ResponseWriter, r *http.Request) {
	servers, err := h.repo.ListFleetServers(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list fleet servers")
		return
	}
	response.Success(w, http.StatusOK, servers)
}

func (h *Handler) QueueFleetTask(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Type string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}
	allowed := request.Type == "agent_update" || request.Type == "agent_restart" || request.Type == "vps_reboot"
	if !allowed {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Unsupported fleet task type")
		return
	}
	userID, _ := r.Context().Value(middleware.UserIDKey).(string)
	taskID, err := h.repo.QueueFleetTask(r.Context(), r.PathValue("id"), userID, request.Type)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		return
	}
	_, _ = h.repo.db.Pool.Exec(r.Context(),
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, 'QUEUE_FLEET_TASK', 'SERVER', $2, jsonb_build_object('task_id', $3, 'type', $4))`,
		userID, r.PathValue("id"), taskID, request.Type)
	response.Success(w, http.StatusCreated, map[string]string{"id": taskID, "status": "pending"})
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.repo.ListUsers(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list users")
		return
	}
	response.Success(w, http.StatusOK, users)
}
