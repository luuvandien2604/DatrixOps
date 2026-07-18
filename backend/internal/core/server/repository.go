package server

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

type Server struct {
	ID                 string     `json:"id"`
	UserID             string     `json:"user_id"`
	Name               string     `json:"name"`
	IPAddress          *string    `json:"ip_address,omitempty"`
	GroupName          *string    `json:"group_name,omitempty"`
	Tags               []string   `json:"tags"`
	AgentToken         string     `json:"agent_token,omitempty"` // only shown on creation
	Status             string     `json:"status"`
	OSInfo             *string    `json:"os_info,omitempty"`  // JSON raw message or string
	Snapshot           *string    `json:"snapshot,omitempty"` // JSONB raw message
	Inventory          *string    `json:"inventory,omitempty"`
	InventoryUpdatedAt *time.Time `json:"inventory_updated_at,omitempty"`
	Provider           *string    `json:"provider,omitempty"`
	Region             *string    `json:"region,omitempty"`
	Environment        *string    `json:"environment,omitempty"`
	LastSeenAt         *time.Time `json:"last_seen_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type CronJob struct {
	ID           string     `json:"id"`
	ExternalID   string     `json:"external_id"`
	Source       string     `json:"source"`
	Owner        *string    `json:"owner,omitempty"`
	Schedule     string     `json:"schedule"`
	Command      string     `json:"command"`
	Enabled      bool       `json:"enabled"`
	LastRunAt    *time.Time `json:"last_run_at,omitempty"`
	NextRunAt    *time.Time `json:"next_run_at,omitempty"`
	LastStatus   *string    `json:"last_status,omitempty"`
	DiscoveredAt time.Time  `json:"discovered_at"`
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
func (r *Repository) Create(ctx context.Context, userID, name, ipAddress, agentToken string) (*Server, error) {
	var s Server
	var ip *string
	if ipAddress != "" {
		ip = &ipAddress
	}

	err := r.db.Pool.QueryRow(ctx,
		`INSERT INTO servers (user_id, name, ip_address, agent_token, tags) 
		 VALUES ($1, $2, $3, $4, '[]'::jsonb) 
		 RETURNING id, user_id, name, ip_address, group_name, agent_token, status, last_seen_at, created_at, updated_at`,
		userID, name, ip, agentToken,
	).Scan(&s.ID, &s.UserID, &s.Name, &s.IPAddress, &s.GroupName, &s.AgentToken, &s.Status, &s.LastSeenAt, &s.CreatedAt, &s.UpdatedAt)

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
			last_seen_at, created_at, updated_at
		FROM servers
		WHERE user_id = $1
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
		err := rows.Scan(
			&s.ID, &s.UserID, &s.Name, &s.IPAddress, &s.GroupName, &tagsBytes,
			&s.Status, &s.OSInfo, &s.Snapshot, &s.Inventory, &s.InventoryUpdatedAt,
			&s.Provider, &s.Region, &s.Environment,
			&s.LastSeenAt, &s.CreatedAt, &s.UpdatedAt,
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

		servers = append(servers, &s)
	}

	if servers == nil {
		servers = make([]*Server, 0)
	}

	return servers, nil
}

// UpdateServerMeta updates the group_name and tags of a server.
func (r *Repository) UpdateServerMeta(ctx context.Context, id, userID string, groupName string, tags []string, provider, region, environment string) error {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return fmt.Errorf("marshal tags: %w", err)
	}
	tag, err := r.db.Pool.Exec(ctx,
		`UPDATE servers
		 SET group_name = NULLIF($1, ''),
		     tags = $2,
		     provider = NULLIF($3, ''),
		     region = NULLIF($4, ''),
		     environment = NULLIF($5, ''),
		     updated_at = NOW()
		 WHERE id = $6 AND user_id = $7`,
		groupName, tagsJSON, provider, region, environment, id, userID,
	)
	if err != nil {
		return fmt.Errorf("update server meta: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("server not found or no permission")
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
			last_seen_at, created_at, updated_at
		 FROM servers WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	var tagsBytes []byte
	err := row.Scan(
		&s.ID, &s.UserID, &s.Name, &s.IPAddress, &s.GroupName, &tagsBytes,
		&s.Status, &s.OSInfo, &s.Snapshot, &s.Inventory, &s.InventoryUpdatedAt,
		&s.Provider, &s.Region, &s.Environment,
		&s.LastSeenAt, &s.CreatedAt, &s.UpdatedAt,
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
	return &s, nil
}

// ListCronJobs returns discovered cron jobs for a user-owned server.
func (r *Repository) ListCronJobs(ctx context.Context, serverID, userID string) ([]CronJob, error) {
	rows, err := r.db.Pool.Query(ctx,
		`SELECT job.id, job.external_id, job.source, job.owner, job.schedule,
		        job.command, job.enabled, job.last_run_at, job.next_run_at,
		        job.last_status, job.discovered_at
		 FROM cron_jobs job
		 JOIN servers server ON server.id = job.server_id
		 WHERE job.server_id = $1 AND server.user_id = $2
		 ORDER BY job.enabled DESC, job.source, job.schedule, job.command`,
		serverID, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list cron jobs: %w", err)
	}
	defer rows.Close()

	jobs := make([]CronJob, 0)
	for rows.Next() {
		var job CronJob
		if err := rows.Scan(
			&job.ID, &job.ExternalID, &job.Source, &job.Owner, &job.Schedule,
			&job.Command, &job.Enabled, &job.LastRunAt, &job.NextRunAt,
			&job.LastStatus, &job.DiscoveredAt,
		); err != nil {
			return nil, fmt.Errorf("scan cron job: %w", err)
		}
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

// Delete removes a server by ID and UserID.
func (r *Repository) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.db.Pool.Exec(ctx, "DELETE FROM servers WHERE id = $1 AND user_id = $2", id, userID)
	if err != nil {
		return fmt.Errorf("delete server: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("server not found or no permission")
	}
	return nil
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
		WHERE s.user_id = $1
		  AND sm.created_at >= NOW() - INTERVAL '%s'
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
		WHERE rule.user_id = $1
		  AND server.user_id = $1
		  AND rule.enabled = true
		  AND state.status = 'firing'
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
