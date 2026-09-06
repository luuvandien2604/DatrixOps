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
	RecordCheck(ctx context.Context, result CheckResult) error
}

type repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) Repository {
	return &repository{db: db}
}

func (r *repository) Create(ctx context.Context, w *Website) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	query := `
		INSERT INTO websites (user_id, name, url)
		VALUES ($1, $2, $3)
		RETURNING id, status, created_at, updated_at
	`
	if err := tx.QueryRow(ctx, query, w.UserID, w.Name, w.URL).
		Scan(&w.ID, &w.Status, &w.CreatedAt, &w.UpdatedAt); err != nil {
		return err
	}

	for _, channelID := range w.ChannelIDs {
		if channelID == "" {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO website_channels (website_id, alert_channel_id)
			VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, w.ID, channelID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *repository) ListByUserID(ctx context.Context, userID string) ([]Website, error) {
	query := `
		SELECT id, user_id, name, url, status, ssl_issuer, ssl_valid_to, ssl_days_remaining, down_started_at, last_ssl_alert_at, last_check, created_at, updated_at
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
		if err := rows.Scan(
			&w.ID, &w.UserID, &w.Name, &w.URL, &w.Status,
			&w.SSLIssuer, &w.SSLValidTo, &w.SSLDaysRemaining,
			&w.DownStartedAt, &w.LastSSLAlertAt,
			&w.LastCheck, &w.CreatedAt, &w.UpdatedAt,
		); err != nil {
			return nil, err
		}
		w.ChannelIDs = make([]string, 0)
		websites = append(websites, w)
	}

	// Fetch linked channels for user's websites
	if len(websites) > 0 {
		chRows, err := r.db.Pool.Query(ctx, `
			SELECT wc.website_id, wc.alert_channel_id
			FROM website_channels wc
			JOIN websites w ON w.id = wc.website_id
			WHERE w.user_id = $1
		`, userID)
		if err == nil {
			defer chRows.Close()
			for chRows.Next() {
				var webID, chID string
				if err := chRows.Scan(&webID, &chID); err == nil {
					for i := range websites {
						if websites[i].ID == webID {
							websites[i].ChannelIDs = append(websites[i].ChannelIDs, chID)
							break
						}
					}
				}
			}
		}
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
		SELECT id, user_id, name, url, status, ssl_issuer, ssl_valid_to, ssl_days_remaining, down_started_at, last_ssl_alert_at, last_check, created_at, updated_at
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
		if err := rows.Scan(
			&w.ID, &w.UserID, &w.Name, &w.URL, &w.Status,
			&w.SSLIssuer, &w.SSLValidTo, &w.SSLDaysRemaining,
			&w.DownStartedAt, &w.LastSSLAlertAt,
			&w.LastCheck, &w.CreatedAt, &w.UpdatedAt,
		); err != nil {
			return nil, err
		}
		w.ChannelIDs = make([]string, 0)
		websites = append(websites, w)
	}
	return websites, nil
}

func (r *repository) UpdateStatus(ctx context.Context, w *Website) error {
	query := `
		UPDATE websites 
		SET status = $1, ssl_issuer = $2, ssl_valid_to = $3, ssl_days_remaining = $4, last_check = $5, down_started_at = $6, last_ssl_alert_at = $7, updated_at = CURRENT_TIMESTAMP
		WHERE id = $8
	`
	_, err := r.db.Pool.Exec(ctx, query, w.Status, w.SSLIssuer, w.SSLValidTo, w.SSLDaysRemaining, w.LastCheck, w.DownStartedAt, w.LastSSLAlertAt, w.ID)
	return err
}

func (r *repository) RecordCheck(ctx context.Context, result CheckResult) error {
	_, err := r.db.Pool.Exec(ctx, `
		INSERT INTO website_checks (
			website_id, status, status_code, response_time_ms,
			failure_kind, ssl_days_remaining, checked_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, result.WebsiteID, result.Status, result.StatusCode, result.ResponseTimeMS,
		result.FailureKind, result.SSLDaysRemaining, result.CheckedAt)
	return err
}
