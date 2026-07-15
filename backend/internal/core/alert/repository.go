package alert

import (
	"context"
	"encoding/json"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) ListRules(ctx context.Context, userID string) ([]AlertRule, error) {
	rows, err := r.db.Pool.Query(ctx, `SELECT id, user_id, name, metric, operator, threshold, duration_minutes, server_id, enabled, created_at, updated_at FROM alert_rules WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []AlertRule
	for rows.Next() {
		var rule AlertRule
		if err := rows.Scan(&rule.ID, &rule.UserID, &rule.Name, &rule.Metric, &rule.Operator, &rule.Threshold, &rule.DurationMinutes, &rule.ServerID, &rule.Enabled, &rule.CreatedAt, &rule.UpdatedAt); err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}
	if rules == nil {
		rules = make([]AlertRule, 0)
	}
	return rules, nil
}

func (r *Repository) CreateRule(ctx context.Context, rule *AlertRule) error {
	return r.db.Pool.QueryRow(ctx,
		`INSERT INTO alert_rules (user_id, name, metric, operator, threshold, duration_minutes, server_id, enabled)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, created_at, updated_at`,
		rule.UserID, rule.Name, rule.Metric, rule.Operator, rule.Threshold, rule.DurationMinutes, rule.ServerID, rule.Enabled,
	).Scan(&rule.ID, &rule.CreatedAt, &rule.UpdatedAt)
}

func (r *Repository) DeleteRule(ctx context.Context, id, userID string) error {
	_, err := r.db.Pool.Exec(ctx, `DELETE FROM alert_rules WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (r *Repository) ListChannels(ctx context.Context, userID string) ([]AlertChannel, error) {
	rows, err := r.db.Pool.Query(ctx, `SELECT id, user_id, name, type, config, enabled, created_at, updated_at FROM alert_channels WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []AlertChannel
	for rows.Next() {
		var ch AlertChannel
		var configBytes []byte
		if err := rows.Scan(&ch.ID, &ch.UserID, &ch.Name, &ch.Type, &configBytes, &ch.Enabled, &ch.CreatedAt, &ch.UpdatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(configBytes, &ch.Config)
		channels = append(channels, ch)
	}
	if channels == nil {
		channels = make([]AlertChannel, 0)
	}
	return channels, nil
}

func (r *Repository) CreateChannel(ctx context.Context, ch *AlertChannel) error {
	configBytes, _ := json.Marshal(ch.Config)
	return r.db.Pool.QueryRow(ctx,
		`INSERT INTO alert_channels (user_id, name, type, config, enabled)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, created_at, updated_at`,
		ch.UserID, ch.Name, ch.Type, configBytes, ch.Enabled,
	).Scan(&ch.ID, &ch.CreatedAt, &ch.UpdatedAt)
}

func (r *Repository) DeleteChannel(ctx context.Context, id, userID string) error {
	_, err := r.db.Pool.Exec(ctx, `DELETE FROM alert_channels WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}
