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
	"sync"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

const (
	minimumLogReadAgentVersion = "1.5.2"
)

type Handler struct {
	svc                   *Service
	isCloud               bool
	enableRemoteScripts   bool
	enableServiceControls bool
	enableReadOnlyLogs    bool
	netReportsMu          sync.RWMutex
	lastNetReports        map[string]*NetworkDiagnosticReport
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
	serviceIdentifierPattern   = regexp.MustCompile(`^[a-zA-Z0-9*][a-zA-Z0-9_.@:$ *\-]{0,199}$`)
)

func NewHandler(svc *Service, isCloud, enableRemoteScripts, enableServiceControls, enableReadOnlyLogs bool) *Handler {
	return &Handler{
		svc:                   svc,
		isCloud:               isCloud,
		enableRemoteScripts:   enableRemoteScripts,
		enableServiceControls: enableServiceControls,
		enableReadOnlyLogs:    enableReadOnlyLogs,
		lastNetReports:        make(map[string]*NetworkDiagnosticReport),
	}
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
		h.svc.publicURL+"/api/v1/agent/uninstall/confirm",
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
	desiredAgentVer := h.svc.GetDesiredAgentVersion()
	if strings.TrimSpace(desiredAgentVer) != "" {
		payload["target_version"] = strings.TrimSpace(desiredAgentVer)
		if h.svc.publicURL != "" {
			payload["release_base_url"] = strings.TrimRight(h.svc.publicURL, "/") + "/api/v1/agent-releases"
		} else {
			payload["release_base_url"] = h.svc.agentReleaseURL
		}
		if h.svc.agentReleaseLayout != "" {
			payload["release_layout"] = h.svc.agentReleaseLayout
		}
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
		 SET status = 'expired', result = '{"output": "Stale update task expired"}'::jsonb, completed_at = NOW(), updated_at = NOW()
		 WHERE server_id = $1
		   AND type = 'agent_update'
		   AND status = 'pending'
		   AND (expires_at <= NOW() OR created_at <= NOW() - INTERVAL '15 minutes')`,
		serverID,
	)
	_, _ = h.svc.repo.db.Pool.Exec(ctx,
		`UPDATE server_tasks
		 SET status = 'timed_out', result = '{"output": "Update task timed out"}'::jsonb, completed_at = NOW(), updated_at = NOW()
		 WHERE server_id = $1
		   AND type = 'agent_update'
		   AND status = 'processing'
		   AND started_at + make_interval(secs => timeout_seconds) <= NOW()`,
		serverID,
	)
}

func (h *Handler) CancelTask(w http.ResponseWriter, r *http.Request) {
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

	// Verify server ownership
	if _, err := h.svc.GetServer(r.Context(), serverID, userID); err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		return
	}

	taskID := strings.TrimSpace(r.PathValue("taskId"))
	if taskID != "" && taskID != "cancel-update" && taskID != "active" {
		_, err := h.svc.repo.db.Pool.Exec(r.Context(),
			`UPDATE server_tasks
			 SET status = 'cancelled', result = '{"output": "Task cancelled by administrator"}'::jsonb, completed_at = NOW(), updated_at = NOW()
			 WHERE id = $1 AND server_id = $2 AND status IN ('pending', 'processing')`,
			taskID, serverID,
		)
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to cancel task")
			return
		}
	} else {
		// Cancel any pending or processing agent_update task for this server
		_, err := h.svc.repo.db.Pool.Exec(r.Context(),
			`UPDATE server_tasks
			 SET status = 'cancelled', result = '{"output": "Update task cancelled by administrator"}'::jsonb, completed_at = NOW(), updated_at = NOW()
			 WHERE server_id = $1 AND type = 'agent_update' AND status IN ('pending', 'processing')`,
			serverID,
		)
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to cancel update task")
			return
		}
	}

	h.recordAudit(r.Context(), userID, "CANCEL_SERVER_TASK", "SERVER", serverID, map[string]interface{}{
		"task_id": taskID,
	})
	response.Success(w, http.StatusOK, map[string]string{"status": "cancelled"})
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
	if _, serviceTask := serviceTaskTypes[req.Type]; serviceTask && !h.enableServiceControls {
		response.Error(w, http.StatusForbidden, "FEATURE_DISABLED", "Service controls are disabled by the system administrator")
		return
	}
	if req.Type == "log_read" && !h.enableReadOnlyLogs {
		response.Error(w, http.StatusForbidden, "FEATURE_DISABLED", "Read-only agent logs are disabled by the system administrator")
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
	if req.Type == "log_read" {
		if err := validateAgentFeatureVersion(ownedServer, minimumLogReadAgentVersion, "Read-only Log Viewer"); err != nil {
			response.Error(w, http.StatusConflict, "AGENT_UPDATE_REQUIRED", err.Error())
			return
		}
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

func validateAgentFeatureVersion(server *Server, minimumVersion string, featureName string) error {
	currentVersion := agentVersionFromOSInfo(server.OSInfo)
	if currentVersion == "" {
		return fmt.Errorf("%s requires Agent %s or newer. This agent has not reported a running version yet", featureName, minimumVersion)
	}
	if compareVersions(currentVersion, minimumVersion) < 0 {
		return fmt.Errorf("%s requires Agent %s or newer. This agent reports version %s", featureName, minimumVersion, currentVersion)
	}
	return nil
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
	case "datrixops-agent", "datrixops-agent.service", "com.datrixops.agent", "datrixopsagent", "datrixops-self-monitor", "datrixops-self-monitor.service":
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

type logReadTaskPayload struct {
	Source      string `json:"source"`
	Unit        string `json:"unit"`
	Grep        string `json:"grep,omitempty"`
	Since       string `json:"since,omitempty"`
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
	if len(payload.Grep) > 200 {
		return fmt.Errorf("grep filter must not exceed 200 characters")
	}
	if len(payload.Since) > 60 {
		return fmt.Errorf("since filter must not exceed 60 characters")
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
	Name        string   `json:"name"`
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

	if err := h.svc.UpdateServerMeta(r.Context(), id, userID, req.Name, req.GroupName, req.Tags, req.Provider, req.Region, req.Environment); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update server meta")
		return
	}

	h.recordAudit(r.Context(), userID, "UPDATE_META", "SERVER", id, map[string]interface{}{
		"name":        req.Name,
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

// DiagnoseNetwork runs an on-demand live network diagnostic probing user-configured targets.
func (h *Handler) DiagnoseNetwork(w http.ResponseWriter, r *http.Request) {
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

	targets, err := h.svc.GetEnabledNetworkTargets(r.Context(), server.ID)
	if err != nil {
		slog.Error("failed to get network targets", "server_id", server.ID, "error", err)
	}

	diagCtx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	var snapshotRaw []byte
	if server.Snapshot != nil {
		snapshotRaw = []byte(*server.Snapshot)
	}

	report, historyResults := RunNetworkDiagnostic(diagCtx, server.ID, server.Name, snapshotRaw, targets)

	if len(historyResults) > 0 {
		if saveErr := h.svc.SaveNetworkTargetResults(r.Context(), historyResults); saveErr != nil {
			slog.Error("failed to save network target results", "server_id", server.ID, "error", saveErr)
		}
	}

	h.netReportsMu.Lock()
	if h.lastNetReports == nil {
		h.lastNetReports = make(map[string]*NetworkDiagnosticReport)
	}
	h.lastNetReports[server.ID] = report
	h.netReportsMu.Unlock()

	response.Success(w, http.StatusOK, report)
}

func (h *Handler) invalidateNetReport(agentIDs ...string) {
	h.netReportsMu.Lock()
	defer h.netReportsMu.Unlock()
	if h.lastNetReports == nil {
		return
	}
	for _, aid := range agentIDs {
		delete(h.lastNetReports, aid)
	}
}

// GetNetworkDiagnostics returns the latest network diagnostic report or generates a fresh one.
func (h *Handler) GetNetworkDiagnostics(w http.ResponseWriter, r *http.Request) {
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

	targetsWithLatest, err := h.svc.ListNetworkTargets(r.Context(), []string{server.ID}, "", "", userID)
	if err != nil {
		slog.Error("failed to list network targets with latest results", "server_id", server.ID, "error", err)
	}

	var snapshotRaw []byte
	if server.Snapshot != nil {
		snapshotRaw = []byte(*server.Snapshot)
	}

	// 1. If we have targets in DB, build report instantly from DB latest results!
	if len(targetsWithLatest) > 0 {
		report := BuildDiagnosticReportFromTargets(server.ID, server.Name, snapshotRaw, targetsWithLatest)

		// Update in-memory cache
		h.netReportsMu.Lock()
		if h.lastNetReports == nil {
			h.lastNetReports = make(map[string]*NetworkDiagnosticReport)
		}
		h.lastNetReports[server.ID] = report
		h.netReportsMu.Unlock()

		// If data is older than 2 minutes, trigger background refresh so subsequent polls get fresh metrics
		if time.Since(report.Timestamp) > 2*time.Minute {
			go func(sID, sName string, snap []byte) {
				bgCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
				defer cancel()
				enabledTargets, err := h.svc.GetEnabledNetworkTargets(bgCtx, sID)
				if err == nil && len(enabledTargets) > 0 {
					freshReport, historyResults := RunNetworkDiagnostic(bgCtx, sID, sName, snap, enabledTargets)
					if len(historyResults) > 0 {
						_ = h.svc.SaveNetworkTargetResults(bgCtx, historyResults)
					}
					h.netReportsMu.Lock()
					h.lastNetReports[sID] = freshReport
					h.netReportsMu.Unlock()
				}
			}(server.ID, server.Name, snapshotRaw)
		}

		response.Success(w, http.StatusOK, report)
		return
	}

	// 2. If no targets configured, return empty report immediately
	emptyReport := BuildDiagnosticReportFromTargets(server.ID, server.Name, snapshotRaw, nil)
	response.Success(w, http.StatusOK, emptyReport)
}

// ---------- Network Targets Handlers ----------

// ListNetworkTargets lists network targets with server ownership, cross-filtering, and latest measurement.
func (h *Handler) ListNetworkTargets(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	query := r.URL.Query()
	var agentIDs []string
	if singleAgent := strings.TrimSpace(query.Get("agent_id")); singleAgent != "" {
		agentIDs = append(agentIDs, singleAgent)
	}
	if rawAgentIDs := strings.TrimSpace(query.Get("agent_ids")); rawAgentIDs != "" {
		for _, part := range strings.Split(rawAgentIDs, ",") {
			p := strings.TrimSpace(part)
			if p != "" {
				agentIDs = append(agentIDs, p)
			}
		}
	}

	tag := strings.TrimSpace(query.Get("tag"))
	status := strings.TrimSpace(query.Get("status"))

	targets, err := h.svc.ListNetworkTargets(r.Context(), agentIDs, tag, status, userID)
	if err != nil {
		slog.Error("failed to list network targets", "error", err)
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list network targets")
		return
	}

	response.Success(w, http.StatusOK, targets)
}

// CreateNetworkTargetRequest defines the JSON payload for creating network targets.
type CreateNetworkTargetRequest struct {
	AgentID                string   `json:"agent_id"`
	AgentIDs               []string `json:"agent_ids,omitempty"`
	Name                   string   `json:"name"`
	Host                   string   `json:"host"`
	Port                   int      `json:"port"`
	Tag                    string   `json:"tag"`
	ProbeMethod            string   `json:"probe_method"`
	ProbesPerRun           int      `json:"probes_per_run"`
	AlertLatencyWarningMs  *float64 `json:"alert_latency_warning_ms,omitempty"`
	AlertLatencyCriticalMs *float64 `json:"alert_latency_critical_ms,omitempty"`
	AlertLossCriticalPct   *float64 `json:"alert_loss_critical_pct,omitempty"`
	Enabled                *bool    `json:"enabled,omitempty"`
	IsGateway              bool     `json:"is_gateway"`
}

// CreateNetworkTarget handles creating network targets for one or multiple agents (batch creation).
func (h *Handler) CreateNetworkTarget(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	var req CreateNetworkTargetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_JSON", "Invalid request body")
		return
	}

	name := strings.TrimSpace(req.Name)
	host := strings.TrimSpace(req.Host)
	if name == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Target name is required")
		return
	}
	if err := ValidateNetworkTargetHost(r.Context(), host, req.IsGateway, h.isCloud); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}
	if req.IsGateway && host == "" {
		host = "gateway"
	}

	var targetAgentIDs []string
	if len(req.AgentIDs) > 0 {
		for _, aid := range req.AgentIDs {
			trimmed := strings.TrimSpace(aid)
			if trimmed != "" {
				targetAgentIDs = append(targetAgentIDs, trimmed)
			}
		}
	} else if strings.TrimSpace(req.AgentID) != "" {
		targetAgentIDs = append(targetAgentIDs, strings.TrimSpace(req.AgentID))
	}

	if len(targetAgentIDs) == 0 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "At least one target server (agent_id) is required")
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	probes := req.ProbesPerRun
	if probes <= 0 {
		probes = ProbesPerTarget
	}

	tag := strings.TrimSpace(req.Tag)
	if tag == "" {
		tag = "default"
	}

	method := strings.ToUpper(strings.TrimSpace(req.ProbeMethod))
	if method != "TCP" {
		method = "ICMP"
	}

	// Prepare independent rows for each agent
	targetsToCreate := make([]NetworkTarget, len(targetAgentIDs))
	for i, aid := range targetAgentIDs {
		targetsToCreate[i] = NetworkTarget{
			AgentID:                aid,
			Name:                   name,
			Host:                   host,
			Port:                   req.Port,
			Tag:                    tag,
			ProbeMethod:            method,
			ProbesPerRun:           probes,
			AlertLatencyWarningMs:  req.AlertLatencyWarningMs,
			AlertLatencyCriticalMs: req.AlertLatencyCriticalMs,
			AlertLossCriticalPct:   req.AlertLossCriticalPct,
			Enabled:                enabled,
			IsGateway:              req.IsGateway,
		}
	}

	created, err := h.svc.CreateNetworkTargets(r.Context(), targetsToCreate, userID)
	if err != nil {
		slog.Error("failed to create network targets", "error", err)
		response.Error(w, http.StatusBadRequest, "CREATION_FAILED", err.Error())
		return
	}

	h.invalidateNetReport(targetAgentIDs...)

	// Trigger immediate asynchronous probe for newly created targets
	if len(created) > 0 {
		go func(targets []NetworkTarget) {
			probeCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			var results []NetworkTargetResult
			for _, t := range targets {
				_, res := ProbeSingleTarget(probeCtx, t)
				results = append(results, res)
			}
			if len(results) > 0 {
				if err := h.svc.SaveNetworkTargetResults(probeCtx, results); err != nil {
					slog.Warn("failed to save initial probe results for created targets", "error", err)
				}
			}
		}(created)
	}

	response.Success(w, http.StatusCreated, created)
}

// GetNetworkTarget returns details of a single network target.
func (h *Handler) GetNetworkTarget(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	target, err := h.svc.GetNetworkTarget(r.Context(), id, userID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Target not found")
		return
	}

	response.Success(w, http.StatusOK, target)
}

// UpdateNetworkTarget updates a user-configured target.
func (h *Handler) UpdateNetworkTarget(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	var target NetworkTarget
	if err := json.NewDecoder(r.Body).Decode(&target); err != nil {
		response.Error(w, http.StatusBadRequest, "INVALID_JSON", "Invalid request body")
		return
	}
	target.ID = id

	if strings.TrimSpace(target.Name) == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Target name is required")
		return
	}
	if err := ValidateNetworkTargetHost(r.Context(), target.Host, target.IsGateway, h.isCloud); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
		return
	}
	if target.IsGateway && strings.TrimSpace(target.Host) == "" {
		target.Host = "gateway"
	}

	if err := h.svc.UpdateNetworkTarget(r.Context(), &target, userID); err != nil {
		slog.Error("failed to update network target", "id", id, "error", err)
		response.Error(w, http.StatusBadRequest, "UPDATE_FAILED", err.Error())
		return
	}

	h.invalidateNetReport(target.AgentID)

	updated, err := h.svc.GetNetworkTarget(r.Context(), id, userID)
	if err != nil {
		response.Success(w, http.StatusOK, target)
		return
	}
	if updated != nil && updated.AgentID != "" {
		h.invalidateNetReport(updated.AgentID)
	}
	response.Success(w, http.StatusOK, updated)
}

// DeleteNetworkTarget removes a target.
func (h *Handler) DeleteNetworkTarget(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	target, _ := h.svc.GetNetworkTarget(r.Context(), id, userID)
	if err := h.svc.DeleteNetworkTarget(r.Context(), id, userID); err != nil {
		slog.Error("failed to delete network target", "id", id, "error", err)
		response.Error(w, http.StatusBadRequest, "DELETE_FAILED", err.Error())
		return
	}
	if target != nil && target.AgentID != "" {
		h.invalidateNetReport(target.AgentID)
	}

	response.Success(w, http.StatusOK, map[string]string{"message": "Network target deleted successfully"})
}

// NetworkTargetPreset represents a template suggestion for the UI.
type NetworkTargetPreset struct {
	Name                   string   `json:"name"`
	Host                   string   `json:"host"`
	Port                   int      `json:"port"`
	Tag                    string   `json:"tag"`
	ProbeMethod            string   `json:"probe_method"`
	ProbesPerRun           int      `json:"probes_per_run"`
	AlertLatencyWarningMs  *float64 `json:"alert_latency_warning_ms,omitempty"`
	AlertLatencyCriticalMs *float64 `json:"alert_latency_critical_ms,omitempty"`
	AlertLossCriticalPct   *float64 `json:"alert_loss_critical_pct,omitempty"`
	IsGateway              bool     `json:"is_gateway"`
	Description            string   `json:"description"`
}

// GetNetworkTargetPresets returns curated presets for easy form pre-filling.
func (h *Handler) GetNetworkTargetPresets(w http.ResponseWriter, r *http.Request) {
	warn25 := 25.0
	crit60 := 60.0
	warn50 := 50.0
	crit150 := 150.0
	warn80 := 80.0
	crit180 := 180.0
	warn90 := 90.0
	crit200 := 200.0
	warn20 := 20.0
	crit80 := 80.0
	loss20 := 20.0

	presets := []NetworkTargetPreset{
		{
			Name:                   "Cloudflare DNS",
			Host:                   "1.1.1.1",
			Port:                   0,
			Tag:                    "International",
			ProbeMethod:            "ICMP",
			ProbesPerRun:           5,
			AlertLatencyWarningMs:  &warn50,
			AlertLatencyCriticalMs: &crit150,
			AlertLossCriticalPct:   &loss20,
			Description:            "Anycast global DNS resolver with high availability worldwide.",
		},
		{
			Name:                   "Google DNS",
			Host:                   "8.8.8.8",
			Port:                   0,
			Tag:                    "International",
			ProbeMethod:            "ICMP",
			ProbesPerRun:           5,
			AlertLatencyWarningMs:  &warn50,
			AlertLatencyCriticalMs: &crit150,
			AlertLossCriticalPct:   &loss20,
			Description:            "Google Public DNS global anycast backbone.",
		},
		{
			Name:                   "VNPT DNS",
			Host:                   "203.162.4.190",
			Port:                   0,
			Tag:                    "Domestic",
			ProbeMethod:            "ICMP",
			ProbesPerRun:           5,
			AlertLatencyWarningMs:  &warn25,
			AlertLatencyCriticalMs: &crit60,
			AlertLossCriticalPct:   &loss20,
			Description:            "VNPT Telecom national DNS core in Vietnam.",
		},
		{
			Name:                   "Viettel DNS",
			Host:                   "203.113.131.1",
			Port:                   0,
			Tag:                    "Domestic",
			ProbeMethod:            "ICMP",
			ProbesPerRun:           5,
			AlertLatencyWarningMs:  &warn25,
			AlertLatencyCriticalMs: &crit60,
			AlertLossCriticalPct:   &loss20,
			Description:            "Viettel Telecom primary DNS gateway in Vietnam.",
		},
		{
			Name:                   "FPT DNS",
			Host:                   "210.245.24.22",
			Port:                   0,
			Tag:                    "Domestic",
			ProbeMethod:            "ICMP",
			ProbesPerRun:           5,
			AlertLatencyWarningMs:  &warn25,
			AlertLatencyCriticalMs: &crit60,
			AlertLossCriticalPct:   &loss20,
			Description:            "FPT Telecom regional DNS server in Vietnam.",
		},
		{
			Name:                   "GitHub API",
			Host:                   "api.github.com",
			Port:                   443,
			Tag:                    "International",
			ProbeMethod:            "TCP",
			ProbesPerRun:           5,
			AlertLatencyWarningMs:  &warn90,
			AlertLatencyCriticalMs: &crit200,
			Description:            "Global developer cloud endpoint measuring TCP connect time.",
		},
		{
			Name:                   "AWS APAC (Singapore)",
			Host:                   "s3.ap-southeast-1.amazonaws.com",
			Port:                   443,
			Tag:                    "International",
			ProbeMethod:            "TCP",
			ProbesPerRun:           5,
			AlertLatencyWarningMs:  &warn80,
			AlertLatencyCriticalMs: &crit180,
			Description:            "Amazon Web Services Southeast Asia regional cloud endpoint.",
		},
		{
			Name:                   "Default Gateway",
			Host:                   "gateway",
			Port:                   0,
			Tag:                    "Infrastructure",
			ProbeMethod:            "ICMP",
			ProbesPerRun:           5,
			AlertLatencyWarningMs:  &warn20,
			AlertLatencyCriticalMs: &crit80,
			AlertLossCriticalPct:   &loss20,
			IsGateway:              true,
			Description:            "First-hop physical or virtual gateway router of the server.",
		},
	}

	response.Success(w, http.StatusOK, presets)
}

// GetNetworkQualityOverview returns tag aggregated health (fleet-wide or scoped by agent_id).
func (h *Handler) GetNetworkQualityOverview(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	agentID := r.URL.Query().Get("agent_id")
	overview, err := h.svc.GetNetworkQualityOverview(r.Context(), userID, agentID)
	if err != nil {
		slog.Error("failed to get network quality overview", "agent_id", agentID, "error", err)
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to calculate network quality overview")
		return
	}

	response.Success(w, http.StatusOK, overview)
}

// GetNetworkTargetHistory returns time-series measurements for a single target.
func (h *Handler) GetNetworkTargetHistory(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	// Verify target belongs to user
	_, err := h.svc.GetNetworkTarget(r.Context(), id, userID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Target not found")
		return
	}

	query := r.URL.Query()
	var from, to time.Time
	if fStr := query.Get("from"); fStr != "" {
		if t, parseErr := time.Parse(time.RFC3339, fStr); parseErr == nil {
			from = t
		}
	}
	if tStr := query.Get("to"); tStr != "" {
		if t, parseErr := time.Parse(time.RFC3339, tStr); parseErr == nil {
			to = t
		}
	}
	limit := 150
	if lStr := query.Get("limit"); lStr != "" {
		if l, parseErr := strconv.Atoi(lStr); parseErr == nil && l > 0 && l <= 500 {
			limit = l
		}
	}

	history, err := h.svc.GetNetworkTargetHistory(r.Context(), id, from, to, limit)
	if err != nil {
		slog.Error("failed to get network target history", "target_id", id, "error", err)
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to retrieve target history")
		return
	}

	response.Success(w, http.StatusOK, history)
}

// TestNetworkTargetNow runs an on-demand probe for a single target and persists the result.
func (h *Handler) TestNetworkTargetNow(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	target, err := h.svc.GetNetworkTarget(r.Context(), id, userID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Target not found")
		return
	}

	diagCtx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	probe, res := ProbeSingleTarget(diagCtx, *target)

	// Persist the test result
	if saveErr := h.svc.SaveNetworkTargetResults(r.Context(), []NetworkTargetResult{res}); saveErr != nil {
		slog.Error("failed to save single target result", "target_id", id, "error", saveErr)
	}

	h.invalidateNetReport(target.AgentID)

	response.Success(w, http.StatusOK, map[string]any{
		"probe":  probe,
		"result": res,
	})
}

