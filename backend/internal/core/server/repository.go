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
