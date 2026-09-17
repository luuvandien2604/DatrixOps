package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

type availabilityEntry struct {
	availabilityPct float64
	downtimeSeconds int64
	cachedAt        time.Time
}

type Repository struct {
	db                *database.DB
	availMu           sync.RWMutex
	availabilityCache map[string]availabilityEntry
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{
		db:                db,
		availabilityCache: make(map[string]availabilityEntry),
	}
}

type Server struct {
	ID                    string           `json:"id"`
	UserID                string           `json:"user_id"`
	Name                  string           `json:"name"`
	IPAddress             *string          `json:"ip_address,omitempty"`
	GroupName             *string          `json:"group_name,omitempty"`
	Tags                  []string         `json:"tags"`
	AgentToken            string           `json:"agent_token,omitempty"` // only shown on creation
	EnrollmentToken       string           `json:"enrollment_token,omitempty"`
	EnrollmentExpiresAt   *time.Time       `json:"enrollment_expires_at,omitempty"`
	LatestAgentVersion    string           `json:"latest_agent_version"`
	UpdateAvailable       bool             `json:"update_available"`
	AutoUpdateAgent       bool             `json:"auto_update_agent"`
	ActiveAgentUpdateTask *AgentUpdateTask `json:"active_agent_update_task,omitempty"`
	Status                string           `json:"status"`
	OSInfo                *string          `json:"os_info,omitempty"`  // JSON raw message or string
	Snapshot              *string          `json:"snapshot,omitempty"` // JSONB raw message
	Inventory             *string          `json:"inventory,omitempty"`
	InventoryUpdatedAt    *time.Time       `json:"inventory_updated_at,omitempty"`
	Provider              *string          `json:"provider,omitempty"`
	Region                *string          `json:"region,omitempty"`
	Environment           *string          `json:"environment,omitempty"`
	LastSeenAt            *time.Time       `json:"last_seen_at,omitempty"`
	Availability30d       float64          `json:"availability_30d"`
	DowntimeSeconds30d    int64            `json:"downtime_seconds_30d"`
	DeletionStatus        string           `json:"deletion_status"`
	DeletionRequestedAt   *time.Time       `json:"deletion_requested_at,omitempty"`
	DeletionError         *string          `json:"deletion_error,omitempty"`
	CreatedAt             time.Time        `json:"created_at"`
	UpdatedAt             time.Time        `json:"updated_at"`
}

