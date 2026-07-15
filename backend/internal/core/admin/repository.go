package admin

import (
	"context"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

type UserWithStats struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	ServerCount int     `json:"server_count"`
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
