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
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	Name       string    `json:"name"`
	IPAddress  *string   `json:"ip_address,omitempty"`
	GroupName  *string   `json:"group_name,omitempty"`
	Tags       []string  `json:"tags"`
	AgentToken string    `json:"agent_token,omitempty"` // only shown on creation
	Status     string    `json:"status"`
	OSInfo     *string   `json:"os_info,omitempty"`  // JSON raw message or string
	Snapshot   *string   `json:"snapshot,omitempty"` // JSONB raw message
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type ServerMetric struct {
	ID          string    `json:"id"`
	ServerID    string    `json:"server_id"`
	CPUUsage    float64   `json:"cpu_usage"`
	MemoryUsed  uint64    `json:"memory_used"`
	MemoryTotal uint64    `json:"memory_total"`
	NetIn       uint64    `json:"net_in"`
	NetOut      uint64    `json:"net_out"`
	DiskRead    uint64    `json:"disk_read"`
	DiskWrite   uint64    `json:"disk_write"`
	CreatedAt   time.Time `json:"created_at"`
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
		 RETURNING id, user_id, name, ip_address, group_name, agent_token, status, created_at, updated_at`,
		userID, name, ip, agentToken,
	).Scan(&s.ID, &s.UserID, &s.Name, &s.IPAddress, &s.GroupName, &s.AgentToken, &s.Status, &s.CreatedAt, &s.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("create server: %w", err)
	}
	s.Tags = make([]string, 0)
	return &s, nil
}

// ListByUser returns all servers for a given user.
func (r *Repository) ListByUser(ctx context.Context, userID string) ([]*Server, error) {
	// status được tính động: nếu > 1 phút không có heartbeat mới (updated_at) thì coi là
	// offline bất kể cột status lưu gì — cột status chỉ được Heartbeat handler set = 'online',
	// không có nơi nào set lại 'offline' khi mất kết nối, nên không thể tin trực tiếp cột này.
	query := `
		SELECT id, user_id, name, ip_address, group_name, tags,
			CASE WHEN updated_at < NOW() - INTERVAL '1 minute' THEN 'offline' ELSE status END AS status,
			os_info, snapshot, created_at, updated_at 
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
			&s.Status, &s.OSInfo, &s.Snapshot, &s.CreatedAt, &s.UpdatedAt,
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
func (r *Repository) UpdateServerMeta(ctx context.Context, id, userID string, groupName string, tags []string) error {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return fmt.Errorf("marshal tags: %w", err)
	}
	tag, err := r.db.Pool.Exec(ctx,
		"UPDATE servers SET group_name = $1, tags = $2, updated_at = NOW() WHERE id = $3 AND user_id = $4",
		groupName, tagsJSON, id, userID,
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
	err := r.db.Pool.QueryRow(ctx,
		`SELECT id, user_id, name, ip_address,
			CASE WHEN updated_at < NOW() - INTERVAL '1 minute' THEN 'offline' ELSE status END AS status,
			os_info, snapshot, created_at, updated_at 
		 FROM servers WHERE id = $1 AND user_id = $2`,
		id, userID,
	).Scan(&s.ID, &s.UserID, &s.Name, &s.IPAddress, &s.Status, &s.OSInfo, &s.Snapshot, &s.CreatedAt, &s.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("get server by id: %w", err)
	}
	return &s, nil
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
		bucketSeconds = 10 // Raw 10s points
	case "1h":
		interval = "1 hour"
		bucketSeconds = 60 // 1 minute buckets
	case "3h":
		interval = "3 hours"
		bucketSeconds = 120 // 2 minute buckets
	case "6h":
		interval = "6 hours"
		bucketSeconds = 300 // 5 minute buckets
	case "12h":
		interval = "12 hours"
		bucketSeconds = 600 // 10 minute buckets
	case "24h":
		interval = "24 hours"
		bucketSeconds = 900 // 15 minute buckets
	case "7d":
		interval = "7 days"
		bucketSeconds = 3600 // 1 hour buckets
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
