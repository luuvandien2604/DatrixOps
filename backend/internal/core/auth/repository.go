package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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
	Username     *string
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
		"INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, email, password_hash, role, created_at",
		email, passwordHash, role,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.Role, &user.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return &user, nil
}

// FindUserByEmail finds a user by email.
func (r *Repository) FindUserByEmail(ctx context.Context, email string) (*User, error) {
	var user User
	err := r.db.Pool.QueryRow(ctx,
		"SELECT id, username, email, password_hash, role, created_at FROM users WHERE email = $1",
		email,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.Role, &user.CreatedAt)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Not found
		}
		return nil, fmt.Errorf("find user by email: %w", err)
	}
	return &user, nil
}

// FindUserByIdentifier finds a user by username or email. Email remains
// supported for team accounts and compatibility with existing installations.
func (r *Repository) FindUserByIdentifier(ctx context.Context, identifier string) (*User, error) {
	var user User
	err := r.db.Pool.QueryRow(ctx,
		`SELECT id, username, email, password_hash, role, created_at
		 FROM users
		 WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
		identifier,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.Role, &user.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("find user by identifier: %w", err)
	}
	return &user, nil
}

// FindUserByID finds a user by their ID.
func (r *Repository) FindUserByID(ctx context.Context, id string) (*User, error) {
	var user User
	err := r.db.Pool.QueryRow(ctx,
		"SELECT id, username, email, password_hash, role, created_at FROM users WHERE id = $1",
		id,
	).Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.Role, &user.CreatedAt)

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
		userID, refreshTokenHash(token), expiresAt,
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
		`SELECT id, user_id, token, expires_at, created_at
		 FROM refresh_tokens
		 WHERE token = $1 OR token = $2
		 ORDER BY CASE WHEN token = $1 THEN 0 ELSE 1 END
		 LIMIT 1`,
		refreshTokenHash(token), token,
	).Scan(&rt.ID, &rt.UserID, &rt.Token, &rt.ExpiresAt, &rt.CreatedAt)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("find refresh token: %w", err)
	}
	return &rt, nil
}

// ConsumeRefreshToken atomically enforces one-time refresh-token rotation.
// The plaintext fallback keeps sessions created by older releases valid once;
// all newly issued tokens are stored only as SHA-256 digests.
func (r *Repository) ConsumeRefreshToken(ctx context.Context, token string) (*RefreshToken, error) {
	var rt RefreshToken
	err := r.db.Pool.QueryRow(ctx,
		`DELETE FROM refresh_tokens
		 WHERE (token = $1 OR token = $2)
		   AND expires_at > NOW()
		 RETURNING id, user_id, token, expires_at, created_at`,
		refreshTokenHash(token), token,
	).Scan(&rt.ID, &rt.UserID, &rt.Token, &rt.ExpiresAt, &rt.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("consume refresh token: %w", err)
	}
	return &rt, nil
}

// DeleteRefreshToken removes a refresh token (logout).
func (r *Repository) DeleteRefreshToken(ctx context.Context, token string) error {
	_, err := r.db.Pool.Exec(ctx, "DELETE FROM refresh_tokens WHERE token = $1 OR token = $2", refreshTokenHash(token), token)
	if err != nil {
		return fmt.Errorf("delete refresh token: %w", err)
	}
	return nil
}

func refreshTokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// DeleteExpiredTokens cleanup job.
func (r *Repository) DeleteExpiredTokens(ctx context.Context) error {
	_, err := r.db.Pool.Exec(ctx, "DELETE FROM refresh_tokens WHERE expires_at < NOW()")
	if err != nil {
		return fmt.Errorf("delete expired tokens: %w", err)
	}
	return nil
}

// ClaimSelfHostServer assigns any self-host servers to the superadmin user.
func (r *Repository) ClaimSelfHostServer(ctx context.Context, userID string) error {
	_, err := r.db.Pool.Exec(ctx,
		`UPDATE servers 
		 SET user_id = $1 
		 WHERE tags @> '["self-host"]'::jsonb OR name LIKE '%Control Plane%'`,
		userID,
	)
	return err
}
