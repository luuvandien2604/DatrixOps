package website

import (
	"context"
	"errors"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

type Repository interface {
	Create(ctx context.Context, w *Website) error
	ListByUserID(ctx context.Context, userID string) ([]Website, error)
	Delete(ctx context.Context, id string, userID string) error
	ListAll(ctx context.Context) ([]Website, error)
	UpdateStatus(ctx context.Context, w *Website) error
}

type repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) Repository {
	return &repository{db: db}
}

func (r *repository) Create(ctx context.Context, w *Website) error {
	query := `
		INSERT INTO websites (user_id, name, url)
		VALUES ($1, $2, $3)
		RETURNING id, status, created_at, updated_at
	`
	return r.db.Pool.QueryRow(ctx, query, w.UserID, w.Name, w.URL).
		Scan(&w.ID, &w.Status, &w.CreatedAt, &w.UpdatedAt)
}

func (r *repository) ListByUserID(ctx context.Context, userID string) ([]Website, error) {
	query := `
		SELECT id, user_id, name, url, status, ssl_issuer, ssl_valid_to, ssl_days_remaining, last_check, created_at, updated_at
		FROM websites
		WHERE user_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var websites []Website
	for rows.Next() {
		var w Website
		if err := rows.Scan(&w.ID, &w.UserID, &w.Name, &w.URL, &w.Status, &w.SSLIssuer, &w.SSLValidTo, &w.SSLDaysRemaining, &w.LastCheck, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, err
		}
		websites = append(websites, w)
	}
	return websites, nil
}

func (r *repository) Delete(ctx context.Context, id string, userID string) error {
	query := `DELETE FROM websites WHERE id = $1 AND user_id = $2`
	res, err := r.db.Pool.Exec(ctx, query, id, userID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return errors.New("website not found or unauthorized")
	}
	return nil
}

func (r *repository) ListAll(ctx context.Context) ([]Website, error) {
	query := `
		SELECT id, user_id, name, url, status, ssl_issuer, ssl_valid_to, ssl_days_remaining, last_check, created_at, updated_at
		FROM websites
	`
	rows, err := r.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var websites []Website
	for rows.Next() {
		var w Website
		if err := rows.Scan(&w.ID, &w.UserID, &w.Name, &w.URL, &w.Status, &w.SSLIssuer, &w.SSLValidTo, &w.SSLDaysRemaining, &w.LastCheck, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, err
		}
		websites = append(websites, w)
	}
	return websites, nil
}

func (r *repository) UpdateStatus(ctx context.Context, w *Website) error {
	query := `
		UPDATE websites 
		SET status = $1, ssl_issuer = $2, ssl_valid_to = $3, ssl_days_remaining = $4, last_check = $5, updated_at = CURRENT_TIMESTAMP
		WHERE id = $6
	`
	_, err := r.db.Pool.Exec(ctx, query, w.Status, w.SSLIssuer, w.SSLValidTo, w.SSLDaysRemaining, w.LastCheck, w.ID)
	return err
}
