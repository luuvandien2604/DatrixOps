package agent_api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/server"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/auditlog"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
	"github.com/luuvandien2604/DatrixOps/backend/internal/scheduler"
)

const (
	minimumAutomaticUpdateVersion = "1.3.0"
)

type Handler struct {
	db                  *database.DB
	desiredAgentVersion string
	agentReleaseURL     string
	agentReleaseLayout  string
}

func NewHandler(db *database.DB, desiredAgentVersion, agentReleaseURL, agentReleaseLayout string) *Handler {
	return &Handler{
		db:                  db,
		desiredAgentVersion: desiredAgentVersion,
		agentReleaseURL:     strings.TrimRight(strings.TrimSpace(agentReleaseURL), "/"),
		agentReleaseLayout:  strings.TrimSpace(agentReleaseLayout),
	}
}

func (h *Handler) GetDesiredAgentVersion() string {
	latestOnline := scheduler.GetLatestAgentVersion()
	if latestOnline != "" && compareAgentVersions(latestOnline, h.desiredAgentVersion) >= 0 {
		return latestOnline
	}
	return h.desiredAgentVersion
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
	ID         string     `json:"id"`
	Source     string     `json:"source"`
	Owner      string     `json:"owner"`
	Schedule   string     `json:"schedule"`
	Command    string     `json:"command"`
	Enabled    bool       `json:"enabled"`
	LastRunAt  *time.Time `json:"last_run_at,omitempty"`
	NextRunAt  *time.Time `json:"next_run_at,omitempty"`
	LastStatus string     `json:"last_status,omitempty"`
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
	Version                   string    `json:"version"`
	OSFamily                  string    `json:"os_family"`
	OSName                    string    `json:"os_name"`
	CPUCores                  int       `json:"cpu_cores"`
	CPUUsage                  float64   `json:"cpu_usage"`
	MemoryTotal               uint64    `json:"memory_total"`
	MemoryUsed                uint64    `json:"memory_used"`
	NetIn                     uint64    `json:"net_in"`
	NetOut                    uint64    `json:"net_out"`
	DiskRead                  uint64    `json:"disk_read"`
	DiskWrite                 uint64    `json:"disk_write"`
	DiskTotal                 uint64    `json:"disk_total"`
	DiskUsed                  uint64    `json:"disk_used"`
	DiskUsage                 float64   `json:"disk_usage"`
	TerminalChannelConnected  bool      `json:"terminal_channel_connected"`
	TerminalChannelError      string    `json:"terminal_channel_error,omitempty"`
	TerminalSupported         *bool     `json:"terminal_supported,omitempty"`
	TerminalUnsupportedReason string    `json:"terminal_unsupported_reason,omitempty"`
	RemoteUninstallSupported  bool      `json:"remote_uninstall_supported"`
	Snapshot                  *Snapshot `json:"snapshot,omitempty"`
}

type ServerTask struct {
	ID             string `json:"id"`
	Type           string `json:"type"`
	Payload        string `json:"payload"` // JSON string
	TimeoutSeconds int    `json:"timeout_seconds"`
}

type EnrollmentRequest struct {
	Token        string `json:"token"`
	Hostname     string `json:"hostname"`
	OSFamily     string `json:"os_family"`
	OSName       string `json:"os_name"`
	Architecture string `json:"architecture"`
	Version      string `json:"version"`
}

func agentTokenFromRequest(r *http.Request) (string, bool) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return "", false
	}
	parts := strings.Fields(authHeader)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return "", false
	}
	token := strings.TrimSpace(parts[1])
	return token, token != ""
}

