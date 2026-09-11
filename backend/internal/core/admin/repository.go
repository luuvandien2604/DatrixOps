package admin

import (
	"context"
	"errors"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

var (
	ErrNotFound  = errors.New("user not found")
	ErrLastAdmin = errors.New("cannot remove the last administrator")
)

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
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize administrator membership changes so two concurrent requests
	// cannot both observe another administrator and remove the final one.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('datrixops-admin-membership'))`); err != nil {
		return err
	}

	var currentRole string
	if err := tx.QueryRow(ctx, `SELECT role FROM users WHERE id = $1 FOR UPDATE`, id).Scan(&currentRole); err != nil {
		return ErrNotFound
	}
	if (currentRole == "admin" || currentRole == "superadmin") && role != "admin" && role != "superadmin" {
		var adminCount int
		if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role IN ('admin', 'superadmin')`).Scan(&adminCount); err != nil {
			return err
		}
		if adminCount <= 1 {
			return ErrLastAdmin
		}
	}

	tag, err := tx.Exec(ctx, `UPDATE users SET role = $2 WHERE id = $1`, id, role)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}

func (r *Repository) UpdateUserPassword(ctx context.Context, id, passwordHash string) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	tag, err := tx.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, id, passwordHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	if _, err := tx.Exec(ctx, `DELETE FROM refresh_tokens WHERE user_id = $1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *Repository) DeleteUser(ctx context.Context, id string) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('datrixops-admin-membership'))`); err != nil {
		return err
	}

	var currentRole string
	if err := tx.QueryRow(ctx, `SELECT role FROM users WHERE id = $1 FOR UPDATE`, id).Scan(&currentRole); err != nil {
		return ErrNotFound
	}
	if currentRole == "admin" || currentRole == "superadmin" {
		var adminCount int
		if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role IN ('admin', 'superadmin')`).Scan(&adminCount); err != nil {
			return err
		}
		if adminCount <= 1 {
			return ErrLastAdmin
		}
	}

	tag, err := tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return tx.Commit(ctx)
}
