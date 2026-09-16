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
	UpsertTodayRollup(ctx context.Context, entityType, entityID, status string, latencyMS int, failureKind *string) error
	GetUptimeRollups(ctx context.Context, entityType string, entityIDs []string, startDate, endDate string) (map[string]map[string]DailyUptimeRollup, error)
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
	if err != nil {
		return err
	}
	_ = r.UpsertTodayRollup(ctx, "website", result.WebsiteID, result.Status, result.ResponseTimeMS, result.FailureKind)
	return nil
}

func (r *repository) UpsertTodayRollup(ctx context.Context, entityType, entityID, status string, latencyMS int, failureKind *string) error {
	query := `
		INSERT INTO daily_uptime_rollups (
			entity_type, entity_id, date, uptime_pct, downtime_seconds,
			total_checks, failed_checks, avg_latency_ms, status, incident_title, updated_at
		)
		VALUES (
			$1, $2, CURRENT_DATE,
			CASE WHEN $3 = 'UP' THEN 100.0 ELSE 0.0 END,
			CASE WHEN $3 = 'UP' THEN 0 ELSE 60 END,
			1,
			CASE WHEN $3 = 'UP' THEN 0 ELSE 1 END,
			$4,
			CASE WHEN $3 = 'UP' THEN 'operational' ELSE 'outage' END,
			$5,
			CURRENT_TIMESTAMP
		)
		ON CONFLICT (entity_type, entity_id, date) DO UPDATE SET
			total_checks = daily_uptime_rollups.total_checks + 1,
			failed_checks = daily_uptime_rollups.failed_checks + (CASE WHEN EXCLUDED.status = 'outage' THEN 1 ELSE 0 END),
			downtime_seconds = daily_uptime_rollups.downtime_seconds + (CASE WHEN EXCLUDED.status = 'outage' THEN 60 ELSE 0 END),
			uptime_pct = ROUND((daily_uptime_rollups.total_checks + 1 - (daily_uptime_rollups.failed_checks + (CASE WHEN EXCLUDED.status = 'outage' THEN 1 ELSE 0 END)))::numeric / (daily_uptime_rollups.total_checks + 1) * 100.0, 2),
			avg_latency_ms = ROUND(((daily_uptime_rollups.avg_latency_ms * daily_uptime_rollups.total_checks) + $4)::numeric / (daily_uptime_rollups.total_checks + 1), 2),
			status = CASE 
				WHEN (daily_uptime_rollups.failed_checks + (CASE WHEN EXCLUDED.status = 'outage' THEN 1 ELSE 0 END)) = 0 THEN 'operational'
				WHEN (daily_uptime_rollups.total_checks + 1 - (daily_uptime_rollups.failed_checks + (CASE WHEN EXCLUDED.status = 'outage' THEN 1 ELSE 0 END)))::numeric / (daily_uptime_rollups.total_checks + 1) >= 0.95 THEN 'degraded'
				ELSE 'outage'
			END,
			incident_title = COALESCE($5, daily_uptime_rollups.incident_title),
			updated_at = CURRENT_TIMESTAMP
	`
	_, err := r.db.Pool.Exec(ctx, query, entityType, entityID, status, latencyMS, failureKind)
	return err
}

func (r *repository) GetUptimeRollups(ctx context.Context, entityType string, entityIDs []string, startDate, endDate string) (map[string]map[string]DailyUptimeRollup, error) {
	result := make(map[string]map[string]DailyUptimeRollup)
	if len(entityIDs) == 0 {
		return result, nil
	}

	query := `
		SELECT 
			id, entity_type, entity_id, TO_CHAR(date, 'YYYY-MM-DD') AS date_str,
			uptime_pct, downtime_seconds, total_checks, failed_checks,
			avg_latency_ms, status, incident_title, incident_description,
			created_at, updated_at
		FROM daily_uptime_rollups
		WHERE entity_type = $1 
		  AND entity_id = ANY($2)
		  AND date >= $3::date 
		  AND date <= $4::date
		ORDER BY date ASC
	`
	rows, err := r.db.Pool.Query(ctx, query, entityType, entityIDs, startDate, endDate)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var item DailyUptimeRollup
		if err := rows.Scan(
			&item.ID, &item.EntityType, &item.EntityID, &item.Date,
			&item.UptimePct, &item.DowntimeSeconds, &item.TotalChecks, &item.FailedChecks,
			&item.AvgLatencyMS, &item.Status, &item.IncidentTitle, &item.IncidentDescription,
			&item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			return result, err
		}

		if _, exists := result[item.EntityID]; !exists {
			result[item.EntityID] = make(map[string]DailyUptimeRollup)
		}
		result[item.EntityID][item.Date] = item
	}

	return result, nil
}