func hashAgentCredential(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Enroll exchanges a short-lived, one-time enrollment token for a permanent
// per-Agent credential. Only the credential hash is persisted.
func (h *Handler) Enroll(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var req EnrollmentRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid enrollment request")
		return
	}

	req.Token = strings.TrimSpace(req.Token)
	req.Hostname = strings.TrimSpace(req.Hostname)
	req.OSFamily = strings.ToLower(strings.TrimSpace(req.OSFamily))
	req.OSName = strings.TrimSpace(req.OSName)
	req.Architecture = strings.ToLower(strings.TrimSpace(req.Architecture))
	req.Version = strings.TrimSpace(req.Version)
	if req.Token == "" || len(req.Token) > 256 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "A valid enrollment token is required")
		return
	}
	if len(req.Hostname) > 255 || len(req.OSFamily) > 40 || len(req.OSName) > 255 || len(req.Architecture) > 80 || len(req.Version) > 80 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Enrollment metadata is too long")
		return
	}

	rawCredentialBytes := make([]byte, 32)
	if _, err := rand.Read(rawCredentialBytes); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to generate Agent credential")
		return
	}
	rawCredential := base64.RawURLEncoding.EncodeToString(rawCredentialBytes)
	credentialHash := hashAgentCredential(rawCredential)

	rawRollbackBytes := make([]byte, 32)
	if _, err := rand.Read(rawRollbackBytes); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to generate Agent rollback credential")
		return
	}
	rawRollbackToken := base64.RawURLEncoding.EncodeToString(rawRollbackBytes)
	rollbackHash := hashAgentCredential(rawRollbackToken)

	enrollmentHash := hashAgentCredential(req.Token)

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to start enrollment")
		return
	}
	defer tx.Rollback(r.Context())

	var serverID string
	err = tx.QueryRow(r.Context(),
		`SELECT id
		 FROM servers
		 WHERE enrollment_token_hash = $1
		   AND enrollment_used_at IS NULL
		   AND enrollment_token_expires_at > NOW()
		   AND COALESCE(deletion_status, 'active') = 'active'
		 FOR UPDATE`,
		enrollmentHash,
	).Scan(&serverID)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "INVALID_ENROLLMENT_TOKEN", "Enrollment token is invalid, expired, or already used")
		return
	}

	_, err = tx.Exec(r.Context(),
		`UPDATE servers
		 SET agent_token = NULL,
		     agent_token_hash = $2,
		     bootstrap_rollback_token_hash = $8,
		     bootstrap_rollback_expires_at = NOW() + INTERVAL '5 minutes',
		     bootstrap_completed_at = NULL,
		     enrollment_used_at = NOW(),
		     enrolled_at = NOW(),
		     hostname = NULLIF($3, ''),
		     architecture = NULLIF($4, ''),
		     updated_at = NOW(),
		     os_info = COALESCE(os_info, '{}'::jsonb) || jsonb_build_object(
		         'version', $5::text,
		         'os_family', $6::text,
		         'os_name', $7::text,
		         'architecture', $4::text
		     )
		 WHERE id = $1`,
		serverID, credentialHash, req.Hostname, req.Architecture, req.Version, req.OSFamily, req.OSName, rollbackHash,
	)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to activate Agent credential")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		response.Error(w, http.StatusConflict, "ENROLLMENT_CONFLICT", "Enrollment token was already consumed")
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	response.Success(w, http.StatusCreated, map[string]string{
		"server_id":                serverID,
		"agent_token":              rawCredential,
		"bootstrap_rollback_token": rawRollbackToken,
	})
}

type EnrollmentRollbackRequest struct {
	RollbackToken string `json:"rollback_token"`
	ServerID      string `json:"server_id,omitempty"`
}

