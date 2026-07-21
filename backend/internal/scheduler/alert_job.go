package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/core/alert"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
)

// AlertJob định kỳ đánh giá các alert rule và gửi thông báo qua đúng channel
// đã được liên kết với từng rule.
type AlertJob struct {
	db     *database.DB
	logger *slog.Logger
	stop   chan struct{}
}

// NewAlertJob tạo scheduler đánh giá alert dùng database và logger hiện tại.
func NewAlertJob(db *database.DB, logger *slog.Logger) *AlertJob {
	return &AlertJob{
		db:     db,
		logger: logger.With("component", "AlertJob"),
		stop:   make(chan struct{}),
	}
}

// Start chạy alert job ngay một lần, sau đó lặp lại mỗi 15 giây.
func (j *AlertJob) Start() {
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()

		j.logger.Info("AlertJob started")
		j.run()

		for {
			select {
			case <-ticker.C:
				j.run()
			case <-j.stop:
				j.logger.Info("AlertJob stopped")
				return
			}
		}
	}()
}

// Stop yêu cầu goroutine của alert job kết thúc.
func (j *AlertJob) Stop() {
	close(j.stop)
}

// run tải rule và channel đang bật, sau đó đánh giá từng rule.
// Channel được nhóm theo rule ID, không còn gửi tới tất cả channel của user.
func (j *AlertJob) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rules, err := j.listEnabledRules(ctx)
	if err != nil {
		j.logger.Error("failed to list rules", "error", err)
		return
	}

	channelsByRule, err := j.listEnabledChannelsByRule(ctx)
	if err != nil {
		j.logger.Error("failed to list selected channels", "error", err)
		return
	}

	for _, rule := range rules {
		// Alert state vẫn được đánh giá khi rule cũ chưa có channel liên kết.
		// Trường hợp đó chỉ cập nhật dashboard và không gửi notification.
		j.evaluateRule(ctx, rule, channelsByRule[rule.ID])
	}
}

