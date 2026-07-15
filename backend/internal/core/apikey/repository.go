package apikey

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

type APIKey struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	Name       string     `json:"name"`
	KeyHash    string     `json:"-"`
	RawKey     string     `json:"raw_key,omitempty"` // only used when creating
	LastUsedAt *time.Time `json:"last_used_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

func (r *Repository) ListKeys(ctx context.Context, userID string) ([]APIKey, error) {
	rows, err := r.db.Pool.Query(ctx, 
		`SELECT id, user_id, name, last_used_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []APIKey
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.ID, &k.UserID, &k.Name, &k.LastUsedAt, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	if keys == nil {
		keys = make([]APIKey, 0)
	}
	return keys, nil
}

func (r *Repository) CreateKey(ctx context.Context, userID, name, keyHash string) (*APIKey, error) {
	var k APIKey
	err := r.db.Pool.QueryRow(ctx,
		`INSERT INTO api_keys (user_id, name, key_hash) VALUES ($1, $2, $3) RETURNING id, user_id, name, created_at`,
		userID, name, keyHash,
	).Scan(&k.ID, &k.UserID, &k.Name, &k.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &k, nil
}

func (r *Repository) DeleteKey(ctx context.Context, id, userID string) error {
	_, err := r.db.Pool.Exec(ctx, `DELETE FROM api_keys WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (r *Repository) VerifyKey(ctx context.Context, keyHash string) (*APIKey, error) {
	var k APIKey
	err := r.db.Pool.QueryRow(ctx,
		`SELECT id, user_id, name, created_at FROM api_keys WHERE key_hash = $1`,
		keyHash,
	).Scan(&k.ID, &k.UserID, &k.Name, &k.CreatedAt)
	if err != nil {
		return nil, err
	}
	
	// Update last used at
	_, _ = r.db.Pool.Exec(ctx, `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, k.ID)
	
	return &k, nil
}
