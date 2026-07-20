package agent_api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

type Handler struct {
	db                  *database.DB
	desiredAgentVersion string
}

func NewHandler(db *database.DB, desiredAgentVersion string) *Handler {
	return &Handler{db: db, desiredAgentVersion: desiredAgentVersion}
}

type TopProcess struct {
	PID  int32   `json:"pid"`
	Name string  `json:"name"`
	CPU  float64 `json:"cpu"`
	RAM  float32 `json:"ram"`
	User string  `json:"user"`
}

type ServiceStatus struct {
	Name          string     `json:"name"`
	DisplayName   string     `json:"display_name"`
	Status        string     `json:"status"`
	SubStatus     string     `json:"sub_status,omitempty"`
	StartupType   string     `json:"startup_type,omitempty"`
	Source        string     `json:"source"`
	Description   string     `json:"description,omitempty"`
	LastCheckedAt *time.Time `json:"last_checked_at,omitempty"`
}

type SystemInfo struct {
	Kernel         string `json:"kernel"`
	Uptime         uint64 `json:"uptime"`
	PublicIP       string `json:"public_ip"`
	Virtualization string `json:"virtualization"`
}

type DockerContainer struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Image  string `json:"image"`
	State  string `json:"state"`
	Status string `json:"status"`
	CPU    string `json:"cpu"`
	RAM    string `json:"ram"`
}

type CronJob struct {
	ID       string `json:"id"`
	Source   string `json:"source"`
	Owner    string `json:"owner"`
	Schedule string `json:"schedule"`
	Command  string `json:"command"`
	Enabled  bool   `json:"enabled"`
}

type Snapshot struct {
	OSFamily              string            `json:"os_family"`
	SystemInfo            *SystemInfo       `json:"system_info,omitempty"`
	Inventory             map[string]any    `json:"inventory,omitempty"`
	CronJobs              []CronJob         `json:"cron_jobs"`
	CronDiscoveryComplete bool              `json:"cron_discovery_complete"`
	TopProcesses          []TopProcess      `json:"top_processes,omitempty"`
	Services              []ServiceStatus   `json:"services,omitempty"`
	DockerContainers      []DockerContainer `json:"docker_containers,omitempty"`
	PackageUpdate         int               `json:"package_update"`
}

type HeartbeatRequest struct {
	Version                  string    `json:"version"`
	OSFamily                 string    `json:"os_family"`
	OSName                   string    `json:"os_name"`
	CPUCores                 int       `json:"cpu_cores"`
	CPUUsage                 float64   `json:"cpu_usage"`
	MemoryTotal              uint64    `json:"memory_total"`
	MemoryUsed               uint64    `json:"memory_used"`
	NetIn                    uint64    `json:"net_in"`
	NetOut                   uint64    `json:"net_out"`
	DiskRead                 uint64    `json:"disk_read"`
	DiskWrite                uint64    `json:"disk_write"`
	DiskTotal                uint64    `json:"disk_total"`
	DiskUsed                 uint64    `json:"disk_used"`
	DiskUsage                float64   `json:"disk_usage"`
	TerminalChannelConnected bool      `json:"terminal_channel_connected"`
	TerminalChannelError     string    `json:"terminal_channel_error,omitempty"`
	Snapshot                 *Snapshot `json:"snapshot,omitempty"`
}

type ServerTask struct {
	ID             string `json:"id"`
	Type           string `json:"type"`
	Payload        string `json:"payload"` // JSON string
	TimeoutSeconds int    `json:"timeout_seconds"`
}

