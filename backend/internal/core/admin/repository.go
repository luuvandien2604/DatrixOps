package admin

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

var ErrNotFound = errors.New("user not found")

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

type UserWithStats struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"created_at"`
	ServerCount int       `json:"server_count"`
}

type FleetServer struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Status     string   `json:"status"`
	GroupName  *string  `json:"group_name,omitempty"`
	Tags       []string `json:"tags"`
	OwnerEmail string   `json:"owner_email"`
}

func (r *Repository) ListUsers(ctx context.Context) ([]UserWithStats, error) {
	query := `
		SELECT 
			u.id, u.email, u.role, u.created_at,
			COUNT(s.id) as server_count
		FROM users u
		LEFT JOIN servers s ON u.id = s.user_id
		GROUP BY u.id, u.email, u.role, u.created_at
		ORDER BY u.created_at DESC
	`
	rows, err := r.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []UserWithStats
	for rows.Next() {
		var u UserWithStats
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.CreatedAt, &u.ServerCount); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	if users == nil {
		users = make([]UserWithStats, 0)
	}
	return users, nil
}

func (r *Repository) ListFleetServers(ctx context.Context) ([]FleetServer, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT s.id, s.name, s.status, s.group_name, s.tags, u.email
		FROM servers s
		JOIN users u ON u.id = s.user_id
		ORDER BY u.email, s.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	servers := make([]FleetServer, 0)
	for rows.Next() {
		var server FleetServer
		var tags []byte
		if err := rows.Scan(&server.ID, &server.Name, &server.Status, &server.GroupName, &tags, &server.OwnerEmail); err != nil {
			return nil, err
		}
		if len(tags) > 0 {
			_ = json.Unmarshal(tags, &server.Tags)
		}
		servers = append(servers, server)
	}
	return servers, rows.Err()
}

func (r *Repository) QueueFleetTask(ctx context.Context, serverID, userID, taskType string) (string, error) {
	var taskID string
	err := r.db.Pool.QueryRow(ctx,
		`INSERT INTO server_tasks
			(server_id, type, payload, requested_by, timeout_seconds, expires_at)
		 SELECT id, $2, '{}'::jsonb, $3, 120, NOW() + INTERVAL '2 minutes'
		 FROM servers WHERE id = $1
		 RETURNING id`,
		serverID, taskType, userID,
	).Scan(&taskID)
	return taskID, err
}

func (r *Repository) CreateUser(ctx context.Context, email, passwordHash, role string) (*UserWithStats, error) {
	var u UserWithStats
	err := r.db.Pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
		 RETURNING id, email, role, created_at`,
		email, passwordHash, role,
	).Scan(&u.ID, &u.Email, &u.Role, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	u.ServerCount = 0
	return &u, nil
}

func (r *Repository) UpdateUserRole(ctx context.Context, id, role string) error {
	tag, err := r.db.Pool.Exec(ctx, `UPDATE users SET role = $2 WHERE id = $1`, id, role)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) UpdateUserPassword(ctx context.Context, id, passwordHash string) error {
	tag, err := r.db.Pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, id, passwordHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) DeleteUser(ctx context.Context, id string) error {
	tag, err := r.db.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
