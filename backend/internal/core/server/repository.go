package server

import (
	"context"
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
	AgentToken string    `json:"agent_token,omitempty"` // only shown on creation
	Status     string    `json:"status"`
	OSInfo     *string   `json:"os_info,omitempty"`     // JSON raw message or string
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
		`INSERT INTO servers (user_id, name, ip_address, agent_token) 
		 VALUES ($1, $2, $3, $4) 
		 RETURNING id, user_id, name, ip_address, agent_token, status, created_at, updated_at`,
		userID, name, ip, agentToken,
	).Scan(&s.ID, &s.UserID, &s.Name, &s.IPAddress, &s.AgentToken, &s.Status, &s.CreatedAt, &s.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("create server: %w", err)
	}

	return &s, nil
}

// ListByUser returns all servers for a specific user.
func (r *Repository) ListByUser(ctx context.Context, userID string) ([]*Server, error) {
	rows, err := r.db.Pool.Query(ctx,
		`SELECT id, user_id, name, ip_address, status, os_info, created_at, updated_at 
		 FROM servers WHERE user_id = $1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list servers query: %w", err)
	}
	defer rows.Close()

	var servers []*Server
	for rows.Next() {
		var s Server
		if err := rows.Scan(&s.ID, &s.UserID, &s.Name, &s.IPAddress, &s.Status, &s.OSInfo, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, fmt.Errorf("list servers scan: %w", err)
		}
		servers = append(servers, &s)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list servers iterate: %w", err)
	}

	if servers == nil {
		servers = make([]*Server, 0)
	}
	return servers, nil
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

// ListMetrics returns historical metrics for a specific server (last 1 hour max 60 points)
func (r *Repository) ListMetrics(ctx context.Context, serverID, userID string) ([]*ServerMetric, error) {
	// Verify ownership first
	var count int
	err := r.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM servers WHERE id = $1 AND user_id = $2", serverID, userID).Scan(&count)
	if err != nil || count == 0 {
		return nil, fmt.Errorf("server not found or no permission")
	}

	// Downsample to 1 minute resolution for the last 1 hour
	// To keep it simple for now, just order by created_at DESC limit 60, but since agent sends every 10s, 60 points = 10 mins.
	// Let's just limit to 100 points for the chart.
	rows, err := r.db.Pool.Query(ctx,
		`SELECT id, server_id, cpu_usage, memory_used, memory_total, net_in, net_out, disk_read, disk_write, created_at
		 FROM server_metrics WHERE server_id = $1 ORDER BY created_at ASC LIMIT 100`, // We want ASC for charts, but we need the latest 100.
		serverID,
	)
	
	if err != nil {
		// Try using a subquery to get latest 100 then sort ASC
		rows, err = r.db.Pool.Query(ctx,
			`SELECT * FROM (
				SELECT id, server_id, cpu_usage, memory_used, memory_total, net_in, net_out, disk_read, disk_write, created_at
		 		FROM server_metrics WHERE server_id = $1 ORDER BY created_at DESC LIMIT 100
			) as sub ORDER BY created_at ASC`,
			serverID,
		)
		if err != nil {
			return nil, fmt.Errorf("list metrics query: %w", err)
		}
	} else {
		// Wait, if the first query succeeds, it gives the oldest 100. We want the newest 100 sorted ASC.
		// So we always should use the subquery.
		rows.Close()
		rows, err = r.db.Pool.Query(ctx,
			`SELECT * FROM (
				SELECT id, server_id, cpu_usage, memory_used, memory_total, net_in, net_out, disk_read, disk_write, created_at
		 		FROM server_metrics WHERE server_id = $1 ORDER BY created_at DESC LIMIT 100
			) as sub ORDER BY created_at ASC`,
			serverID,
		)
		if err != nil {
			return nil, fmt.Errorf("list metrics subquery: %w", err)
		}
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

	if metrics == nil {
		metrics = make([]*ServerMetric, 0)
	}
	return metrics, nil
}