// EnrollRollback invalidates a freshly enrolled Agent credential and reactivates
// the original enrollment token IF and ONLY IF the short-lived rollback token
// is valid, unexpired, and the server has not completed its first heartbeat.
func (h *Handler) EnrollRollback(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var req EnrollmentRollbackRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid rollback request")
		return
	}

	req.RollbackToken = strings.TrimSpace(req.RollbackToken)
	req.ServerID = strings.TrimSpace(req.ServerID)
	if req.RollbackToken == "" || len(req.RollbackToken) > 256 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "A valid rollback token is required")
		return
	}
	if len(req.ServerID) > 256 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "server_id is too long")
		return
	}

	rollbackHash := hashAgentCredential(req.RollbackToken)

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to start enrollment rollback")
		return
	}
	defer tx.Rollback(r.Context())

	var targetServerID string
	err = tx.QueryRow(r.Context(),
		`SELECT id
		 FROM servers
		 WHERE bootstrap_rollback_token_hash = $1
		   AND bootstrap_rollback_expires_at > NOW()
		   AND bootstrap_completed_at IS NULL
		   AND (NULLIF($2, '') IS NULL OR id = $2)
		   AND COALESCE(deletion_status, 'active') = 'active'
		 FOR UPDATE`,
		rollbackHash, req.ServerID,
	).Scan(&targetServerID)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "INVALID_ROLLBACK_TOKEN", "Rollback token is invalid, expired, or bootstrap is already completed")
		return
	}

	_, err = tx.Exec(r.Context(),
		`UPDATE servers
		 SET agent_token = NULL,
		     agent_token_hash = NULL,
		     enrollment_used_at = NULL,
		     enrolled_at = NULL,
		     hostname = NULL,
		     architecture = NULL,
		     os_info = '{}'::jsonb,
		     bootstrap_rollback_token_hash = NULL,
		     bootstrap_rollback_expires_at = NULL,
		     updated_at = NOW()
		 WHERE id = $1`,
		targetServerID,
	)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to release enrollment token")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		response.Error(w, http.StatusConflict, "ROLLBACK_CONFLICT", "Enrollment rollback could not be completed")
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}

// GetBootstrapStatus queries the current bootstrap completion state using the
// short-lived bootstrap rollback credential or an authenticated Agent credential.
func (h *Handler) GetBootstrapStatus(w http.ResponseWriter, r *http.Request) {
	token, ok := agentTokenFromRequest(r)
	if !ok {
		token = strings.TrimSpace(r.URL.Query().Get("token"))
	}
	token = strings.TrimSpace(token)
	if token == "" || len(token) > 256 {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "A valid bootstrap rollback token is required")
		return
	}

	tokenHash := hashAgentCredential(token)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var serverID string
	var bootstrapCompleted bool
	err := h.db.Pool.QueryRow(ctx,
		`SELECT id, (bootstrap_completed_at IS NOT NULL) AS bootstrap_completed
		 FROM servers
		 WHERE agent_token_hash = $1
		    OR bootstrap_rollback_token_hash = $1`,
		tokenHash,
	).Scan(&serverID, &bootstrapCompleted)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.Error(w, http.StatusNotFound, "NOT_FOUND", "Bootstrap token record not found or expired")
		} else {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to query bootstrap status")
		}
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	statusStr := "pending"
	if bootstrapCompleted {
		statusStr = "completed"
	}
	response.Success(w, http.StatusOK, map[string]any{
		"status":              statusStr,
		"bootstrap_completed": bootstrapCompleted,
		"server_id":           serverID,
	})
}