type AgentUpdateTask struct {
	ID          string     `json:"id"`
	Status      string     `json:"status"`
	Result      *string    `json:"result,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

type ServerMetric struct {
	ID            string    `json:"id"`
	ServerID      string    `json:"server_id"`
	BucketSeconds int       `json:"bucket_seconds,omitempty"`
	CPUUsage      float64   `json:"cpu_usage"`
	MemoryUsed    uint64    `json:"memory_used"`
	MemoryTotal   uint64    `json:"memory_total"`
	NetIn         uint64    `json:"net_in"`
	NetOut        uint64    `json:"net_out"`
	DiskRead      uint64    `json:"disk_read"`
	DiskWrite     uint64    `json:"disk_write"`
	CreatedAt     time.Time `json:"created_at"`
}

// DashboardServer is a server enriched with the latest metric received from its agent.
// HasMetrics distinguishes a real zero value from a server that has never reported data.
type DashboardServer struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	IPAddress   *string    `json:"ip_address,omitempty"`
	Status      string     `json:"status"`
	CPUUsage    float64    `json:"cpu_usage"`
	MemoryUsed  int64      `json:"memory_used"`
	MemoryTotal int64      `json:"memory_total"`
	HasMetrics  bool       `json:"has_metrics"`
	LastSeenAt  *time.Time `json:"last_seen_at,omitempty"`
}

type DashboardMetric struct {
	BucketTime  time.Time `json:"bucket_time"`
	CPUUsage    float64   `json:"cpu_usage"`
	MemoryUsage float64   `json:"memory_usage"`
}

type DashboardIncident struct {
	RuleID          string     `json:"rule_id"`
	ServerID        string     `json:"server_id"`
	RuleName        string     `json:"rule_name"`
	ServerName      string     `json:"server_name"`
	Metric          string     `json:"metric"`
	Operator        string     `json:"operator"`
	Threshold       float64    `json:"threshold"`
	Status          string     `json:"status"`
	LastTriggeredAt *time.Time `json:"last_triggered_at,omitempty"`
}

type DashboardSummary struct {
	TotalServers   int     `json:"total_servers"`
	OnlineServers  int     `json:"online_servers"`
	OfflineServers int     `json:"offline_servers"`
	WarningServers int     `json:"warning_servers"`
	AverageCPU     float64 `json:"average_cpu"`
	AverageMemory  float64 `json:"average_memory"`
	MemoryUsed     int64   `json:"memory_used"`
	MemoryTotal    int64   `json:"memory_total"`
	OpenIncidents  int     `json:"open_incidents"`
}

type DashboardOverview struct {
	GeneratedAt time.Time           `json:"generated_at"`
	Range       string              `json:"range"`
	Summary     DashboardSummary    `json:"summary"`
	Servers     []DashboardServer   `json:"servers"`
	Metrics     []DashboardMetric   `json:"metrics"`
	Incidents   []DashboardIncident `json:"incidents"`
}

// Create inserts a new server and returns it.
func (r *Repository) Create(ctx context.Context, userID, name, ipAddress, enrollmentTokenHash string, enrollmentExpiresAt time.Time) (*Server, error) {
	var s Server
	var ip *string
	if ipAddress != "" {
		ip = &ipAddress
	}

	err := r.db.Pool.QueryRow(ctx,
		`INSERT INTO servers (
		     user_id, name, ip_address, agent_token, enrollment_token_hash,
		     enrollment_token_expires_at, tags
		 )
		 VALUES ($1, $2, $3, NULL, $4, $5, '[]'::jsonb)
		 RETURNING id, user_id, name, ip_address, group_name,
		           enrollment_token_expires_at,
		           auto_update_agent, status, last_seen_at,
		           deletion_status, deletion_requested_at, deletion_error,
		           created_at, updated_at`,
		userID, name, ip, enrollmentTokenHash, enrollmentExpiresAt,
	).Scan(
		&s.ID, &s.UserID, &s.Name, &s.IPAddress, &s.GroupName, &s.EnrollmentExpiresAt,
		&s.AutoUpdateAgent, &s.Status, &s.LastSeenAt,
		&s.DeletionStatus, &s.DeletionRequestedAt, &s.DeletionError,
		&s.CreatedAt, &s.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("create server: %w", err)
	}
	s.Tags = make([]string, 0)
	return &s, nil
}

// ListByUser returns all servers for a given user.
func (r *Repository) ListByUser(ctx context.Context, userID string) ([]*Server, error) {
	// Status is derived exclusively from the agent heartbeat. Administrative
	// updates use updated_at and must never make an offline server appear online.
	query := `
		SELECT id, user_id, name, ip_address, group_name, tags,
			CASE WHEN last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '1 minute' THEN 'offline' ELSE status END AS status,
			os_info, snapshot, inventory, inventory_updated_at, provider, region, environment,
			auto_update_agent,
			last_seen_at, deletion_status, deletion_requested_at, deletion_error,
			created_at, updated_at,
			active_agent_update_task
		FROM (
			SELECT servers.*,
			       (
			           SELECT jsonb_build_object(
			               'id', task.id,
			               'status', task.status,
			               'result', COALESCE(task.result->>'output', task.result::text),
			               'created_at', task.created_at,
			               'started_at', task.started_at,
			               'completed_at', task.completed_at
			           )::text
			           FROM server_tasks task
			           WHERE task.server_id = servers.id
			             AND task.type = 'agent_update'
			             AND (
			                 (task.status = 'pending' AND task.created_at >= NOW() - INTERVAL '15 minutes')
			                 OR (task.status = 'processing' AND task.started_at >= NOW() - INTERVAL '15 minutes')
			                 OR (task.status IN ('completed', 'failed', 'expired', 'timed_out', 'cancelled') AND task.updated_at >= NOW() - INTERVAL '10 minutes')
			             )
			           ORDER BY CASE WHEN task.status IN ('pending', 'processing') THEN 0 ELSE 1 END,
			                    task.created_at DESC
			           LIMIT 1
			       ) AS active_agent_update_task
			FROM servers
			WHERE user_id = $1
		) servers
		ORDER BY created_at DESC
	`
	rows, err := r.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("list servers query: %w", err)
	}
	defer rows.Close()

	var servers []*Server
	for rows.Next() {
		var s Server
		var tagsBytes []byte
		var activeTaskJSON *string
		err := rows.Scan(
			&s.ID, &s.UserID, &s.Name, &s.IPAddress, &s.GroupName, &tagsBytes,
			&s.Status, &s.OSInfo, &s.Snapshot, &s.Inventory, &s.InventoryUpdatedAt,
			&s.Provider, &s.Region, &s.Environment,
			&s.AutoUpdateAgent,
			&s.LastSeenAt, &s.DeletionStatus, &s.DeletionRequestedAt, &s.DeletionError,
			&s.CreatedAt, &s.UpdatedAt, &activeTaskJSON,
		)
		if err != nil {
			return nil, fmt.Errorf("scan server: %w", err)
		}

		s.Tags = make([]string, 0)
		if len(tagsBytes) > 0 {
			if err := json.Unmarshal(tagsBytes, &s.Tags); err != nil {
				return nil, fmt.Errorf("unmarshal tags: %w", err)
			}
		}
		if err := assignAgentUpdateTask(&s, activeTaskJSON); err != nil {
			return nil, err
		}

		servers = append(servers, &s)
	}

	if servers == nil {
		servers = make([]*Server, 0)
	}

	return servers, nil
}

// ExpireStaleAgentUninstalls moves abandoned uninstall requests to failed so
// the UI does not remain stuck forever when the Agent disappears or the helper
// cannot call back. It is safe to call before every list/get operation.
func (r *Repository) ExpireStaleAgentUninstalls(ctx context.Context, userID string) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin stale uninstall cleanup: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`WITH stale_tasks AS (
		    UPDATE server_tasks AS task
		    SET status = CASE
		                 WHEN task.status = 'pending' THEN 'expired'
		                 ELSE 'timed_out'
		               END,
		        completed_at = NOW(),
		        updated_at = NOW()
		    FROM servers
		    WHERE task.server_id = servers.id
		      AND servers.user_id = $1
		      AND task.type = 'agent_uninstall'
		      AND (
		          (task.status = 'pending' AND task.expires_at <= NOW())
		          OR
		          (task.status = 'processing'
		           AND task.started_at + make_interval(secs => task.timeout_seconds) <= NOW())
		      )
		    RETURNING task.server_id
		)
		UPDATE servers
		SET deletion_status = 'failed',
		    deletion_error = 'Agent uninstall task expired or timed out before completion.',
		    uninstall_token_hash = NULL,
		    uninstall_token_expires_at = NULL,
		    updated_at = NOW()
		WHERE id IN (SELECT server_id FROM stale_tasks)`,
		userID,
	); err != nil {
		return fmt.Errorf("expire stale Agent uninstall tasks: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`UPDATE servers
		 SET deletion_status = 'failed',
		     deletion_error = 'Agent uninstall confirmation expired. The Agent may require manual cleanup.',
		     uninstall_token_hash = NULL,
		     uninstall_token_expires_at = NULL,
		     updated_at = NOW()
		 WHERE user_id = $1
		   AND deletion_status = 'uninstalling'
		   AND uninstall_token_expires_at <= NOW()`,
		userID,
	); err != nil {
		return fmt.Errorf("expire missing Agent uninstall confirmations: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit stale uninstall cleanup: %w", err)
	}
	return nil
}

// UpdateServerMeta updates the name, group_name, and tags of a server.
func (r *Repository) UpdateServerMeta(ctx context.Context, id, userID, name, groupName string, tags []string, provider, region, environment string) error {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return fmt.Errorf("marshal tags: %w", err)
	}
	tag, err := r.db.Pool.Exec(ctx,
		`UPDATE servers
		 SET name = COALESCE(NULLIF($1, ''), name),
		     group_name = NULLIF($2, ''),
		     tags = $3,
		     provider = NULLIF($4, ''),
		     region = NULLIF($5, ''),
		     environment = NULLIF($6, ''),
		     updated_at = NOW()
		 WHERE id = $7 AND user_id = $8`,
		name, groupName, tagsJSON, provider, region, environment, id, userID,
	)
	if err != nil {
		return fmt.Errorf("update server meta: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("server not found or no permission")
	}
	return nil
}

// SetAgentAutoUpdate changes the opt-in update policy. Disabling the policy
// expires only automatic tasks that have not yet been claimed; interrupting a
// processing binary replacement would be unsafe.
func (r *Repository) SetAgentAutoUpdate(ctx context.Context, id, userID string, enabled bool) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin auto-update policy transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`UPDATE servers
		 SET auto_update_agent = $1,
		     updated_at = NOW()
		 WHERE id = $2 AND user_id = $3`,
		enabled, id, userID,
	)
	if err != nil {
		return fmt.Errorf("update auto-update policy: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("server not found or no permission")
	}

	if !enabled {
		if _, err := tx.Exec(ctx,
			`UPDATE server_tasks
			 SET status = 'expired',
			     result = jsonb_build_object('output', 'Automatic Agent updates were disabled before this task was claimed.'),
			     completed_at = NOW(),
			     updated_at = NOW()
			 WHERE server_id = $1
			   AND type = 'agent_update'
			   AND status = 'pending'
			   AND payload->>'trigger' = 'automatic'`,
			id,
		); err != nil {
			return fmt.Errorf("expire pending automatic updates: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit auto-update policy: %w", err)
	}
	return nil
}

// GetByID returns a single server by ID and UserID.
func (r *Repository) GetByID(ctx context.Context, id, userID string) (*Server, error) {
	var s Server
	row := r.db.Pool.QueryRow(ctx,
		`SELECT id, user_id, name, ip_address, group_name, tags,
			CASE WHEN last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '1 minute' THEN 'offline' ELSE status END AS status,
			os_info, snapshot, inventory, inventory_updated_at, provider, region, environment,
			auto_update_agent,
			last_seen_at, deletion_status, deletion_requested_at, deletion_error,
			created_at, updated_at,
			(
				SELECT jsonb_build_object(
					'id', task.id,
					'status', task.status,
					'result', COALESCE(task.result->>'output', task.result::text),
					'created_at', task.created_at,
					'started_at', task.started_at,
					'completed_at', task.completed_at
				)::text
				FROM server_tasks task
				WHERE task.server_id = servers.id
				  AND task.type = 'agent_update'
				  AND (
				      (task.status = 'pending' AND task.created_at >= NOW() - INTERVAL '15 minutes')
				      OR (task.status = 'processing' AND task.started_at >= NOW() - INTERVAL '15 minutes')
				      OR (task.status IN ('completed', 'failed', 'expired', 'timed_out', 'cancelled') AND task.updated_at >= NOW() - INTERVAL '10 minutes')
				  )
				ORDER BY CASE WHEN task.status IN ('pending', 'processing') THEN 0 ELSE 1 END,
				         task.created_at DESC
				LIMIT 1
			) AS active_agent_update_task
		 FROM servers WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	var tagsBytes []byte
	var activeTaskJSON *string
	err := row.Scan(
		&s.ID, &s.UserID, &s.Name, &s.IPAddress, &s.GroupName, &tagsBytes,
		&s.Status, &s.OSInfo, &s.Snapshot, &s.Inventory, &s.InventoryUpdatedAt,
		&s.Provider, &s.Region, &s.Environment,
		&s.AutoUpdateAgent,
		&s.LastSeenAt, &s.DeletionStatus, &s.DeletionRequestedAt, &s.DeletionError,
		&s.CreatedAt, &s.UpdatedAt, &activeTaskJSON,
	)

	if err != nil {
		return nil, fmt.Errorf("get server by id: %w", err)
	}
	s.Tags = make([]string, 0)
	if len(tagsBytes) > 0 {
		if err := json.Unmarshal(tagsBytes, &s.Tags); err != nil {
			return nil, fmt.Errorf("unmarshal tags: %w", err)
		}
	}
	if err := assignAgentUpdateTask(&s, activeTaskJSON); err != nil {
		return nil, err
	}
	return &s, nil
}