func (h *Handler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	// 1. Extract and validate Agent Token from header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing Authorization header")
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid Authorization header format")
		return
	}
	agentToken := parts[1]

	// 2. Parse Payload
	var req HeartbeatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	// 3. Update Server Status in Database
	// We use the agent_token directly to find the server and update it.
	// Convert OS Info to JSON string
	if req.Snapshot != nil {
		family := req.OSFamily
		if family == "" {
			family = req.Snapshot.OSFamily
		}
		req.Snapshot.Services = servicesForOS(req.OSName, family, req.Snapshot.Services)
	}
	osInfoBytes, _ := json.Marshal(req)
	osInfoStr := string(osInfoBytes)

	var snapshotStr string
	inventoryStr := "{}"
	if req.Snapshot != nil {
		snapshotBytes, _ := json.Marshal(req.Snapshot)
		snapshotStr = string(snapshotBytes)
		if req.Snapshot.Inventory != nil {
			inventoryBytes, _ := json.Marshal(req.Snapshot.Inventory)
			inventoryStr = string(inventoryBytes)
		}
	} else {
		snapshotStr = "{}"
	}
	publicIP := ""
	if req.Snapshot != nil && req.Snapshot.SystemInfo != nil {
		publicIP = strings.TrimSpace(req.Snapshot.SystemInfo.PublicIP)
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var serverID string
	err := h.db.Pool.QueryRow(ctx,
		`UPDATE servers 
		 SET status = 'online', 
		     os_info = $1, 
		     ip_address = COALESCE(NULLIF($5, ''), ip_address),
		     snapshot = CASE WHEN $3 = '{}' THEN snapshot ELSE $3::jsonb END,
		     inventory = CASE WHEN $4 = '{}' THEN inventory ELSE $4::jsonb END,
		     inventory_updated_at = CASE WHEN $4 = '{}' THEN inventory_updated_at ELSE NOW() END,
		     last_seen_at = NOW(),
		     updated_at = NOW() 
		 WHERE agent_token = $2
		 RETURNING id`,
		osInfoStr, agentToken, snapshotStr, inventoryStr, publicIP,
	).Scan(&serverID)

	if err != nil {
		if err.Error() == "no rows in result set" {
			response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid agent token")
		} else {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update server status")
		}
		return
	}

	if req.Snapshot != nil && req.Snapshot.CronDiscoveryComplete {
		_ = h.persistCronJobs(ctx, serverID, req.Snapshot.CronJobs)
	}

	// Insert into server_metrics
	_, err = h.db.Pool.Exec(ctx,
		`INSERT INTO server_metrics (server_id, cpu_usage, memory_used, memory_total, net_in, net_out, disk_read, disk_write)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		serverID, req.CPUUsage, req.MemoryUsed, req.MemoryTotal, req.NetIn, req.NetOut, req.DiskRead, req.DiskWrite,
	)
	if err != nil {
		// Just log error, don't fail heartbeat
		println("Error inserting metric:", err.Error())
	}

	updateAvailable := false
	if req.Version != "" && h.desiredAgentVersion != "" && req.Version != h.desiredAgentVersion {
		updateAvailable = true
	}

	if req.Version != "" && h.desiredAgentVersion != "" && req.Version == h.desiredAgentVersion {
		_, _ = h.db.Pool.Exec(ctx,
			`UPDATE server_tasks
			 SET status = 'completed',
			     result = jsonb_build_object('output', $2::text),
			     completed_at = NOW(),
			     updated_at = NOW()
			 WHERE server_id = $1
			   AND type = 'agent_update'
			   AND status = 'processing'`,
			serverID, "Agent heartbeat confirmed the new version: "+req.Version,
		)
	}

	// Expire tasks that were never claimed before their deadline.
	_, _ = h.db.Pool.Exec(ctx,
		`UPDATE server_tasks
		 SET status = 'expired', completed_at = NOW(), updated_at = NOW()
		 WHERE server_id = $1 AND status = 'pending' AND expires_at <= NOW()`,
		serverID,
	)
	_, _ = h.db.Pool.Exec(ctx,
		`UPDATE server_tasks
		 SET status = 'timed_out', completed_at = NOW(), updated_at = NOW()
		 WHERE server_id = $1
		   AND status = 'processing'
		   AND started_at + make_interval(secs => timeout_seconds) <= NOW()`,
		serverID,
	)

	// Atomically claim a small batch so concurrent heartbeats cannot dispatch
	// the same command twice.
	rows, err := h.db.Pool.Query(ctx,
		`WITH claimable AS (
			SELECT id
			FROM server_tasks
			WHERE server_id = $1
			  AND status = 'pending'
			  AND (expires_at IS NULL OR expires_at > NOW())
			ORDER BY created_at
			FOR UPDATE SKIP LOCKED
			LIMIT 5
		 )
		 UPDATE server_tasks AS task
		 SET status = 'processing', started_at = NOW(), updated_at = NOW()
		 FROM claimable
		 WHERE task.id = claimable.id
		 RETURNING task.id, task.type, task.payload::text, task.timeout_seconds`,
		serverID,
	)
	var tasks []ServerTask
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var t ServerTask
			if err := rows.Scan(&t.ID, &t.Type, &t.Payload, &t.TimeoutSeconds); err == nil {
				tasks = append(tasks, t)
			}
		}
	}

	if tasks == nil {
		tasks = make([]ServerTask, 0)
	}

	response.Success(w, http.StatusOK, map[string]interface{}{
		"status": "recorded",
		// Legacy agents treated update_required=true as permission to update
		// immediately. Keep it false so all releases require an approved task.
		"update_required":  false,
		"update_available": updateAvailable,
		"latest_version":   h.desiredAgentVersion,
		"tasks":            tasks,
	})
}

func servicesForOS(osName, osFamily string, services []ServiceStatus) []ServiceStatus {
	family := strings.ToLower(strings.TrimSpace(osFamily))
	name := strings.ToLower(osName)
	if family == "" {
		switch {
		case strings.Contains(name, "windows"):
			family = "windows"
		case strings.Contains(name, "darwin"), strings.Contains(name, "mac"):
			family = "macos"
		case strings.Contains(name, "linux"),
			strings.Contains(name, "ubuntu"),
			strings.Contains(name, "debian"),
			strings.Contains(name, "centos"),
			strings.Contains(name, "fedora"),
			strings.Contains(name, "alpine"):
			family = "linux"
		}
	}

	expectedSource := map[string]string{
		"linux":   "systemd",
		"macos":   "launchd",
		"darwin":  "launchd",
		"windows": "windows-scm",
	}[family]
	if expectedSource == "" {
		return services
	}

	filtered := make([]ServiceStatus, 0, len(services))
	for _, service := range services {
		// Source-less entries are the legacy Linux collector. They remain
		// compatible only when the heartbeat itself identifies as Linux.
		if service.Source == "" {
			if family == "linux" {
				filtered = append(filtered, service)
			}
			continue
		}
		if service.Source == expectedSource {
			filtered = append(filtered, service)
		}
	}
	return filtered
}

func (h *Handler) persistCronJobs(ctx context.Context, serverID string, jobs []CronJob) error {
	tx, err := h.db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`UPDATE cron_jobs SET enabled = FALSE, updated_at = NOW() WHERE server_id = $1`,
		serverID,
	); err != nil {
		return err
	}
	for _, job := range jobs {
		if _, err := tx.Exec(ctx,
			`INSERT INTO cron_jobs
				(server_id, external_id, source, owner, schedule, command, enabled, discovered_at, updated_at)
			 VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, NOW(), NOW())
			 ON CONFLICT (server_id, external_id) DO UPDATE SET
				source = EXCLUDED.source,
				owner = EXCLUDED.owner,
				schedule = EXCLUDED.schedule,
				command = EXCLUDED.command,
				enabled = EXCLUDED.enabled,
				discovered_at = NOW(),
				updated_at = NOW()`,
			serverID, job.ID, job.Source, job.Owner, job.Schedule, job.Command, job.Enabled,
		); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

type ReportTaskRequest struct {
	TaskID string `json:"task_id"`
	Status string `json:"status"` // completed, failed
	Result string `json:"result"`
}

func (h *Handler) ReportTaskResult(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing Authorization header")
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid Authorization header format")
		return
	}
	agentToken := parts[1]

	var req ReportTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}
	if req.Status != "completed" && req.Status != "failed" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Status must be completed or failed")
		return
	}

	// Verify server owns the task. Agent updates are only truly complete after
	// a later heartbeat confirms that the replacement binary is running.
	var taskID string
	err := h.db.Pool.QueryRow(r.Context(),
		`UPDATE server_tasks
		 SET status = CASE
		              WHEN server_tasks.type = 'agent_update' AND $1 = 'completed' THEN 'processing'
		              ELSE $1
		             END,
		     result = jsonb_build_object('output', $2::text),
		     completed_at = CASE
		                    WHEN server_tasks.type = 'agent_update' AND $1 = 'completed' THEN NULL
		                    ELSE NOW()
		                   END,
		     updated_at = NOW()
		 FROM servers 
		 WHERE server_tasks.id = $3
		   AND server_tasks.status = 'processing'
		   AND servers.id = server_tasks.server_id
		   AND servers.agent_token = $4
		 RETURNING server_tasks.id`,
		req.Status, req.Result, req.TaskID, agentToken,
	).Scan(&taskID)

	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Task not found or permission denied")
		return
	}

	response.Success(w, http.StatusOK, map[string]string{"status": "recorded"})
}