func (h *Handler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	// 1. Extract and validate Agent Token from header
	agentToken, ok := agentTokenFromRequest(r)
	if !ok {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid Authorization header format")
		return
	}

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
	agentTokenHash := hashAgentCredential(agentToken)

	var serverID, userID, serverName string
	err := h.db.Pool.QueryRow(ctx,
		`UPDATE servers 
		 SET status = 'online', 
		     os_info = $1, 
		     ip_address = COALESCE(NULLIF($5, ''), ip_address),
		     snapshot = CASE WHEN $3 = '{}' THEN snapshot ELSE $3::jsonb END,
		     inventory = CASE WHEN $4 = '{}' THEN inventory ELSE $4::jsonb END,
		     inventory_updated_at = CASE WHEN $4 = '{}' THEN inventory_updated_at ELSE NOW() END,
		     bootstrap_completed_at = COALESCE(bootstrap_completed_at, NOW()),
		     bootstrap_rollback_token_hash = NULL,
		     bootstrap_rollback_expires_at = NULL,
		     last_seen_at = NOW(),
		     updated_at = NOW() 
		 WHERE agent_token = $2 OR agent_token_hash = $6
		 RETURNING id, user_id, name`,
		osInfoStr, agentToken, snapshotStr, inventoryStr, publicIP, agentTokenHash,
	).Scan(&serverID, &userID, &serverName)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || err.Error() == "no rows in result set" {
			// Check if this heartbeat credential belongs to the host self-monitor
			if server.CheckSelfMonitorToken(agentToken) {
				_ = server.SyncSelfHost(ctx, h.db, nil)
				// Re-attempt server status update with synchronized credential
				err = h.db.Pool.QueryRow(ctx,
					`UPDATE servers 
					 SET status = 'online', 
					     os_info = $1, 
					     ip_address = COALESCE(NULLIF($5, ''), ip_address),
					     snapshot = CASE WHEN $3 = '{}' THEN snapshot ELSE $3::jsonb END,
					     inventory = CASE WHEN $4 = '{}' THEN inventory ELSE $4::jsonb END,
					     inventory_updated_at = CASE WHEN $4 = '{}' THEN inventory_updated_at ELSE NOW() END,
					     bootstrap_completed_at = COALESCE(bootstrap_completed_at, NOW()),
					     bootstrap_rollback_token_hash = NULL,
					     bootstrap_rollback_expires_at = NULL,
					     last_seen_at = NOW(),
					     updated_at = NOW() 
					 WHERE agent_token = $2 OR agent_token_hash = $6
					 RETURNING id, user_id, name`,
					osInfoStr, agentToken, snapshotStr, inventoryStr, publicIP, agentTokenHash,
				).Scan(&serverID, &userID, &serverName)
			}
		}

		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) || err.Error() == "no rows in result set" {
				response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid agent token")
			} else {
				response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update server status")
			}
			return
		}
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

	desiredVer := h.GetDesiredAgentVersion()
	updateAvailable := req.Version != "" &&
		desiredVer != "" &&
		compareAgentVersions(req.Version, desiredVer) < 0

	if req.Version != "" &&
		desiredVer != "" &&
		compareAgentVersions(req.Version, desiredVer) == 0 {
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

	// Auto-update remains a normal signed agent_update task. The Agent never
	// updates merely because update_available=true, and a failed release is
	// rate-limited so heartbeats cannot create an endless retry loop.
	if updateAvailable && compareAgentVersions(req.Version, minimumAutomaticUpdateVersion) >= 0 {
		payload, payloadErr := json.Marshal(map[string]string{
			"target_version":   strings.TrimSpace(desiredVer),
			"release_base_url": h.agentReleaseURL,
			"release_layout":   h.agentReleaseLayout,
			"trigger":          "automatic",
		})
		if payloadErr == nil {
			if _, queueErr := h.db.Pool.Exec(ctx,
				`INSERT INTO server_tasks
					(server_id, type, payload, timeout_seconds, expires_at)
				 SELECT servers.id, 'agent_update', $2::jsonb, 300, NOW() + INTERVAL '24 hours'
				 FROM servers
				 WHERE servers.id = $1
				   AND servers.auto_update_agent = TRUE
				   AND COALESCE(servers.deletion_status, 'active') = 'active'
				   AND NOT EXISTS (
				       SELECT 1
				       FROM server_tasks recent
				       WHERE recent.server_id = servers.id
				         AND recent.type = 'agent_update'
				         AND (
				             recent.status IN ('pending', 'processing')
				             OR (
				                 recent.payload->>'target_version' = $3
				                 AND recent.created_at >= NOW() - INTERVAL '1 hour'
				             )
				         )
				   )
				 ON CONFLICT DO NOTHING`,
				serverID, string(payload), strings.TrimSpace(h.desiredAgentVersion),
			); queueErr != nil {
				println("Error queueing automatic Agent update:", queueErr.Error())
			}
		}
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
			ORDER BY CASE WHEN type = 'agent_uninstall' THEN 0 ELSE 1 END, created_at
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
		"latest_version":   h.GetDesiredAgentVersion(),
		"tasks":            tasks,
	})
}