func assignAgentUpdateTask(server *Server, raw *string) error {
	if raw == nil || *raw == "" {
		return nil
	}
	var task AgentUpdateTask
	if err := json.Unmarshal([]byte(*raw), &task); err != nil {
		return fmt.Errorf("unmarshal active agent update task: %w", err)
	}
	server.ActiveAgentUpdateTask = &task
	return nil
}

// RequestAgentUninstall atomically validates server ownership, online state,
// Linux support, and deletion state before queueing a single destructive task.
// The raw one-time token exists only inside taskPayload; only its hash is stored
// on the server record for the later helper callback.
func (r *Repository) RequestAgentUninstall(
	ctx context.Context,
	id string,
	userID string,
	taskPayload string,
	tokenHash string,
) (string, error) {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin Agent uninstall transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var online bool
	var osIdentity string
	var remoteUninstallSupported bool
	var deletionStatus string
	err = tx.QueryRow(ctx,
		`SELECT last_seen_at IS NOT NULL
		        AND last_seen_at >= NOW() - INTERVAL '1 minute' AS online,
		        LOWER(COALESCE(os_info->>'os_family', os_info->>'os_name', '')) AS os_identity,
		        COALESCE(os_info->>'remote_uninstall_supported', 'false') = 'true' AS remote_uninstall_supported,
		        COALESCE(deletion_status, 'active')
		 FROM servers
		 WHERE id = $1 AND user_id = $2
		 FOR UPDATE`,
		id, userID,
	).Scan(&online, &osIdentity, &remoteUninstallSupported, &deletionStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrServerNotFound
	}
	if err != nil {
		return "", fmt.Errorf("lock server for Agent uninstall: %w", err)
	}
	if !online {
		return "", ErrAgentOffline
	}
	if !isLinuxOSIdentity(osIdentity) {
		return "", ErrUnsupportedAgentOS
	}
	if !remoteUninstallSupported {
		return "", ErrAgentUninstallUnsupported
	}
	if deletionStatus == "pending" || deletionStatus == "uninstalling" {
		return "", ErrDeletionInProgress
	}

	if _, err := tx.Exec(ctx,
		`UPDATE servers
		 SET deletion_status = 'pending',
		     deletion_requested_at = NOW(),
		     deletion_error = NULL,
		     uninstall_token_hash = $3,
		     uninstall_token_expires_at = NOW() + INTERVAL '15 minutes',
		     updated_at = NOW()
		 WHERE id = $1 AND user_id = $2`,
		id, userID, tokenHash,
	); err != nil {
		return "", fmt.Errorf("mark server deletion pending: %w", err)
	}

	// Do not let non-destructive pending work run before an approved uninstall.
	if _, err := tx.Exec(ctx,
		`UPDATE server_tasks
		 SET status = 'expired',
		     result = jsonb_build_object('output', 'Expired because Agent uninstall was requested.'),
		     completed_at = NOW(),
		     updated_at = NOW()
		 WHERE server_id = $1
		   AND status = 'pending'`,
		id,
	); err != nil {
		return "", fmt.Errorf("expire pending tasks before Agent uninstall: %w", err)
	}

	var taskID string
	err = tx.QueryRow(ctx,
		`INSERT INTO server_tasks
		    (server_id, type, payload, requested_by, timeout_seconds, expires_at)
		 VALUES ($1, 'agent_uninstall', $2::jsonb, $3, 300, NOW() + INTERVAL '15 minutes')
		 RETURNING id`,
		id, taskPayload, userID,
	).Scan(&taskID)
	if err != nil {
		return "", fmt.Errorf("queue Agent uninstall task: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit Agent uninstall transaction: %w", err)
	}
	return taskID, nil
}

