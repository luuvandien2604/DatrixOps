package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

type Handler struct {
	svc *Service
}

var allowedTaskTypes = map[string]struct{}{
	"docker_start":   {},
	"docker_stop":    {},
	"docker_restart": {},
	"docker_logs":    {},
	"agent_update":   {},
	"agent_restart":  {},
	"vps_reboot":     {},
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

	h.recordAudit(r.Context(), userID, "CREATE", "SERVER", server.ID, map[string]interface{}{"name": server.Name})
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

func (h *Handler) DashboardOverview(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	overview, err := h.svc.GetDashboardOverview(r.Context(), userID, r.URL.Query().Get("range"))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to load dashboard overview")
		return
	}

	response.Success(w, http.StatusOK, overview)
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

	h.recordAudit(r.Context(), userID, "DELETE", "SERVER", id, nil)
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

func (h *Handler) ListCronJobs(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	jobs, err := h.svc.ListCronJobs(r.Context(), r.PathValue("id"), userID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found or cron jobs unavailable")
		return
	}
	response.Success(w, http.StatusOK, jobs)
}

type CreateTaskRequest struct {
	Type           string `json:"type"`
	Payload        string `json:"payload"`
	IdempotencyKey string `json:"idempotency_key"`
	TimeoutSeconds int    `json:"timeout_seconds"`
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
	if _, allowed := allowedTaskTypes[req.Type]; !allowed {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Unsupported task type")
		return
	}
	if req.Payload == "" {
		req.Payload = "{}"
	}
	if !json.Valid([]byte(req.Payload)) {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Payload must be valid JSON")
		return
	}
	if req.TimeoutSeconds == 0 {
		req.TimeoutSeconds = 60
	}
	if req.TimeoutSeconds < 10 || req.TimeoutSeconds > 900 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Timeout must be between 10 and 900 seconds")
		return
	}
	if len(req.IdempotencyKey) > 120 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Idempotency key must not exceed 120 characters")
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
	var taskStatus string
	err = h.svc.repo.db.Pool.QueryRow(r.Context(),
		`WITH inserted AS (
			INSERT INTO server_tasks
				(server_id, type, payload, requested_by, idempotency_key, timeout_seconds, expires_at)
			 VALUES ($1, $2, $3::jsonb, $4, NULLIF($5, ''), $6, NOW() + INTERVAL '24 hours')
			 ON CONFLICT DO NOTHING
			 RETURNING id, status
		 )
		 SELECT id, status FROM inserted
		 UNION
		 SELECT existing.id, existing.status
		 FROM server_tasks AS existing
		 WHERE existing.server_id = $1
		   AND (
				(NULLIF($5, '') IS NOT NULL AND existing.idempotency_key = $5)
				OR ($2 = 'agent_update' AND existing.type = 'agent_update' AND existing.status IN ('pending', 'processing'))
		   )
		 LIMIT 1`,
		serverID, req.Type, req.Payload, userID, req.IdempotencyKey, req.TimeoutSeconds,
	).Scan(&taskID, &taskStatus)

	if err != nil {
		slog.Error("failed to create server task", "error", err, "server_id", serverID, "task_type", req.Type)
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create task")
		return
	}

	h.recordAudit(r.Context(), userID, "QUEUE_TASK", "SERVER", serverID, map[string]interface{}{
		"task_id": taskID,
		"type":    req.Type,
	})
	response.Success(w, http.StatusCreated, map[string]string{"id": taskID, "status": taskStatus})
}

func (h *Handler) UpdateAllAgents(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	var total int
	if err := h.svc.repo.db.Pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM servers WHERE user_id = $1`,
		userID,
	).Scan(&total); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to count agents")
		return
	}

	rows, err := h.svc.repo.db.Pool.Query(r.Context(),
		`INSERT INTO server_tasks
			(server_id, type, payload, requested_by, timeout_seconds, expires_at)
		 SELECT server.id, 'agent_update', '{}'::jsonb, $1, 300, NOW() + INTERVAL '24 hours'
		 FROM servers AS server
		 WHERE server.user_id = $1
		   AND NOT EXISTS (
			 SELECT 1 FROM server_tasks AS existing
			 WHERE existing.server_id = server.id
			   AND existing.type = 'agent_update'
			   AND existing.status IN ('pending', 'processing')
		   )
		 ON CONFLICT DO NOTHING
		 RETURNING server_id, id`,
		userID,
	)
	if err != nil {
		slog.Error("failed to queue bulk agent update", "error", err, "user_id", userID)
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to queue agent updates")
		return
	}
	defer rows.Close()

	taskIDs := make([]string, 0)
	serverIDs := make([]string, 0)
	for rows.Next() {
		var serverID, taskID string
		if err := rows.Scan(&serverID, &taskID); err != nil {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to read queued agent updates")
			return
		}
		serverIDs = append(serverIDs, serverID)
		taskIDs = append(taskIDs, taskID)
	}
	if err := rows.Err(); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to queue all agent updates")
		return
	}

	h.recordAudit(r.Context(), userID, "QUEUE_AGENT_UPDATE_ALL", "SERVER_FLEET", userID, map[string]interface{}{
		"queued":     len(taskIDs),
		"skipped":    total - len(taskIDs),
		"server_ids": serverIDs,
		"task_ids":   taskIDs,
	})
	response.Success(w, http.StatusCreated, map[string]interface{}{
		"total":   total,
		"queued":  len(taskIDs),
		"skipped": total - len(taskIDs),
		"tasks":   taskIDs,
	})
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
		`SELECT status, COALESCE(result->>'output', result::text)
		 FROM server_tasks WHERE id = $1 AND server_id = $2`,
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
	GroupName   string   `json:"group_name"`
	Tags        []string `json:"tags"`
	Provider    string   `json:"provider"`
	Region      string   `json:"region"`
	Environment string   `json:"environment"`
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

	if err := h.svc.UpdateServerMeta(r.Context(), id, userID, req.GroupName, req.Tags, req.Provider, req.Region, req.Environment); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update server meta")
		return
	}

	h.recordAudit(r.Context(), userID, "UPDATE_META", "SERVER", id, map[string]interface{}{
		"group_name":  req.GroupName,
		"tags":        req.Tags,
		"provider":    req.Provider,
		"region":      req.Region,
		"environment": req.Environment,
	})

	response.Success(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *Handler) recordAudit(ctx context.Context, userID, action, resourceType, resourceID string, details map[string]interface{}) {
	detailsJSON, _ := json.Marshal(details)
	_, _ = h.svc.repo.db.Pool.Exec(ctx,
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, action, resourceType, resourceID, detailsJSON,
	)
}
