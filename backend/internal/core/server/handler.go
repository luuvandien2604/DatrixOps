package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

const (
	agentReleaseBaseURL      = "https://datrixops.vandien.space/releases"
	agentUninstallConfirmURL = "https://datrixops.vandien.space/api/v1/agent/uninstall/confirm"
)

type Handler struct {
	svc *Service
}

var allowedTaskTypes = map[string]struct{}{
	"docker_start":    {},
	"docker_stop":     {},
	"docker_restart":  {},
	"docker_logs":     {},
	"service_start":   {},
	"service_stop":    {},
	"service_restart": {},
	"service_reload":  {},
	"agent_update":    {},
	"agent_restart":   {},
	"vps_reboot":      {},
	"script_run":      {},
	"log_read":        {},
}

var serviceTaskTypes = map[string]struct{}{
	"service_start":   {},
	"service_stop":    {},
	"service_restart": {},
	"service_reload":  {},
}

var (
	containerIdentifierPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$`)
	serviceIdentifierPattern   = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.@:$ -]{0,199}$`)
)

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

// Delete either queues a safe remote Linux Agent uninstall or, when
// ?force=true is explicitly supplied, removes only the database record.
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

	if r.URL.Query().Get("force") == "true" {
		if err := h.svc.ForceDeleteServer(r.Context(), id, userID); err != nil {
			response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found or force delete failed")
			return
		}
		h.recordAudit(r.Context(), userID, "FORCE_DELETE", "SERVER", id, map[string]interface{}{
			"agent_uninstalled": false,
		})
		response.Success(w, http.StatusOK, map[string]string{
			"id":     id,
			"status": "deleted",
		})
		return
	}

	result, err := h.svc.RequestAgentUninstall(
		r.Context(),
		id,
		userID,
		agentUninstallConfirmURL,
	)
	if err != nil {
		switch {
		case errors.Is(err, ErrServerNotFound):
			response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		case errors.Is(err, ErrAgentOffline):
			response.Error(w, http.StatusConflict, "AGENT_OFFLINE", "The Agent is offline. Use force delete only if the machine is no longer reachable.")
		case errors.Is(err, ErrUnsupportedAgentOS):
			response.Error(w, http.StatusConflict, "UNSUPPORTED_AGENT_OS", "Remote Agent uninstall is currently supported only on Linux.")
		case errors.Is(err, ErrAgentUninstallUnsupported):
			response.Error(w, http.StatusConflict, "AGENT_UNINSTALL_UNSUPPORTED", "Update this Linux Agent before using remote uninstall.")
		case errors.Is(err, ErrDeletionInProgress):
			response.Error(w, http.StatusConflict, "DELETION_IN_PROGRESS", "Agent uninstall is already pending or running.")
		default:
			slog.Error("failed to queue Agent uninstall", "error", err, "server_id", id)
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to queue Agent uninstall")
		}
		return
	}

	h.recordAudit(r.Context(), userID, "QUEUE_AGENT_UNINSTALL", "SERVER", id, map[string]interface{}{
		"task_id": result.TaskID,
	})
	response.Success(w, http.StatusAccepted, result)
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

func (h *Handler) normalizedTaskPayload(taskType, rawPayload string) (string, error) {
	if rawPayload == "" {
		rawPayload = "{}"
	}
	if !json.Valid([]byte(rawPayload)) {
		return "", fmt.Errorf("Payload must be valid JSON")
	}
	if taskType != "agent_update" {
		return rawPayload, nil
	}

	var payload map[string]any
	if err := json.Unmarshal([]byte(rawPayload), &payload); err != nil {
		return "", fmt.Errorf("Payload must be valid JSON")
	}
	if payload == nil {
		payload = make(map[string]any)
	}
	if strings.TrimSpace(h.svc.desiredAgentVersion) != "" {
		payload["target_version"] = strings.TrimSpace(h.svc.desiredAgentVersion)
		payload["release_base_url"] = agentReleaseBaseURL
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode update payload: %w", err)
	}
	return string(payloadBytes), nil
}