// listEnabledRules trả toàn bộ rule đang bật trên hệ thống.
func (j *AlertJob) listEnabledRules(ctx context.Context) ([]alert.AlertRule, error) {
	rows, err := j.db.Pool.Query(ctx, `
		SELECT id, user_id, name, metric, operator, threshold, duration_minutes, server_id, enabled
		FROM alert_rules
		WHERE enabled = true
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rules := make([]alert.AlertRule, 0)
	for rows.Next() {
		var rule alert.AlertRule
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
		); err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}
	return rules, rows.Err()
}

// listEnabledChannelsByRule tải đúng các channel đang bật được chọn cho mỗi rule.
// Điều kiện c.user_id = r.user_id bảo vệ tenant isolation ngay trong query scheduler.
func (j *AlertJob) listEnabledChannelsByRule(ctx context.Context) (map[string][]alert.AlertChannel, error) {
	rows, err := j.db.Pool.Query(ctx, `
		SELECT
			arc.alert_rule_id,
			c.id,
			c.user_id,
			c.name,
			c.type,
			c.config,
			c.enabled
		FROM alert_rule_channels arc
		JOIN alert_rules r ON r.id = arc.alert_rule_id
		JOIN alert_channels c ON c.id = arc.alert_channel_id
		WHERE r.enabled = true
		  AND c.enabled = true
		  AND c.user_id = r.user_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	channelsByRule := make(map[string][]alert.AlertChannel)
	for rows.Next() {
		var ruleID string
		var channel alert.AlertChannel
		var configBytes []byte
		if err := rows.Scan(
			&ruleID,
			&channel.ID,
			&channel.UserID,
			&channel.Name,
			&channel.Type,
			&configBytes,
			&channel.Enabled,
		); err != nil {
			return nil, err
		}

		channel.Config = make(map[string]interface{})
		if err := json.Unmarshal(configBytes, &channel.Config); err != nil {
			j.logger.Warn("failed to decode alert channel config", "channel_id", channel.ID, "error", err)
			continue
		}
		channelsByRule[ruleID] = append(channelsByRule[ruleID], channel)
	}
	return channelsByRule, rows.Err()
}

// evaluateRule đánh giá rule trên từng server thuộc cùng user,
// cập nhật alert_state và gửi firing/resolved notification khi state thay đổi.
func (j *AlertJob) evaluateRule(ctx context.Context, rule alert.AlertRule, channels []alert.AlertChannel) {
	query := `SELECT id, name, last_seen_at FROM servers WHERE user_id = $1`
	args := []interface{}{rule.UserID}

	if rule.ServerID != nil {
		query += ` AND id = $2`
		args = append(args, *rule.ServerID)
	}

	rows, err := j.db.Pool.Query(ctx, query, args...)
	if err != nil {
		j.logger.Error("failed to query servers", "rule_id", rule.ID, "error", err)
		return
	}

	type serverSnapshot struct {
		ID       string
		Name     string
		LastSeen *time.Time
	}

	servers := make([]serverSnapshot, 0)
	for rows.Next() {
		var server serverSnapshot
		if err := rows.Scan(&server.ID, &server.Name, &server.LastSeen); err != nil {
			j.logger.Warn("failed to scan alert server", "rule_id", rule.ID, "error", err)
			continue
		}
		servers = append(servers, server)
	}
	rows.Close()

	for _, server := range servers {
		isFiring, currentValue := j.evaluateCondition(ctx, rule, server.ID, server.LastSeen)

		var currentState string
		if err := j.db.Pool.QueryRow(ctx, `
			SELECT status
			FROM alert_state
			WHERE rule_id = $1 AND server_id = $2
		`, rule.ID, server.ID).Scan(&currentState); err != nil {
			currentState = "ok"
		}

		switch {
		case isFiring && currentState == "ok":
			j.handleFiring(ctx, rule, server.ID, server.Name, currentValue, channels)
		case !isFiring && currentState == "firing":
			j.handleResolved(ctx, rule, server.ID, server.Name, currentValue, channels)
		}
	}
}

// evaluateCondition tính giá trị hiện tại và kết luận rule có đang firing hay không.
func (j *AlertJob) evaluateCondition(ctx context.Context, rule alert.AlertRule, serverID string, lastSeen *time.Time) (bool, float64) {
	if rule.Metric == "status" {
		return lastSeen == nil || time.Since(*lastSeen) > time.Minute, 0
	}

	metricExpression := "cpu_usage"
	if rule.Metric == "ram" {
		metricExpression = "memory_used * 100.0 / NULLIF(memory_total, 0)"
	}

	var currentValue float64
	query := fmt.Sprintf(`
		SELECT %s
		FROM server_metrics
		WHERE server_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, metricExpression)
	if err := j.db.Pool.QueryRow(ctx, query, serverID).Scan(&currentValue); err != nil {
		return false, 0
	}

	if rule.Operator == ">" {
		return currentValue > rule.Threshold, currentValue
	}
	if rule.Operator == "<" {
		return currentValue < rule.Threshold, currentValue
	}
	return false, currentValue
}

// handleFiring chuyển alert sang firing và gửi thông báo qua các channel của rule.
func (j *AlertJob) handleFiring(ctx context.Context, rule alert.AlertRule, serverID, serverName string, currentValue float64, channels []alert.AlertChannel) {
	j.logger.Info("Alert firing", "rule", rule.Name, "server", serverName, "channels", len(channels))
	_, _ = j.db.Pool.Exec(ctx, `
		INSERT INTO alert_state (rule_id, server_id, status, last_triggered_at)
		VALUES ($1, $2, 'firing', NOW())
		ON CONFLICT (rule_id, server_id)
		DO UPDATE SET status = 'firing', last_triggered_at = NOW()
	`, rule.ID, serverID)

	message := fmt.Sprintf(
		"🚨 <b>ALERT FIRING</b>\n<b>Rule:</b> %s\n<b>Server:</b> %s\n<b>Value:</b> %.2f",
		rule.Name,
		serverName,
		currentValue,
	)
	if rule.Metric == "status" {
		message = fmt.Sprintf("🚨 <b>SERVER OFFLINE</b>\n<b>Server:</b> %s\nLast seen > 1 min ago.", serverName)
	}
	j.sendNotifications(channels, message)
}

// handleResolved chuyển alert về ok và gửi thông báo phục hồi qua các channel của rule.
func (j *AlertJob) handleResolved(ctx context.Context, rule alert.AlertRule, serverID, serverName string, currentValue float64, channels []alert.AlertChannel) {
	j.logger.Info("Alert resolved", "rule", rule.Name, "server", serverName, "channels", len(channels))
	_, _ = j.db.Pool.Exec(ctx, `
		UPDATE alert_state
		SET status = 'ok', last_triggered_at = NOW()
		WHERE rule_id = $1 AND server_id = $2
	`, rule.ID, serverID)

	message := fmt.Sprintf(
		"✅ <b>ALERT RESOLVED</b>\n<b>Rule:</b> %s\n<b>Server:</b> %s\n<b>Value:</b> %.2f",
		rule.Name,
		serverName,
		currentValue,
	)
	if rule.Metric == "status" {
		message = fmt.Sprintf("✅ <b>SERVER ONLINE</b>\n<b>Server:</b> %s is back online.", serverName)
	}
	j.sendNotifications(channels, message)
}

// sendNotifications gửi message tới từng channel đã chọn của rule.
// Một channel lỗi không chặn các channel còn lại.
func (j *AlertJob) sendNotifications(channels []alert.AlertChannel, message string) {
	for _, channel := range channels {
		switch channel.Type {
		case "telegram":
			token, _ := channel.Config["bot_token"].(string)
			chatID, _ := channel.Config["chat_id"].(string)
			if token != "" && chatID != "" {
				notifier.SendTelegram(token, chatID, message)
			}
		case "discord":
			webhookURL, _ := channel.Config["webhook_url"].(string)
			if webhookURL != "" {
				notifier.SendDiscord(webhookURL, message)
			}
		}
	}
}
