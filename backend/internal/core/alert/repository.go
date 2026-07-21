package alert

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

var (
	// ErrInvalidChannelSelection báo rằng channel không tồn tại, bị tắt,
	// hoặc không thuộc người dùng đang tạo rule.
	ErrInvalidChannelSelection = errors.New("invalid alert channel selection")

	// ErrChannelInUse ngăn xóa channel đang được ít nhất một rule sử dụng.
	ErrChannelInUse = errors.New("alert channel is in use")

	// ErrChannelNotFound báo channel không tồn tại hoặc không thuộc user hiện tại.
	ErrChannelNotFound = errors.New("alert channel not found")
)

// Repository chịu trách nhiệm đọc/ghi alert rules, channels và quan hệ giữa chúng.
type Repository struct {
	db *database.DB
}

// NewRepository tạo repository dùng database connection pool hiện tại.
func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

// ListRules trả các rule thuộc user cùng danh sách channel đã gắn vào từng rule.
// Hàm dùng hai query để tránh N+1 query khi số lượng rule tăng lên.
func (r *Repository) ListRules(ctx context.Context, userID string) ([]AlertRule, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT
			id,
			user_id,
			name,
			metric,
			operator,
			threshold,
			duration_minutes,
			server_id,
			enabled,
			created_at,
			updated_at
		FROM alert_rules
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list alert rules: %w", err)
	}
	defer rows.Close()

	rules := make([]AlertRule, 0)
	ruleIndex := make(map[string]int)

	for rows.Next() {
		var rule AlertRule
		if err := rows.Scan(
			&rule.ID,
			&rule.UserID,
			&rule.Name,
			&rule.Metric,
			&rule.Operator,
			&rule.Threshold,
			&rule.DurationMinutes,
			&rule.ServerID,
			&rule.Enabled,
			&rule.CreatedAt,
			&rule.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan alert rule: %w", err)
		}

		rule.ChannelIDs = make([]string, 0)
		rule.Channels = make([]AlertRuleChannel, 0)
		ruleIndex[rule.ID] = len(rules)
		rules = append(rules, rule)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate alert rules: %w", err)
	}

	if len(rules) == 0 {
		return rules, nil
	}

	channelRows, err := r.db.Pool.Query(ctx, `
		SELECT
			arc.alert_rule_id,
			c.id,
			c.name,
			c.type,
			c.enabled
		FROM alert_rule_channels arc
		JOIN alert_rules r ON r.id = arc.alert_rule_id
		JOIN alert_channels c ON c.id = arc.alert_channel_id
		WHERE r.user_id = $1
		ORDER BY c.name ASC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list channels for alert rules: %w", err)
	}
	defer channelRows.Close()

	for channelRows.Next() {
		var ruleID string
		var channel AlertRuleChannel
		if err := channelRows.Scan(
			&ruleID,
			&channel.ID,
			&channel.Name,
			&channel.Type,
			&channel.Enabled,
		); err != nil {
			return nil, fmt.Errorf("scan alert rule channel: %w", err)
		}

		index, ok := ruleIndex[ruleID]
		if !ok {
			continue
		}
		rules[index].ChannelIDs = append(rules[index].ChannelIDs, channel.ID)
		rules[index].Channels = append(rules[index].Channels, channel)
	}
	if err := channelRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate alert rule channels: %w", err)
	}

	return rules, nil
}

// CreateRule tạo rule và toàn bộ liên kết channel trong cùng một transaction.
// Transaction bảo đảm không tồn tại rule nửa vời khi một channel không hợp lệ.
func (r *Repository) CreateRule(ctx context.Context, rule *AlertRule) error {
	channelIDs := uniqueStrings(rule.ChannelIDs)
	if len(channelIDs) == 0 {
		return ErrInvalidChannelSelection
	}

	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin create alert rule transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var validChannelCount int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(DISTINCT id)
		FROM alert_channels
		WHERE user_id = $1
		  AND enabled = true
		  AND id::text = ANY($2::text[])
	`, rule.UserID, channelIDs).Scan(&validChannelCount); err != nil {
		return fmt.Errorf("validate alert channels: %w", err)
	}
	if validChannelCount != len(channelIDs) {
		return ErrInvalidChannelSelection
	}

	if err := tx.QueryRow(ctx, `
		INSERT INTO alert_rules (
			user_id,
			name,
			metric,
			operator,
			threshold,
			duration_minutes,
			server_id,
			enabled
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, updated_at
	`,
		rule.UserID,
		rule.Name,
		rule.Metric,
		rule.Operator,
		rule.Threshold,
		rule.DurationMinutes,
		rule.ServerID,
		rule.Enabled,
	).Scan(&rule.ID, &rule.CreatedAt, &rule.UpdatedAt); err != nil {
		return fmt.Errorf("insert alert rule: %w", err)
	}

	for _, channelID := range channelIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO alert_rule_channels (alert_rule_id, alert_channel_id)
			VALUES ($1, $2)
		`, rule.ID, channelID); err != nil {
			return fmt.Errorf("link alert rule to channel: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit alert rule: %w", err)
	}

	rule.ChannelIDs = channelIDs
	channels, err := r.listRuleChannels(ctx, rule.ID, rule.UserID)
	if err != nil {
		return err
	}
	rule.Channels = channels
	return nil
}

// DeleteRule xóa rule thuộc user. Quan hệ alert_rule_channels được cascade tự động.
func (r *Repository) DeleteRule(ctx context.Context, id, userID string) error {
	_, err := r.db.Pool.Exec(ctx, `
		DELETE FROM alert_rules
		WHERE id = $1 AND user_id = $2
	`, id, userID)
	if err != nil {
		return fmt.Errorf("delete alert rule: %w", err)
	}
	return nil
}

// ListChannels trả toàn bộ notification channel thuộc user để quản lý và chọn khi tạo rule.
func (r *Repository) ListChannels(ctx context.Context, userID string) ([]AlertChannel, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT
			c.id,
			c.user_id,
			c.name,
			c.type,
			c.config,
			c.enabled,
			(
				SELECT COUNT(*)
				FROM alert_rule_channels arc
				JOIN alert_rules r ON r.id = arc.alert_rule_id
				WHERE arc.alert_channel_id = c.id
				  AND r.user_id = c.user_id
			)::int AS usage_count,
			c.created_at,
			c.updated_at
		FROM alert_channels c
		WHERE c.user_id = $1
		ORDER BY c.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list alert channels: %w", err)
	}
	defer rows.Close()

	channels := make([]AlertChannel, 0)
	for rows.Next() {
		var channel AlertChannel
		var configBytes []byte
		if err := rows.Scan(
			&channel.ID,
			&channel.UserID,
			&channel.Name,
			&channel.Type,
			&configBytes,
			&channel.Enabled,
			&channel.UsageCount,
			&channel.CreatedAt,
			&channel.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan alert channel: %w", err)
		}

		channel.Config = make(map[string]interface{})
		if err := json.Unmarshal(configBytes, &channel.Config); err != nil {
			return nil, fmt.Errorf("decode alert channel config: %w", err)
		}
		channels = append(channels, channel)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate alert channels: %w", err)
	}
	return channels, nil
}

// CreateChannel lưu một notification channel mới và trả ID/timestamps vừa tạo.
func (r *Repository) CreateChannel(ctx context.Context, channel *AlertChannel) error {
	configBytes, err := json.Marshal(channel.Config)
	if err != nil {
		return fmt.Errorf("encode alert channel config: %w", err)
	}

	if err := r.db.Pool.QueryRow(ctx, `
		INSERT INTO alert_channels (user_id, name, type, config, enabled)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at
	`,
		channel.UserID,
		channel.Name,
		channel.Type,
		configBytes,
		channel.Enabled,
	).Scan(&channel.ID, &channel.CreatedAt, &channel.UpdatedAt); err != nil {
		return fmt.Errorf("create alert channel: %w", err)
	}
	return nil
}

// DeleteChannel xóa channel trong transaction.
// Hàm chỉ chặn khi có rule hợp lệ của chính user đang dùng channel.
// Các liên kết sai tenant từ dữ liệu cũ được dọn trước khi kiểm tra để tránh báo nhầm CHANNEL_IN_USE.
func (r *Repository) DeleteChannel(ctx context.Context, id, userID string) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin delete alert channel transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var lockedChannelID string
	if err := tx.QueryRow(ctx, `
		SELECT id
		FROM alert_channels
		WHERE id = $1 AND user_id = $2
		FOR UPDATE
	`, id, userID).Scan(&lockedChannelID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrChannelNotFound
		}
		return fmt.Errorf("lock alert channel: %w", err)
	}

	// Dữ liệu hợp lệ luôn yêu cầu rule và channel thuộc cùng một user.
	// Cleanup này xử lý các liên kết cũ/sai tenant có thể làm khóa ngoại chặn DELETE.
	if _, err := tx.Exec(ctx, `
		DELETE FROM alert_rule_channels arc
		USING alert_rules r
		WHERE arc.alert_rule_id = r.id
		  AND arc.alert_channel_id = $1
		  AND r.user_id IS DISTINCT FROM $2::uuid
	`, id, userID); err != nil {
		return fmt.Errorf("clean invalid alert channel links: %w", err)
	}

	var usageCount int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM alert_rule_channels arc
		JOIN alert_rules r ON r.id = arc.alert_rule_id
		WHERE arc.alert_channel_id = $1
		  AND r.user_id = $2
	`, id, userID).Scan(&usageCount); err != nil {
		return fmt.Errorf("check alert channel usage: %w", err)
	}
	if usageCount > 0 {
		return ErrChannelInUse
	}

	result, err := tx.Exec(ctx, `
		DELETE FROM alert_channels
		WHERE id = $1 AND user_id = $2
	`, id, userID)
	if err != nil {
		return fmt.Errorf("delete alert channel: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrChannelNotFound
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit alert channel deletion: %w", err)
	}
	return nil
}

// listRuleChannels trả danh sách channel tối giản của một rule sau khi tạo.
func (r *Repository) listRuleChannels(ctx context.Context, ruleID, userID string) ([]AlertRuleChannel, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT c.id, c.name, c.type, c.enabled
		FROM alert_rule_channels arc
		JOIN alert_rules r ON r.id = arc.alert_rule_id
		JOIN alert_channels c ON c.id = arc.alert_channel_id
		WHERE arc.alert_rule_id = $1
		  AND r.user_id = $2
		ORDER BY c.name ASC
	`, ruleID, userID)
	if err != nil {
		return nil, fmt.Errorf("list channels for alert rule: %w", err)
	}
	defer rows.Close()

	channels := make([]AlertRuleChannel, 0)
	for rows.Next() {
		var channel AlertRuleChannel
		if err := rows.Scan(&channel.ID, &channel.Name, &channel.Type, &channel.Enabled); err != nil {
			return nil, fmt.Errorf("scan channel for alert rule: %w", err)
		}
		channels = append(channels, channel)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate channels for alert rule: %w", err)
	}
	return channels, nil
}

// uniqueStrings loại bỏ ID trùng lặp và chuỗi rỗng trước khi kiểm tra database.
func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}