func (h *Handler) expireStaleAgentUpdateTasks(ctx context.Context, serverID string) {
	_, _ = h.svc.repo.db.Pool.Exec(ctx,
		`UPDATE server_tasks
		 SET status = 'expired', completed_at = NOW(), updated_at = NOW()
		 WHERE server_id = $1
		   AND type = 'agent_update'
		   AND status = 'pending'
		   AND expires_at <= NOW()`,
		serverID,
	)
	_, _ = h.svc.repo.db.Pool.Exec(ctx,
		`UPDATE server_tasks
		 SET status = 'timed_out', completed_at = NOW(), updated_at = NOW()
		 WHERE server_id = $1
		   AND type = 'agent_update'
		   AND status = 'processing'
		   AND started_at + make_interval(secs => timeout_seconds) <= NOW()`,
		serverID,
	)
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
	normalizedPayload, err := h.normalizedTaskPayload(req.Type, req.Payload)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}
	req.Payload = normalizedPayload
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
	ownedServer, err := h.svc.GetServer(r.Context(), serverID, userID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		return
	}
	if ownedServer.DeletionStatus == "pending" || ownedServer.DeletionStatus == "uninstalling" {
		response.Error(w, http.StatusConflict, "DELETION_IN_PROGRESS", "No new tasks can be queued while Agent uninstall is in progress")
		return
	}
	if _, isServiceTask := serviceTaskTypes[req.Type]; isServiceTask {
		if err := validateServiceTask(ownedServer, req.Type, req.Payload); err != nil {
			response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}
	}
	if req.Type == "script_run" {
		policy, err := h.svc.repo.ScriptPolicy(r.Context(), req.Payload)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}
		if err := validateScriptTask(ownedServer, policy, req.Payload); err != nil {
			response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}
		req.Payload, err = normalizedScriptTaskPayload(req.Payload, policy)
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to prepare script policy payload")
			return
		}
		req.TimeoutSeconds = policy.TimeoutSeconds
	}
	if req.Type == "log_read" {
		if err := validateLogReadTask(ownedServer, req.Payload); err != nil {
			response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}
		if req.TimeoutSeconds > 120 {
			req.TimeoutSeconds = 120
		}
	}
	if req.Type == "agent_update" {
		h.expireStaleAgentUpdateTasks(r.Context(), serverID)
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

	auditDetails := map[string]interface{}{
		"task_id": taskID,
		"type":    req.Type,
	}
	if req.Type == "script_run" {
		var payload scriptTaskPayload
		if err := json.Unmarshal([]byte(req.Payload), &payload); err == nil {
			auditDetails["script_id"] = payload.ScriptID
			auditDetails["confirmed"] = payload.Confirmed
		}
	}
	if req.Type == "log_read" {
		var payload logReadTaskPayload
		if err := json.Unmarshal([]byte(req.Payload), &payload); err == nil {
			auditDetails["source"] = payload.Source
			auditDetails["unit"] = payload.Unit
			auditDetails["container_id"] = payload.ContainerID
			auditDetails["lines"] = payload.Lines
		}
	}
	h.recordAudit(r.Context(), userID, "QUEUE_TASK", "SERVER", serverID, auditDetails)
	response.Success(w, http.StatusCreated, map[string]string{"id": taskID, "status": taskStatus})
}

func (h *Handler) ListScripts(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	server, err := h.svc.GetServer(r.Context(), r.PathValue("id"), userID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		return
	}
	scripts, err := h.svc.repo.ListScripts(r.Context(), osFamilyFromServer(server))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list scripts")
		return
	}
	response.Success(w, http.StatusOK, scripts)
}

type serviceTaskPayload struct {
	ServiceName    string `json:"service_name"`
	ServiceManager string `json:"service_manager"`
}

