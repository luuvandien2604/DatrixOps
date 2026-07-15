package server

import (
	"encoding/json"
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

type CreateRequest struct {
	Name      string `json:"name"`
	IPAddress string `json:"ip_address"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	var req CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	if req.Name == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Name is required")
		return
	}

	server, err := h.svc.CreateServer(r.Context(), userID, req.Name, req.IPAddress)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create server")
		return
	}

	response.Success(w, http.StatusCreated, server)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	servers, err := h.svc.ListServers(r.Context(), userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list servers")
		return
	}

	response.Success(w, http.StatusOK, servers)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Server ID is required")
		return
	}

	server, err := h.svc.GetServer(r.Context(), id, userID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		return
	}

	response.Success(w, http.StatusOK, server)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Server ID is required")
		return
	}

	if err := h.svc.DeleteServer(r.Context(), id, userID); err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found or delete failed")
		return
	}

	response.Success(w, http.StatusOK, map[string]string{"id": id, "status": "deleted"})
}

func (h *Handler) ListMetrics(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Server ID is required")
		return
	}

	metrics, err := h.svc.ListMetrics(r.Context(), id, userID, r.URL.Query().Get("range"))
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found or no metrics available")
		return
	}

	response.Success(w, http.StatusOK, metrics)
}

type CreateTaskRequest struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
}

func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	serverID := r.PathValue("id")
	if serverID == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Server ID is required")
		return
	}

	var req CreateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	// Make sure user owns server
	_, err := h.svc.GetServer(r.Context(), serverID, userID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		return
	}

	// Direct DB call for task since it's lightweight (better to put in service, but okay here for now)
	var taskID string
	err = h.svc.repo.db.Pool.QueryRow(r.Context(),
		`INSERT INTO server_tasks (server_id, type, payload) VALUES ($1, $2, $3) RETURNING id`,
		serverID, req.Type, req.Payload,
	).Scan(&taskID)

	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create task")
		return
	}

	response.Success(w, http.StatusCreated, map[string]string{"id": taskID, "status": "pending"})
}

func (h *Handler) GetTask(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	serverID := r.PathValue("id")
	taskID := r.PathValue("taskId")
	
	// Check ownership
	_, err := h.svc.GetServer(r.Context(), serverID, userID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		return
	}

	var status string
	var result *string
	err = h.svc.repo.db.Pool.QueryRow(r.Context(),
		`SELECT status, result::text FROM server_tasks WHERE id = $1 AND server_id = $2`,
		taskID, serverID,
	).Scan(&status, &result)

	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Task not found")
		return
	}

	resMap := map[string]interface{}{"id": taskID, "status": status}
	if result != nil {
		resMap["result"] = *result
	}

	response.Success(w, http.StatusOK, resMap)
}

type UpdateMetaRequest struct {
	GroupName string   `json:"group_name"`
	Tags      []string `json:"tags"`
}

func (h *Handler) UpdateMeta(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	var req UpdateMetaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	if err := h.svc.UpdateServerMeta(r.Context(), id, userID, req.GroupName, req.Tags); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update server meta")
		return
	}

	// Simple inline audit log
	go func() {
		details, _ := json.Marshal(map[string]interface{}{"group_name": req.GroupName, "tags": req.Tags})
		_, _ = h.svc.repo.db.Pool.Exec(context.Background(),
			`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details) VALUES ($1, $2, $3, $4, $5)`,
			userID, "UPDATE_META", "SERVER", id, details)
	}()

	response.Success(w, http.StatusOK, map[string]string{"status": "updated"})
}