func compareAgentVersions(left, right string) int {
	leftParts := agentVersionParts(left)
	rightParts := agentVersionParts(right)
	length := len(leftParts)
	if len(rightParts) > length {
		length = len(rightParts)
	}
	for index := 0; index < length; index++ {
		var leftPart, rightPart int
		if index < len(leftParts) {
			leftPart = leftParts[index]
		}
		if index < len(rightParts) {
			rightPart = rightParts[index]
		}
		if leftPart < rightPart {
			return -1
		}
		if leftPart > rightPart {
			return 1
		}
	}
	return 0
}

func agentVersionParts(version string) []int {
	core := strings.Split(strings.TrimSpace(version), "-")[0]
	core = strings.Split(core, "+")[0]
	rawParts := strings.Split(core, ".")
	parts := make([]int, 0, len(rawParts))
	for _, rawPart := range rawParts {
		value, err := strconv.Atoi(rawPart)
		if err != nil {
			value = 0
		}
		parts = append(parts, value)
	}
	return parts
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

type ReportTaskRequest struct {
	TaskID string `json:"task_id"`
	Status string `json:"status"` // completed, failed
	Result string `json:"result"`
}

// ReportTaskResult records an Agent task result. Agent updates remain in
// processing until a new-version heartbeat arrives. Agent uninstall completion
// moves the server into uninstalling while the detached helper removes files.
func (h *Handler) ReportTaskResult(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 512<<10)
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing Authorization header")
		return
	}

	parts := strings.Fields(authHeader)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid Authorization header format")
		return
	}
	agentToken := parts[1]
	agentTokenHash := hashAgentCredential(agentToken)

	var req ReportTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}
	if req.Status != "completed" && req.Status != "failed" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Status must be completed or failed")
		return
	}

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to begin task result transaction")
		return
	}
	defer tx.Rollback(r.Context())

	var taskID, taskType, serverID, userID, serverName string
	err = tx.QueryRow(r.Context(),
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
		   AND (servers.agent_token = $4 OR servers.agent_token_hash = $5)
		 RETURNING server_tasks.id, server_tasks.type, server_tasks.server_id, servers.user_id, servers.name`,
		req.Status, req.Result, req.TaskID, agentToken, agentTokenHash,
	).Scan(&taskID, &taskType, &serverID, &userID, &serverName)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Task not found or permission denied")
		return
	}

	if taskType == "agent_uninstall" {
		if req.Status == "completed" {
			_, err = tx.Exec(r.Context(),
				`UPDATE servers
				 SET deletion_status = 'uninstalling',
				     deletion_error = NULL,
				     updated_at = NOW()
				 WHERE id = $1`,
				serverID,
			)
		} else {
			_, err = tx.Exec(r.Context(),
				`UPDATE servers
				 SET deletion_status = 'failed',
				     deletion_error = $2,
				     uninstall_token_hash = NULL,
				     uninstall_token_expires_at = NULL,
				     updated_at = NOW()
				 WHERE id = $1`,
				serverID, req.Result,
			)
		}
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update Agent uninstall state")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to commit task result")
		return
	}
	if taskType == "log_read" {
		auditlog.Record(r.Context(), h.db, userID, "COMPLETE_LOG_READ", "SERVER", serverID, map[string]any{
			"task_id":      taskID,
			"task_type":    taskType,
			"status":       req.Status,
			"server_name":  serverName,
			"output_bytes": len(req.Result),
		})
	}

	response.Success(w, http.StatusOK, map[string]string{"status": "recorded", "task_id": taskID})
}

// ConfirmUninstallRequest is sent by the detached helper after the Agent
// service and binary have been removed or when cleanup fails.
type ConfirmUninstallRequest struct {
	ServerID string `json:"server_id"`
	TaskID   string `json:"task_id"`
	Token    string `json:"token"`
	Status   string `json:"status"`
	Error    string `json:"error"`
}

// ConfirmUninstall validates the one-time token and then hard-deletes the
// server on success. On failure it preserves the record for operator recovery.
func (h *Handler) ConfirmUninstall(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	var req ConfirmUninstallRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}
	if strings.TrimSpace(req.ServerID) == "" || strings.TrimSpace(req.TaskID) == "" || strings.TrimSpace(req.Token) == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "server_id, task_id, and token are required")
		return
	}
	if req.Status != "completed" && req.Status != "failed" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Status must be completed or failed")
		return
	}

	tokenSum := sha256.Sum256([]byte(req.Token))
	tokenHash := hex.EncodeToString(tokenSum[:])

	tx, err := h.db.Pool.Begin(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to begin uninstall confirmation")
		return
	}
	defer tx.Rollback(r.Context())

	var serverID string
	err = tx.QueryRow(r.Context(),
		`SELECT servers.id
		 FROM servers
		 JOIN server_tasks ON server_tasks.server_id = servers.id
		 WHERE servers.id = $1
		   AND server_tasks.id = $2
		   AND server_tasks.type = 'agent_uninstall'
		   AND servers.uninstall_token_hash = $3
		   AND servers.uninstall_token_expires_at > NOW()
		   AND servers.deletion_status IN ('pending', 'uninstalling')
		 FOR UPDATE`,
		req.ServerID, req.TaskID, tokenHash,
	).Scan(&serverID)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "INVALID_UNINSTALL_TOKEN", "Uninstall confirmation is invalid or expired")
		return
	}

	if req.Status == "completed" {
		if _, err := tx.Exec(r.Context(), `DELETE FROM servers WHERE id = $1`, serverID); err != nil {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to delete confirmed server")
			return
		}
	} else {
		if _, err := tx.Exec(r.Context(),
			`UPDATE servers
			 SET deletion_status = 'failed',
			     deletion_error = NULLIF($2, ''),
			     uninstall_token_hash = NULL,
			     uninstall_token_expires_at = NULL,
			     updated_at = NOW()
			 WHERE id = $1`,
			serverID, req.Error,
		); err != nil {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to record uninstall failure")
			return
		}
		_, _ = tx.Exec(r.Context(),
			`UPDATE server_tasks
			 SET status = 'failed',
			     result = jsonb_build_object('output', $2::text),
			     completed_at = NOW(),
			     updated_at = NOW()
			 WHERE id = $1`,
			req.TaskID, req.Error,
		)
	}

	if err := tx.Commit(r.Context()); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to commit uninstall confirmation")
		return
	}
	response.Success(w, http.StatusOK, map[string]string{"status": req.Status})
}

var releaseFilenamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$`)