func validateServiceTask(server *Server, taskType, rawPayload string) error {
	var payload serviceTaskPayload
	if err := json.Unmarshal([]byte(rawPayload), &payload); err != nil {
		return fmt.Errorf("invalid service task payload")
	}
	if payload.ServiceName == "" || payload.ServiceManager == "" {
		return fmt.Errorf("service_name and service_manager are required")
	}
	switch strings.ToLower(payload.ServiceName) {
	case "datrixops-agent", "datrixops-agent.service", "com.datrixops.agent", "datrixopsagent":
		return fmt.Errorf("the DatrixOps Agent cannot control its own service")
	}
	if payload.ServiceManager != "systemd" && payload.ServiceManager != "launchd" && payload.ServiceManager != "windows-scm" {
		return fmt.Errorf("unsupported service manager")
	}
	if taskType == "service_reload" && payload.ServiceManager == "windows-scm" {
		return fmt.Errorf("Windows services do not support a generic reload action")
	}
	if server.Snapshot == nil || *server.Snapshot == "" {
		return fmt.Errorf("service inventory is unavailable for this server")
	}

	var snapshot struct {
		Services []struct {
			Name   string `json:"name"`
			Status string `json:"status"`
			Source string `json:"source"`
		} `json:"services"`
	}
	if err := json.Unmarshal([]byte(*server.Snapshot), &snapshot); err != nil {
		return fmt.Errorf("service inventory is invalid")
	}
	for _, service := range snapshot.Services {
		if service.Name != payload.ServiceName || service.Source != payload.ServiceManager {
			continue
		}
		if service.Status == "not_installed" {
			return fmt.Errorf("service is not installed")
		}
		return nil
	}
	return fmt.Errorf("service is not present in the agent-reported inventory")
}

type scriptTaskPayload struct {
	ScriptID         string `json:"script_id"`
	Confirmed        bool   `json:"confirmed"`
	OutputLimitBytes string `json:"output_limit_bytes,omitempty"`
}

func validateScriptTask(server *Server, policy ScriptPolicy, rawPayload string) error {
	var payload scriptTaskPayload
	if err := json.Unmarshal([]byte(rawPayload), &payload); err != nil {
		return fmt.Errorf("invalid script task payload")
	}
	if strings.TrimSpace(payload.ScriptID) == "" {
		return fmt.Errorf("script_id is required")
	}
	if policy.RequiresConfirmation && !payload.Confirmed {
		return fmt.Errorf("script requires explicit confirmation")
	}
	if osFamilyFromServer(server) != policy.OSFamily {
		return fmt.Errorf("script is not available for this operating system")
	}
	return nil
}

func normalizedScriptTaskPayload(rawPayload string, policy ScriptPolicy) (string, error) {
	var payload scriptTaskPayload
	if err := json.Unmarshal([]byte(rawPayload), &payload); err != nil {
		return "", fmt.Errorf("invalid script task payload")
	}
	payload.ScriptID = strings.TrimSpace(payload.ScriptID)
	payload.OutputLimitBytes = strconv.Itoa(policy.OutputLimitBytes)
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode script task payload: %w", err)
	}
	return string(payloadBytes), nil
}

type logReadTaskPayload struct {
	Source      string `json:"source"`
	Unit        string `json:"unit"`
	ContainerID string `json:"container_id"`
	Lines       string `json:"lines"`
}

func validateLogReadTask(server *Server, rawPayload string) error {
	if osFamilyFromServer(server) != "linux" {
		return fmt.Errorf("read-only log viewer is currently supported only on Linux agents")
	}
	var payload logReadTaskPayload
	if err := json.Unmarshal([]byte(rawPayload), &payload); err != nil {
		return fmt.Errorf("invalid log task payload")
	}
	switch payload.Source {
	case "journal", "nginx_access", "nginx_error", "mysql_error", "docker":
	default:
		return fmt.Errorf("unsupported log source")
	}
	if payload.Source == "journal" && strings.TrimSpace(payload.Unit) != "" && !serviceIdentifierPattern.MatchString(payload.Unit) {
		return fmt.Errorf("invalid journal unit")
	}
	if payload.Source == "docker" {
		containerID := strings.TrimSpace(payload.ContainerID)
		if containerID == "" {
			return fmt.Errorf("container_id is required for Docker logs")
		}
		if !containerIdentifierPattern.MatchString(containerID) {
			return fmt.Errorf("invalid container_id")
		}
	}
	lines, err := strconv.Atoi(strings.TrimSpace(payload.Lines))
	if err != nil || lines < 1 || lines > 500 {
		return fmt.Errorf("lines must be between 1 and 500")
	}
	return nil
}