// Delete permanently removes a server and all ON DELETE CASCADE child data.
// It intentionally does not contact the Agent and is reserved for force delete.
func (r *Repository) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.db.Pool.Exec(ctx, "DELETE FROM servers WHERE id = $1 AND user_id = $2", id, userID)
	if err != nil {
		return fmt.Errorf("delete server: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrServerNotFound
	}
	return nil
}

// isLinuxOSIdentity accepts both modern os_family=linux heartbeats and older
// Linux distro names that may only be present in os_name.
func isLinuxOSIdentity(identity string) bool {
	identity = strings.ToLower(strings.TrimSpace(identity))
	if identity == "linux" {
		return true
	}
	for _, marker := range []string{"ubuntu", "debian", "centos", "rocky", "alma", "fedora", "alpine", "linux"} {
		if strings.Contains(identity, marker) {
			return true
		}
	}
	return false
}

// ListMetrics returns historical metrics for a specific server downsampled based on the requested time range.
func (r *Repository) ListMetrics(ctx context.Context, serverID, userID, timeRange string) ([]*ServerMetric, error) {
	// Verify ownership first
	var count int
	err := r.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM servers WHERE id = $1 AND user_id = $2", serverID, userID).Scan(&count)
	if err != nil || count == 0 {
		return nil, fmt.Errorf("server not found or no permission")
	}

	var interval string
	var bucketSeconds int

	// Define time range and downsampling resolution
	switch timeRange {
	case "15m":
		interval = "15 minutes"
		bucketSeconds = 10 // Match the production heartbeat cadence without false gaps
	case "1h":
		interval = "1 hour"
		bucketSeconds = 15
	case "3h":
		interval = "3 hours"
		bucketSeconds = 30
	case "6h":
		interval = "6 hours"
		bucketSeconds = 60
	case "12h":
		interval = "12 hours"
		bucketSeconds = 120
	case "24h":
		interval = "24 hours"
		bucketSeconds = 300
	case "7d":
		interval = "7 days"
		bucketSeconds = 1800
	default:
		interval = "15 minutes" // Default to 15m
		bucketSeconds = 10
	}

	query := fmt.Sprintf(`
		SELECT 
			COALESCE(MAX(id::text), gen_random_uuid()::text) as id,
			server_id,
			COALESCE(AVG(cpu_usage), 0) as cpu_usage,
			COALESCE(AVG(memory_used)::bigint, 0) as memory_used,
			COALESCE(AVG(memory_total)::bigint, 0) as memory_total,
			COALESCE(AVG(net_in)::bigint, 0) as net_in,
			COALESCE(AVG(net_out)::bigint, 0) as net_out,
			COALESCE(AVG(disk_read)::bigint, 0) as disk_read,
			COALESCE(AVG(disk_write)::bigint, 0) as disk_write,
			to_timestamp(floor(extract(epoch from created_at) / %d) * %d) AS bucket_time
		FROM server_metrics 
		WHERE server_id = $1 
		  AND created_at >= NOW() - INTERVAL '%s'
		GROUP BY server_id, bucket_time
		ORDER BY bucket_time ASC
	`, bucketSeconds, bucketSeconds, interval)

	rows, err := r.db.Pool.Query(ctx, query, serverID)
	if err != nil {
		return nil, fmt.Errorf("list metrics downsampled query: %w", err)
	}
	defer rows.Close()

	var metrics []*ServerMetric
	for rows.Next() {
		var m ServerMetric
		if err := rows.Scan(&m.ID, &m.ServerID, &m.CPUUsage, &m.MemoryUsed, &m.MemoryTotal, &m.NetIn, &m.NetOut, &m.DiskRead, &m.DiskWrite, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("list metrics scan: %w", err)
		}
		m.BucketSeconds = bucketSeconds
		metrics = append(metrics, &m)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list metrics rows err: %w", err)
	}

	if metrics == nil {
		metrics = make([]*ServerMetric, 0)
	}
	return metrics, nil
}

