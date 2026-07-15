package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

// Repository handles database operations for the auth module.
type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

type User struct {
	ID           string
	Email        string
	PasswordHash string
	Role         string
	CreatedAt    time.Time
}

type RefreshToken struct {
	ID        string
	UserID    string
	Token     string
	ExpiresAt time.Time
	CreatedAt time.Time
}

// UserCount returns the total number of users in the system.
func (r *Repository) UserCount(ctx context.Context) (int, error) {
	var count int
	err := r.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count users: %w", err)
	}
	return count, nil
}

// CreateUser inserts a new user.
func (r *Repository) CreateUser(ctx context.Context, email, passwordHash, role string) (*User, error) {
	var user User
	err := r.db.Pool.QueryRow(ctx, 
		"INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, password_hash, role, created_at",
		email, passwordHash, role,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Role, &user.CreatedAt)
	
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &user, nil
}

// FindUserByEmail finds a user by email.
func (r *Repository) FindUserByEmail(ctx context.Context, email string) (*User, error) {
	var user User
	err := r.db.Pool.QueryRow(ctx, 
		"SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1",
		email,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Role, &user.CreatedAt)
	
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Not found
		}
		return nil, fmt.Errorf("find user by email: %w", err)
	}
	return &user, nil
}

// FindUserByID finds a user by their ID.
func (r *Repository) FindUserByID(ctx context.Context, id string) (*User, error) {
	var user User
	err := r.db.Pool.QueryRow(ctx, 
		"SELECT id, email, password_hash, role, created_at FROM users WHERE id = $1",
		id,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Role, &user.CreatedAt)
	
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("find user by id: %w", err)
	}
	return &user, nil
}

// CreateRefreshToken inserts a new refresh token.
func (r *Repository) CreateRefreshToken(ctx context.Context, userID, token string, expiresAt time.Time) error {
	_, err := r.db.Pool.Exec(ctx,
		"INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
		userID, token, expiresAt,
	)
	if err != nil {
		return fmt.Errorf("create refresh token: %w", err)
	}
	return nil
}

// FindRefreshToken finds a refresh token by its string value.
func (r *Repository) FindRefreshToken(ctx context.Context, token string) (*RefreshToken, error) {
	var rt RefreshToken
	err := r.db.Pool.QueryRow(ctx,
		"SELECT id, user_id, token, expires_at, created_at FROM refresh_tokens WHERE token = $1",
		token,
	).Scan(&rt.ID, &rt.UserID, &rt.Token, &rt.ExpiresAt, &rt.CreatedAt)
	
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("find refresh token: %w", err)
	}
	return &rt, nil
}

// DeleteRefreshToken removes a refresh token (logout).
func (r *Repository) DeleteRefreshToken(ctx context.Context, token string) error {
	_, err := r.db.Pool.Exec(ctx, "DELETE FROM refresh_tokens WHERE token = $1", token)
	if err != nil {
		return fmt.Errorf("delete refresh token: %w", err)
	}
	return nil
}

// DeleteExpiredTokens cleanup job.
func (r *Repository) DeleteExpiredTokens(ctx context.Context) error {
	_, err := r.db.Pool.Exec(ctx, "DELETE FROM refresh_tokens WHERE expires_at < NOW()")
	if err != nil {
		return fmt.Errorf("delete expired tokens: %w", err)
	}
	return nil
}