func osFamilyFromServer(server *Server) string {
	if server == nil || server.OSInfo == nil {
		return "unknown"
	}
	var payload struct {
		OSFamily string `json:"os_family"`
		OSName   string `json:"os_name"`
	}
	if err := json.Unmarshal([]byte(*server.OSInfo), &payload); err != nil {
		return "unknown"
	}
	family := strings.ToLower(strings.TrimSpace(payload.OSFamily))
	if family != "" {
		return family
	}
	name := strings.ToLower(payload.OSName)
	if strings.Contains(name, "windows") {
		return "windows"
	}
	if strings.Contains(name, "darwin") || strings.Contains(name, "mac") {
		return "macos"
	}
	if strings.Contains(name, "linux") || strings.Contains(name, "ubuntu") || strings.Contains(name, "debian") {
		return "linux"
	}
	return "unknown"
}

func (h *Handler) UpdateAllAgents(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	servers, err := h.svc.ListServers(r.Context(), userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list agents")
		return
	}

	taskIDs := make([]string, 0)
	serverIDs := make([]string, 0)
	for _, server := range servers {
		if server.DeletionStatus == "pending" || server.DeletionStatus == "uninstalling" {
			continue
		}
		if !server.UpdateAvailable {
			continue
		}
		h.expireStaleAgentUpdateTasks(r.Context(), server.ID)
		payload, err := h.normalizedTaskPayload("agent_update", "{}")
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to prepare update payload")
			return
		}
		var taskID string
		err = h.svc.repo.db.Pool.QueryRow(r.Context(),
			`WITH inserted AS (
				INSERT INTO server_tasks
					(server_id, type, payload, requested_by, timeout_seconds, expires_at)
				 VALUES ($1, 'agent_update', $3::jsonb, $2, 300, NOW() + INTERVAL '24 hours')
				 ON CONFLICT DO NOTHING
				 RETURNING id
			 )
			 SELECT id FROM inserted
			 UNION
			 SELECT existing.id
			 FROM server_tasks AS existing
			 WHERE existing.server_id = $1
			   AND existing.type = 'agent_update'
			   AND existing.status IN ('pending', 'processing')
			 LIMIT 1`,
			server.ID, userID, payload,
		).Scan(&taskID)
		if err != nil {
			slog.Error("failed to queue agent update", "error", err, "server_id", server.ID)
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to queue agent updates")
			return
		}
		serverIDs = append(serverIDs, server.ID)
		taskIDs = append(taskIDs, taskID)
	}

	h.recordAudit(r.Context(), userID, "QUEUE_AGENT_UPDATE_ALL", "SERVER_FLEET", userID, map[string]interface{}{
		"queued":     len(taskIDs),
		"skipped":    len(servers) - len(taskIDs),
		"server_ids": serverIDs,
		"task_ids":   taskIDs,
	})
	response.Success(w, http.StatusCreated, map[string]interface{}{
		"total":   len(servers),
		"queued":  len(taskIDs),
		"skipped": len(servers) - len(taskIDs),
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

type UpdateAgentUpdatePolicyRequest struct {
	Enabled *bool `json:"enabled"`
}

func (h *Handler) UpdateAgentUpdatePolicy(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	var req UpdateAgentUpdatePolicyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Enabled == nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "enabled must be a boolean")
		return
	}

	serverID := r.PathValue("id")
	if *req.Enabled {
		server, err := h.svc.GetServer(r.Context(), serverID, userID)
		if err != nil {
			response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
			return
		}
		currentVersion := agentVersionFromOSInfo(server.OSInfo)
		if currentVersion == "" || compareVersions(currentVersion, "1.3.0") < 0 {
			response.Error(w, http.StatusConflict, "AGENT_UPDATE_REQUIRED", "Agent 1.3.0 or newer is required for automatic updates")
			return
		}
	}
	if err := h.svc.SetAgentAutoUpdate(r.Context(), serverID, userID, *req.Enabled); err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		return
	}

	h.recordAudit(r.Context(), userID, "UPDATE_AGENT_AUTO_UPDATE_POLICY", "SERVER", serverID, map[string]interface{}{
		"enabled": *req.Enabled,
	})
	response.Success(w, http.StatusOK, map[string]bool{"enabled": *req.Enabled})
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