// GetDashboardOverview returns one consistent, user-scoped snapshot for the dashboard.
// Every value comes from servers, the latest agent metric, or active alert state.
func (r *Repository) GetDashboardOverview(ctx context.Context, userID, timeRange string) (*DashboardOverview, error) {
	rangeKey := "2h"
	interval := "2 hours"
	bucketSeconds := 120

	switch timeRange {
	case "1h":
		rangeKey, interval, bucketSeconds = "1h", "1 hour", 60
	case "12h":
		rangeKey, interval, bucketSeconds = "12h", "12 hours", 600
	case "24h":
		rangeKey, interval, bucketSeconds = "24h", "24 hours", 900
	}

	overview := &DashboardOverview{
		Range:     rangeKey,
		Servers:   make([]DashboardServer, 0),
		Metrics:   make([]DashboardMetric, 0),
		Incidents: make([]DashboardIncident, 0),
	}

	serverRows, err := r.db.Pool.Query(ctx, `
		SELECT
			s.id,
			s.name,
			s.ip_address,
			CASE WHEN s.last_seen_at IS NULL OR s.last_seen_at < NOW() - INTERVAL '1 minute' THEN 'offline' ELSE s.status END AS status,
			COALESCE(lm.cpu_usage, 0),
			COALESCE(lm.memory_used, 0),
			COALESCE(lm.memory_total, 0),
			lm.server_id IS NOT NULL AS has_metrics,
			s.last_seen_at
		FROM servers s
		LEFT JOIN LATERAL (
			SELECT server_id, cpu_usage, memory_used, memory_total
			FROM server_metrics
			WHERE server_id = s.id
			ORDER BY created_at DESC
			LIMIT 1
		) lm ON true
		WHERE s.user_id = $1
		ORDER BY s.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("dashboard servers query: %w", err)
	}

	for serverRows.Next() {
		var server DashboardServer
		if err := serverRows.Scan(
			&server.ID,
			&server.Name,
			&server.IPAddress,
			&server.Status,
			&server.CPUUsage,
			&server.MemoryUsed,
			&server.MemoryTotal,
			&server.HasMetrics,
			&server.LastSeenAt,
		); err != nil {
			serverRows.Close()
			return nil, fmt.Errorf("dashboard server scan: %w", err)
		}
		overview.Servers = append(overview.Servers, server)
	}
	if err := serverRows.Err(); err != nil {
		serverRows.Close()
		return nil, fmt.Errorf("dashboard servers rows: %w", err)
	}
	serverRows.Close()

	metricQuery := fmt.Sprintf(`
		SELECT
			to_timestamp(floor(extract(epoch from sm.created_at) / %d) * %d) AS bucket_time,
			COALESCE(AVG(sm.cpu_usage), 0) AS cpu_usage,
			COALESCE(SUM(sm.memory_used) * 100.0 / NULLIF(SUM(sm.memory_total), 0), 0) AS memory_usage
		FROM server_metrics sm
		JOIN servers s ON s.id = sm.server_id
		WHERE sm.created_at >= NOW() - INTERVAL '%s'
		  AND s.user_id = $1
		GROUP BY bucket_time
		ORDER BY bucket_time ASC
	`, bucketSeconds, bucketSeconds, interval)

	metricRows, err := r.db.Pool.Query(ctx, metricQuery, userID)
	if err != nil {
		return nil, fmt.Errorf("dashboard metrics query: %w", err)
	}
	for metricRows.Next() {
		var metric DashboardMetric
		if err := metricRows.Scan(&metric.BucketTime, &metric.CPUUsage, &metric.MemoryUsage); err != nil {
			metricRows.Close()
			return nil, fmt.Errorf("dashboard metric scan: %w", err)
		}
		overview.Metrics = append(overview.Metrics, metric)
	}
	if err := metricRows.Err(); err != nil {
		metricRows.Close()
		return nil, fmt.Errorf("dashboard metrics rows: %w", err)
	}
	metricRows.Close()

	incidentRows, err := r.db.Pool.Query(ctx, `
		SELECT
			state.rule_id,
			state.server_id,
			rule.name,
			server.name,
			rule.metric,
			rule.operator,
			rule.threshold,
			state.status,
			state.last_triggered_at
		FROM alert_state state
		JOIN alert_rules rule ON rule.id = state.rule_id
		JOIN servers server ON server.id = state.server_id
		WHERE rule.enabled = true
		  AND state.status = 'firing'
		  AND rule.user_id = $1
		  AND server.user_id = $1
		ORDER BY state.last_triggered_at DESC NULLS LAST
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("dashboard incidents query: %w", err)
	}
	for incidentRows.Next() {
		var incident DashboardIncident
		if err := incidentRows.Scan(
			&incident.RuleID,
			&incident.ServerID,
			&incident.RuleName,
			&incident.ServerName,
			&incident.Metric,
			&incident.Operator,
			&incident.Threshold,
			&incident.Status,
			&incident.LastTriggeredAt,
		); err != nil {
			incidentRows.Close()
			return nil, fmt.Errorf("dashboard incident scan: %w", err)
		}
		overview.Incidents = append(overview.Incidents, incident)
	}
	if err := incidentRows.Err(); err != nil {
		incidentRows.Close()
		return nil, fmt.Errorf("dashboard incidents rows: %w", err)
	}
	incidentRows.Close()

	warningServerIDs := make(map[string]struct{})
	var cpuTotal float64
	var memoryPercentTotal float64
	var reportingOnlineServers int
	var reportingMemoryServers int

	for _, server := range overview.Servers {
		overview.Summary.TotalServers++
		if server.Status == "online" {
			overview.Summary.OnlineServers++
			if server.HasMetrics {
				reportingOnlineServers++
				cpuTotal += server.CPUUsage
				if server.MemoryTotal > 0 {
					reportingMemoryServers++
					memoryPercentTotal += float64(server.MemoryUsed) * 100 / float64(server.MemoryTotal)
					overview.Summary.MemoryUsed += server.MemoryUsed
					overview.Summary.MemoryTotal += server.MemoryTotal
				}
			}
		} else {
			overview.Summary.OfflineServers++
		}
	}

	for _, incident := range overview.Incidents {
		warningServerIDs[incident.ServerID] = struct{}{}
	}

	if reportingOnlineServers > 0 {
		overview.Summary.AverageCPU = cpuTotal / float64(reportingOnlineServers)
	}
	if reportingMemoryServers > 0 {
		overview.Summary.AverageMemory = memoryPercentTotal / float64(reportingMemoryServers)
	}
	overview.Summary.WarningServers = len(warningServerIDs)
	overview.Summary.OpenIncidents = len(overview.Incidents)
	overview.GeneratedAt = time.Now().UTC()

	return overview, nil
}