// ServeAgentRelease chuyển tiếp các yêu cầu tải manifest, chữ ký và binary của agent
// tới GitHub Releases tương ứng, đảm bảo tương thích 100% với agent mọi phiên bản.
func (h *Handler) ServeAgentRelease(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(r.PathValue("path"), "/")
	if path == "" {
		http.NotFound(w, r)
		return
	}

	parts := strings.Split(path, "/")
	filename := parts[len(parts)-1]
	if !releaseFilenamePattern.MatchString(filename) || filename == "." || filename == ".." {
		http.NotFound(w, r)
		return
	}

	version := h.GetDesiredAgentVersion()
	if version == "" {
		version = "1.5.10"
	}

	for _, p := range parts {
		cleaned := strings.TrimPrefix(strings.TrimSpace(p), "agent-v")
		cleaned = strings.TrimPrefix(cleaned, "v")
		subParts := strings.Split(cleaned, ".")
		if len(subParts) == 3 {
			version = cleaned
			break
		}
	}

	tag := "agent-v" + strings.TrimPrefix(strings.TrimPrefix(version, "agent-v"), "v")
	targetURL := "https://github.com/luuvandien2604/DatrixOps/releases/download/" + tag + "/" + filename
	http.Redirect(w, r, targetURL, http.StatusFound)
}