// PopulateAvailability30d calculates the 30-day availability percentage and downtime duration
// for each server based on metric gaps and ongoing offline status, with in-memory caching.
func (r *Repository) PopulateAvailability30d(ctx context.Context, servers []*Server) {
	if len(servers) == 0 {
		return
	}

	now := time.Now()
	cacheTTL := 60 * time.Second

	var toFetch []*Server
	for _, s := range servers {
		r.availMu.RLock()
		entry, found := r.availabilityCache[s.ID]
		r.availMu.RUnlock()

		if found && now.Sub(entry.cachedAt) < cacheTTL {
			s.Availability30d = entry.availabilityPct
			s.DowntimeSeconds30d = entry.downtimeSeconds
		} else {
			toFetch = append(toFetch, s)
		}
	}

	if len(toFetch) == 0 {
		return
	}

	var wg sync.WaitGroup
	type fetchResult struct {
		serverID string
		availPct float64
		downtime int64
	}
	results := make(chan fetchResult, len(toFetch))

	for _, s := range toFetch {
		wg.Add(1)
		go func(srv *Server) {
			defer wg.Done()
			avail, down := r.calculateSingleServerAvailability30d(ctx, srv, now)
			results <- fetchResult{
				serverID: srv.ID,
				availPct: avail,
				downtime: down,
			}
		}(s)
	}

	wg.Wait()
	close(results)

	r.availMu.Lock()
	defer r.availMu.Unlock()

	for res := range results {
		r.availabilityCache[res.serverID] = availabilityEntry{
			availabilityPct: res.availPct,
			downtimeSeconds: res.downtime,
			cachedAt:        now,
		}
		for _, s := range servers {
			if s.ID == res.serverID {
				s.Availability30d = res.availPct
				s.DowntimeSeconds30d = res.downtime
				break
			}
		}
	}
}

func (r *Repository) calculateSingleServerAvailability30d(ctx context.Context, srv *Server, now time.Time) (float64, int64) {
	windowDuration := 30 * 24 * time.Hour
	if now.Sub(srv.CreatedAt) < windowDuration {
		windowDuration = now.Sub(srv.CreatedAt)
	}
	windowSeconds := int64(windowDuration.Seconds())
	if windowSeconds < 60 {
		windowSeconds = 60
	}

	query := `
		SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (created_at - prev_time))), 0) AS downtime_seconds
		FROM (
			SELECT created_at, LAG(created_at) OVER (ORDER BY created_at) AS prev_time
			FROM server_metrics
			WHERE server_id = $1
			  AND created_at >= NOW() - INTERVAL '30 days'
		) sub
		WHERE prev_time IS NOT NULL AND created_at - prev_time > INTERVAL '2 minutes';
	`
	var metricDowntime float64
	err := r.db.Pool.QueryRow(ctx, query, srv.ID).Scan(&metricDowntime)
	if err != nil {
		metricDowntime = 0
	}

	totalDowntime := int64(metricDowntime)

	isOffline := srv.Status == "offline" || (srv.LastSeenAt != nil && srv.LastSeenAt.Before(now.Add(-1*time.Minute)))
	if isOffline && srv.LastSeenAt != nil {
		ongoingSeconds := int64(now.Sub(*srv.LastSeenAt).Seconds())
		if ongoingSeconds > 0 {
			totalDowntime += ongoingSeconds
		}
	}

	if totalDowntime > windowSeconds {
		totalDowntime = windowSeconds
	}
	if totalDowntime < 0 {
		totalDowntime = 0
	}

	uptimeSeconds := windowSeconds - totalDowntime
	if uptimeSeconds < 0 {
		uptimeSeconds = 0
	}

	availPct := float64(uptimeSeconds) / float64(windowSeconds) * 100.0
	availPct = math.Round(availPct*10) / 10
	if availPct > 100.0 {
		availPct = 100.0
	} else if availPct < 0.0 {
		availPct = 0.0
	}

	return availPct, totalDowntime
}

// ---------- Network Targets Persistence Methods ----------

// CreateNetworkTargets inserts one or more network targets (supports multi-agent batch creation).
// Each target is inserted as an independent database row.
func (r *Repository) CreateNetworkTargets(ctx context.Context, targets []NetworkTarget, userID string) ([]NetworkTarget, error) {
	if len(targets) == 0 {
		return nil, nil
	}

	// Verify all target agent_ids belong to the user
	agentIDs := make([]string, len(targets))
	for i, t := range targets {
		agentIDs[i] = t.AgentID
	}

	verifyQuery := `SELECT COUNT(DISTINCT id) FROM servers WHERE id = ANY($1) AND user_id = $2`
	var validCount int
	err := r.db.Pool.QueryRow(ctx, verifyQuery, agentIDs, userID).Scan(&validCount)
	if err != nil {
		return nil, fmt.Errorf("verify servers ownership: %w", err)
	}

	// Find unique agentIDs
	uniqueAgents := make(map[string]struct{})
	for _, id := range agentIDs {
		uniqueAgents[id] = struct{}{}
	}
	if validCount != len(uniqueAgents) {
		return nil, errors.New("one or more target servers not found or not owned by user")
	}

	created := make([]NetworkTarget, len(targets))
	insertQuery := `
		INSERT INTO network_targets (
			agent_id, name, host, port, tag, probe_method, probes_per_run,
			alert_latency_warning_ms, alert_latency_critical_ms, alert_loss_critical_pct,
			enabled, is_gateway
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, created_at, updated_at
	`

	for i, t := range targets {
		created[i] = t
		probes := t.ProbesPerRun
		if probes <= 0 {
			probes = ProbesPerTarget
		}
		method := strings.ToUpper(strings.TrimSpace(t.ProbeMethod))
		if method != "TCP" {
			method = "ICMP"
		}
		tag := strings.TrimSpace(t.Tag)
		if tag == "" {
			tag = "default"
		}

		err = r.db.Pool.QueryRow(ctx, insertQuery,
			t.AgentID, t.Name, t.Host, t.Port, tag, method, probes,
			t.AlertLatencyWarningMs, t.AlertLatencyCriticalMs, t.AlertLossCriticalPct,
			t.Enabled, t.IsGateway,
		).Scan(&created[i].ID, &created[i].CreatedAt, &created[i].UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("insert network target: %w", err)
		}
		created[i].ProbesPerRun = probes
		created[i].ProbeMethod = method
		created[i].Tag = tag
	}

	return created, nil
}

// GetNetworkTarget returns a single network target by ID with ownership verification.
func (r *Repository) GetNetworkTarget(ctx context.Context, id, userID string) (*NetworkTarget, error) {
	query := `
		SELECT t.id, t.agent_id, t.name, t.host, t.port, t.tag, t.probe_method, t.probes_per_run,
		       t.alert_latency_warning_ms, t.alert_latency_critical_ms, t.alert_loss_critical_pct,
		       t.enabled, t.is_gateway, t.created_at, t.updated_at
		FROM network_targets t
		JOIN servers s ON t.agent_id = s.id
		WHERE t.id = $1 AND s.user_id = $2
	`
	t := &NetworkTarget{}
	err := r.db.Pool.QueryRow(ctx, query, id, userID).Scan(
		&t.ID, &t.AgentID, &t.Name, &t.Host, &t.Port, &t.Tag, &t.ProbeMethod, &t.ProbesPerRun,
		&t.AlertLatencyWarningMs, &t.AlertLatencyCriticalMs, &t.AlertLossCriticalPct,
		&t.Enabled, &t.IsGateway, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("target not found")
		}
		return nil, err
	}
	return t, nil
}

// ListNetworkTargets lists network targets with server ownership, cross-filtering, and latest measurement.
func (r *Repository) ListNetworkTargets(ctx context.Context, agentIDs []string, tag, status, userID string) ([]NetworkTargetWithLatest, error) {
	var sb strings.Builder
	args := []any{userID}

	sb.WriteString(`
		SELECT t.id, t.agent_id, t.name, t.host, t.port, t.tag, t.probe_method, t.probes_per_run,
		       t.alert_latency_warning_ms, t.alert_latency_critical_ms, t.alert_loss_critical_pct,
		       t.enabled, t.is_gateway, t.created_at, t.updated_at,
		       s.name AS server_name,
		       r.id AS result_id, r.latency_ms, r.min_latency_ms, r.max_latency_ms, r.packet_loss,
		       r.total_probes, r.successful_probes, r.failed_probes, r.status AS result_status, r.measured_at
		FROM network_targets t
		JOIN servers s ON t.agent_id = s.id
		LEFT JOIN LATERAL (
			SELECT id, latency_ms, min_latency_ms, max_latency_ms, packet_loss,
			       total_probes, successful_probes, failed_probes, status, measured_at
			FROM network_target_results
			WHERE target_id = t.id
			ORDER BY measured_at DESC
			LIMIT 1
		) r ON true
		WHERE s.user_id = $1
	`)

	if len(agentIDs) > 0 {
		args = append(args, agentIDs)
		sb.WriteString(fmt.Sprintf(" AND t.agent_id = ANY($%d)", len(args)))
	}

	if tag != "" {
		args = append(args, strings.ToLower(tag))
		sb.WriteString(fmt.Sprintf(" AND LOWER(t.tag) = $%d", len(args)))
	}

	if status != "" {
		args = append(args, status)
		sb.WriteString(fmt.Sprintf(" AND COALESCE(r.status, 'optimal') = $%d", len(args)))
	}

	sb.WriteString(" ORDER BY t.tag ASC, t.created_at DESC")

	rows, err := r.db.Pool.Query(ctx, sb.String(), args...)
	if err != nil {
		return nil, fmt.Errorf("list network targets: %w", err)
	}
	defer rows.Close()

	var targets []NetworkTargetWithLatest
	for rows.Next() {
		var item NetworkTargetWithLatest
		var resID *string
		var lat, minLat, maxLat, loss *float64
		var totP, succP, failP *int
		var resStatus *string
		var measuredAt *time.Time

		err := rows.Scan(
			&item.ID, &item.AgentID, &item.Name, &item.Host, &item.Port, &item.Tag, &item.ProbeMethod, &item.ProbesPerRun,
			&item.AlertLatencyWarningMs, &item.AlertLatencyCriticalMs, &item.AlertLossCriticalPct,
			&item.Enabled, &item.IsGateway, &item.CreatedAt, &item.UpdatedAt,
			&item.ServerName,
			&resID, &lat, &minLat, &maxLat, &loss,
			&totP, &succP, &failP, &resStatus, &measuredAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan network target row: %w", err)
		}

		if resID != nil && measuredAt != nil {
			item.LatestResult = &NetworkTargetResult{
				ID:               *resID,
				TargetID:         item.ID,
				LatencyMs:        lat,
				MinLatencyMs:     minLat,
				MaxLatencyMs:     maxLat,
				PacketLoss:       loss,
				TotalProbes:      *totP,
				SuccessfulProbes: *succP,
				FailedProbes:     *failP,
				Status:           *resStatus,
				MeasuredAt:       *measuredAt,
			}
		}

		targets = append(targets, item)
	}

	return targets, nil
}

// GetEnabledNetworkTargets returns enabled targets for a specific agent without user check (for background/run diagnostics).
func (r *Repository) GetEnabledNetworkTargets(ctx context.Context, agentID string) ([]NetworkTarget, error) {
	query := `
		SELECT id, agent_id, name, host, port, tag, probe_method, probes_per_run,
		       alert_latency_warning_ms, alert_latency_critical_ms, alert_loss_critical_pct,
		       enabled, is_gateway, created_at, updated_at
		FROM network_targets
		WHERE agent_id = $1 AND enabled = true
		ORDER BY tag, name
	`
	rows, err := r.db.Pool.Query(ctx, query, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var targets []NetworkTarget
	for rows.Next() {
		var t NetworkTarget
		err := rows.Scan(
			&t.ID, &t.AgentID, &t.Name, &t.Host, &t.Port, &t.Tag, &t.ProbeMethod, &t.ProbesPerRun,
			&t.AlertLatencyWarningMs, &t.AlertLatencyCriticalMs, &t.AlertLossCriticalPct,
			&t.Enabled, &t.IsGateway, &t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		targets = append(targets, t)
	}
	return targets, nil
}

// UpdateNetworkTarget updates a target's parameters with user ownership validation.
func (r *Repository) UpdateNetworkTarget(ctx context.Context, target *NetworkTarget, userID string) error {
	probes := target.ProbesPerRun
	if probes <= 0 {
		probes = ProbesPerTarget
	}
	method := strings.ToUpper(strings.TrimSpace(target.ProbeMethod))
	if method != "TCP" {
		method = "ICMP"
	}
	tag := strings.TrimSpace(target.Tag)
	if tag == "" {
		tag = "default"
	}

	query := `
		UPDATE network_targets
		SET name = $1, host = $2, port = $3, tag = $4, probe_method = $5, probes_per_run = $6,
		    alert_latency_warning_ms = $7, alert_latency_critical_ms = $8, alert_loss_critical_pct = $9,
		    enabled = $10, is_gateway = $11, updated_at = NOW()
		WHERE id = $12 AND agent_id IN (SELECT id FROM servers WHERE user_id = $13)
	`
	tagRes, err := r.db.Pool.Exec(ctx, query,
		target.Name, target.Host, target.Port, tag, method, probes,
		target.AlertLatencyWarningMs, target.AlertLatencyCriticalMs, target.AlertLossCriticalPct,
		target.Enabled, target.IsGateway, target.ID, userID,
	)
	if err != nil {
		return fmt.Errorf("update network target: %w", err)
	}
	if tagRes.RowsAffected() == 0 {
		return errors.New("target not found or not owned by user")
	}
	return nil
}

// DeleteNetworkTarget deletes a target by ID with user ownership check.
func (r *Repository) DeleteNetworkTarget(ctx context.Context, id, userID string) error {
	query := `DELETE FROM network_targets WHERE id = $1 AND agent_id IN (SELECT id FROM servers WHERE user_id = $2)`
	res, err := r.db.Pool.Exec(ctx, query, id, userID)
	if err != nil {
		return fmt.Errorf("delete network target: %w", err)
	}
	if res.RowsAffected() == 0 {
		return errors.New("target not found or not owned by user")
	}
	return nil
}

// SaveNetworkTargetResults persists multiple probe results into network_target_results.
func (r *Repository) SaveNetworkTargetResults(ctx context.Context, results []NetworkTargetResult) error {
	if len(results) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	insertQuery := `
		INSERT INTO network_target_results (
			target_id, latency_ms, min_latency_ms, max_latency_ms, packet_loss,
			total_probes, successful_probes, failed_probes, status, measured_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`

	for _, res := range results {
		measured := res.MeasuredAt
		if measured.IsZero() {
			measured = time.Now()
		}
		status := res.Status
		if status == "" {
			status = "optimal"
		}
		batch.Queue(insertQuery,
			res.TargetID, res.LatencyMs, res.MinLatencyMs, res.MaxLatencyMs, res.PacketLoss,
			res.TotalProbes, res.SuccessfulProbes, res.FailedProbes, status, measured,
		)
	}

	br := r.db.Pool.SendBatch(ctx, batch)
	defer br.Close()

	for i := 0; i < len(results); i++ {
		_, err := br.Exec()
		if err != nil {
			return fmt.Errorf("batch insert network_target_results row %d: %w", i, err)
		}
	}

	return nil
}

// GetNetworkTargetHistory returns time-series measurements for a target within a date range, limited for chart performance.
func (r *Repository) GetNetworkTargetHistory(ctx context.Context, targetID string, from, to time.Time, limit int) ([]NetworkTargetResult, error) {
	if from.IsZero() {
		from = time.Now().Add(-24 * time.Hour)
	}
	if to.IsZero() {
		to = time.Now()
	}
	if limit <= 0 || limit > 500 {
		limit = 150
	}

	query := `
		SELECT id, target_id, latency_ms, min_latency_ms, max_latency_ms, packet_loss,
		       total_probes, successful_probes, failed_probes, status, measured_at
		FROM network_target_results
		WHERE target_id = $1 AND measured_at >= $2 AND measured_at <= $3
		ORDER BY measured_at ASC
		LIMIT $4
	`

	rows, err := r.db.Pool.Query(ctx, query, targetID, from, to, limit)
	if err != nil {
		return nil, fmt.Errorf("query network target history: %w", err)
	}
	defer rows.Close()

	var results []NetworkTargetResult
	for rows.Next() {
		var res NetworkTargetResult
		err := rows.Scan(
			&res.ID, &res.TargetID, &res.LatencyMs, &res.MinLatencyMs, &res.MaxLatencyMs, &res.PacketLoss,
			&res.TotalProbes, &res.SuccessfulProbes, &res.FailedProbes, &res.Status, &res.MeasuredAt,
		)
		if err != nil {
			return nil, err
		}
		results = append(results, res)
	}

	return results, nil
}

// GetNetworkQualityOverview groups network health across all user's agents by tag to detect wide-area incidents.
func (r *Repository) GetNetworkQualityOverview(ctx context.Context, userID string) ([]TagQualityOverview, error) {
	query := `
		SELECT 
			t.tag,
			COUNT(DISTINCT t.id) AS total_targets,
			COUNT(DISTINCT t.agent_id) AS total_agents,
			COUNT(DISTINCT CASE WHEN r.status = 'critical' THEN t.agent_id END) AS critical_agents,
			COUNT(DISTINCT CASE WHEN r.status = 'warning' THEN t.agent_id END) AS warning_agents,
			COUNT(DISTINCT CASE WHEN r.status IN ('optimal', 'reachable') THEN t.agent_id END) AS optimal_agents,
			COALESCE(AVG(r.latency_ms), 0) AS avg_latency_ms,
			COALESCE(MAX(r.packet_loss), 0) AS max_loss_pct,
			ARRAY_AGG(DISTINCT t.agent_id::text) AS agent_ids
		FROM network_targets t
		JOIN servers s ON t.agent_id = s.id
		LEFT JOIN LATERAL (
			SELECT status, latency_ms, packet_loss 
			FROM network_target_results 
			WHERE target_id = t.id 
			ORDER BY measured_at DESC 
			LIMIT 1
		) r ON true
		WHERE s.user_id = $1 AND t.enabled = true
		GROUP BY t.tag
		ORDER BY t.tag ASC
	`

	rows, err := r.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("get network quality overview: %w", err)
	}
	defer rows.Close()

	var overviews []TagQualityOverview
	for rows.Next() {
		var o TagQualityOverview
		var rawAgentIDs []string
		err := rows.Scan(
			&o.Tag, &o.TotalTargets, &o.TotalAgents,
			&o.CriticalAgents, &o.WarningAgents, &o.OptimalAgents,
			&o.AvgLatencyMs, &o.MaxLossPct, &rawAgentIDs,
		)
		if err != nil {
			return nil, err
		}

		o.AgentIDs = rawAgentIDs
		o.AvgLatencyMs = math.Round(o.AvgLatencyMs*10) / 10
		o.MaxLossPct = math.Round(o.MaxLossPct*10) / 10

		// Status determination
		if o.CriticalAgents > 0 {
			o.Status = "critical"
		} else if o.WarningAgents > 0 {
			o.Status = "warning"
		} else {
			o.Status = "optimal"
		}

		// Detect wide-area incident: if 2+ agents or >= 40% of fleet report critical on the same tag
		if o.TotalAgents >= 2 && (o.CriticalAgents >= 2 || (float64(o.CriticalAgents)/float64(o.TotalAgents) >= 0.4 && o.CriticalAgents > 0)) {
			o.IsWideAreaIssue = true
		}

		overviews = append(overviews, o)
	}

	return overviews, nil
}
