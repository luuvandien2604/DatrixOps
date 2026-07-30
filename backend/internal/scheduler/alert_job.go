package scheduler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/luuvandien2604/DatrixOps/backend/internal/core/alert"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/webhook"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
)

// AlertJob định kỳ đánh giá alert rule, ghi notification lên Dashboard
// và gửi thông báo ra đúng channel được liên kết với từng rule.
type AlertJob struct {
	db         *database.DB
	logger     *slog.Logger
	stop       chan struct{}
	dispatcher *webhook.Dispatcher
}

// NewAlertJob tạo scheduler đánh giá alert dùng database và logger hiện tại.
func NewAlertJob(db *database.DB, logger *slog.Logger) *AlertJob {
	return &AlertJob{
		db:         db,
		logger:     logger.With("component", "AlertJob"),
		stop:       make(chan struct{}),
		dispatcher: webhook.NewDispatcher(db),
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
		// Dashboard notification vẫn được ghi ngay cả khi rule không có external channel.
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

// listEnabledChannelsByRule tải đúng channel đang bật được chọn cho mỗi rule.
// Điều kiện c.user_id = r.user_id bảo vệ tenant isolation ngay trong query.
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

// evaluateRule đánh giá rule trên một agent cụ thể hoặc toàn bộ agent của user.
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
		isFiring, currentValue, hasData := j.evaluateCondition(ctx, rule, server.ID, server.LastSeen)
		if !hasData {
			// Missing telemetry is not a numeric zero and must not auto-resolve
			// an existing incident. Dedicated no-data rules are handled separately.
			continue
		}
		if isFiring {
			ready, err := j.conditionSatisfiedLongEnough(ctx, rule, server.ID)
			if err != nil {
				j.logger.Warn("failed to persist pending alert condition", "rule_id", rule.ID, "server_id", server.ID, "error", err)
				continue
			}
			if !ready {
				continue
			}
			j.handleFiring(ctx, rule, server.ID, server.Name, currentValue, channels)
			continue
		}
		j.handleResolved(ctx, rule, server.ID, server.Name, currentValue, channels)
	}
}

// evaluateCondition tính giá trị hiện tại và kết luận rule có đang firing hay không.
func (j *AlertJob) evaluateCondition(ctx context.Context, rule alert.AlertRule, serverID string, lastSeen *time.Time) (bool, float64, bool) {
	if rule.Metric == "status" {
		return lastSeen == nil || time.Since(*lastSeen) > time.Minute, 0, true
	}

	metricExpression := "cpu_usage"
	if rule.Metric == "ram" {
		metricExpression = "memory_used * 100.0 / NULLIF(memory_total, 0)"
	}
	if rule.Metric == "disk" {
		var currentValue float64
		if err := j.db.Pool.QueryRow(ctx, `
			SELECT NULLIF(os_info->>'disk_usage', '')::double precision
			FROM servers
			WHERE id = $1
		`, serverID).Scan(&currentValue); err != nil {
			return false, 0, false
		}
		return compareAlertValue(rule.Operator, currentValue, rule.Threshold), currentValue, true
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
		return false, 0, false
	}

	return compareAlertValue(rule.Operator, currentValue, rule.Threshold), currentValue, true
}

func compareAlertValue(operator string, currentValue, threshold float64) bool {
	switch operator {
	case ">":
		return currentValue > threshold
	case "<":
		return currentValue < threshold
	default:
		return false
	}
}

// conditionSatisfiedLongEnough stores the first observation of a problem.
// This makes duration semantics durable across worker restarts.
func (j *AlertJob) conditionSatisfiedLongEnough(ctx context.Context, rule alert.AlertRule, serverID string) (bool, error) {
	var status string
	var startedAt time.Time
	err := j.db.Pool.QueryRow(ctx, `
		INSERT INTO alert_state (rule_id, server_id, status, condition_started_at)
		VALUES ($1, $2, 'pending', NOW())
		ON CONFLICT (rule_id, server_id)
		DO UPDATE SET
			status = CASE
				WHEN alert_state.status = 'firing' THEN 'firing'
				ELSE 'pending'
			END,
			condition_started_at = COALESCE(alert_state.condition_started_at, NOW())
		RETURNING status, condition_started_at
	`, rule.ID, serverID).Scan(&status, &startedAt)
	if err != nil {
		return false, err
	}
	if status == "firing" {
		return true, nil
	}
	return !time.Now().Before(startedAt.Add(time.Duration(rule.DurationMinutes) * time.Minute)), nil
}

// handleFiring chuyển state sang firing đúng một lần, tạo dashboard notification,
// commit transaction rồi mới gửi external notification.
func (j *AlertJob) handleFiring(ctx context.Context, rule alert.AlertRule, serverID, serverName string, currentValue float64, channels []alert.AlertChannel) {
	tx, err := j.db.Pool.Begin(ctx)
	if err != nil {
		j.logger.Error("failed to begin firing transition", "rule_id", rule.ID, "server_id", serverID, "error", err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	result, err := tx.Exec(ctx, `
		INSERT INTO alert_state (rule_id, server_id, status, last_triggered_at)
		VALUES ($1, $2, 'firing', NOW())
		ON CONFLICT (rule_id, server_id)
		DO UPDATE SET
			status = 'firing',
			last_triggered_at = NOW(),
			condition_started_at = COALESCE(alert_state.condition_started_at, NOW())
		WHERE alert_state.status IS DISTINCT FROM 'firing'
	`, rule.ID, serverID)
	if err != nil {
		j.logger.Error("failed to update firing state", "rule_id", rule.ID, "server_id", serverID, "error", err)
		return
	}

	// RowsAffected = 0 nghĩa là alert đã firing từ vòng scheduler trước.
	if result.RowsAffected() == 0 {
		return
	}

	title, dashboardMessage, externalMessage := firingMessages(rule, serverName, currentValue)
	metadata, _ := json.Marshal(map[string]interface{}{
		"metric":        rule.Metric,
		"operator":      rule.Operator,
		"threshold":     rule.Threshold,
		"current_value": currentValue,
	})

	if _, err := tx.Exec(ctx, `
		INSERT INTO dashboard_notifications (
			user_id,
			alert_rule_id,
			server_id,
			kind,
			severity,
			title,
			message,
			metadata
		)
		VALUES ($1, $2, $3, 'alert_firing', 'critical', $4, $5, $6)
	`, rule.UserID, rule.ID, serverID, title, dashboardMessage, metadata); err != nil {
		j.logger.Error("failed to create firing notification", "rule_id", rule.ID, "server_id", serverID, "error", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		j.logger.Error("failed to commit firing transition", "rule_id", rule.ID, "server_id", serverID, "error", err)
		return
	}

	j.logger.Info("Alert firing", "rule", rule.Name, "server", serverName, "channels", len(channels))
	j.sendNotifications(channels, externalMessage)
	j.dispatchAlertWebhook(rule, serverID, serverName, currentValue, "firing")
}

// handleResolved chỉ chạy khi state trước đó là firing, sau đó ghi notification phục hồi.
func (j *AlertJob) handleResolved(ctx context.Context, rule alert.AlertRule, serverID, serverName string, currentValue float64, channels []alert.AlertChannel) {
	tx, err := j.db.Pool.Begin(ctx)
	if err != nil {
		j.logger.Error("failed to begin resolved transition", "rule_id", rule.ID, "server_id", serverID, "error", err)
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var previousStatus string
	if err := tx.QueryRow(ctx, `
		SELECT status
		FROM alert_state
		WHERE rule_id = $1 AND server_id = $2
		FOR UPDATE
	`, rule.ID, serverID).Scan(&previousStatus); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return
		}
		j.logger.Error("failed to read alert state", "rule_id", rule.ID, "server_id", serverID, "error", err)
		return
	}

	_, err = tx.Exec(ctx, `
		UPDATE alert_state
		SET status = 'ok',
		    condition_started_at = NULL,
		    last_triggered_at = CASE WHEN status = 'firing' THEN NOW() ELSE last_triggered_at END
		WHERE rule_id = $1
		  AND server_id = $2
	`, rule.ID, serverID)
	if err != nil {
		j.logger.Error("failed to update resolved state", "rule_id", rule.ID, "server_id", serverID, "error", err)
		return
	}
	if previousStatus != "firing" {
		if err := tx.Commit(ctx); err != nil {
			j.logger.Error("failed to reset pending alert state", "rule_id", rule.ID, "server_id", serverID, "error", err)
		}
		return
	}

	title, dashboardMessage, externalMessage := resolvedMessages(rule, serverName, currentValue)
	metadata, _ := json.Marshal(map[string]interface{}{
		"metric":        rule.Metric,
		"operator":      rule.Operator,
		"threshold":     rule.Threshold,
		"current_value": currentValue,
	})

	if _, err := tx.Exec(ctx, `
		INSERT INTO dashboard_notifications (
			user_id,
			alert_rule_id,
			server_id,
			kind,
			severity,
			title,
			message,
			metadata
		)
		VALUES ($1, $2, $3, 'alert_resolved', 'resolved', $4, $5, $6)
	`, rule.UserID, rule.ID, serverID, title, dashboardMessage, metadata); err != nil {
		j.logger.Error("failed to create resolved notification", "rule_id", rule.ID, "server_id", serverID, "error", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		j.logger.Error("failed to commit resolved transition", "rule_id", rule.ID, "server_id", serverID, "error", err)
		return
	}

	j.logger.Info("Alert resolved", "rule", rule.Name, "server", serverName, "channels", len(channels))
	j.sendNotifications(channels, externalMessage)
	j.dispatchAlertWebhook(rule, serverID, serverName, currentValue, "resolved")
}

func (j *AlertJob) dispatchAlertWebhook(rule alert.AlertRule, serverID, serverName string, currentValue float64, transition string) {
	eventType := ""
	switch {
	case rule.Metric == "status" && transition == "firing":
		eventType = "server.offline"
	case rule.Metric == "status" && transition == "resolved":
		eventType = "server.online"
	case (rule.Metric == "cpu" || rule.Metric == "ram") && transition == "firing":
		eventType = "server.degraded"
	default:
		return
	}

	payload := webhook.EventPayload{
		Test: false,
		Resource: map[string]any{
			"type":      "server",
			"id":        serverID,
			"name":      serverName,
			"workspace": rule.UserID,
		},
		Alert: map[string]any{
			"rule_id":          rule.ID,
			"rule_name":        rule.Name,
			"metric":           rule.Metric,
			"operator":         rule.Operator,
			"threshold":        rule.Threshold,
			"duration_minutes": rule.DurationMinutes,
			"transition":       transition,
		},
		Metrics: map[string]any{
			"current_value": currentValue,
			"unit":          "%",
		},
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		if err := j.dispatcher.Dispatch(ctx, rule.UserID, eventType, payload); err != nil {
			j.logger.Warn("failed to dispatch system webhook", "event", eventType, "rule_id", rule.ID, "server_id", serverID, "error", err)
		}
	}()
}

// firingMessages tạo nội dung riêng cho Dashboard và external channel.
func firingMessages(rule alert.AlertRule, serverName string, currentValue float64) (string, string, string) {
	if rule.Metric == "status" {
		return "Server offline: " + serverName,
			fmt.Sprintf("Agent %s has not reported a heartbeat for more than one minute.", serverName),
			fmt.Sprintf("🚨 <b>SERVER OFFLINE</b>\n<b>Server:</b> %s\nLast seen > 1 min ago.", serverName)
	}

	title := "Alert firing: " + rule.Name
	dashboardMessage := fmt.Sprintf(
		"%s on %s is %.2f%% (%s %.2f%%).",
		metricLabel(rule.Metric),
		serverName,
		currentValue,
		rule.Operator,
		rule.Threshold,
	)
	externalMessage := fmt.Sprintf(
		"🚨 <b>ALERT FIRING</b>\n<b>Rule:</b> %s\n<b>Server:</b> %s\n<b>Value:</b> %.2f%%",
		rule.Name,
		serverName,
		currentValue,
	)
	return title, dashboardMessage, externalMessage
}

// resolvedMessages tạo nội dung phục hồi cho Dashboard và external channel.
func resolvedMessages(rule alert.AlertRule, serverName string, currentValue float64) (string, string, string) {
	if rule.Metric == "status" {
		return "Server online: " + serverName,
			fmt.Sprintf("Agent %s is reporting heartbeat data again.", serverName),
			fmt.Sprintf("✅ <b>SERVER ONLINE</b>\n<b>Server:</b> %s is back online.", serverName)
	}

	title := "Alert resolved: " + rule.Name
	dashboardMessage := fmt.Sprintf(
		"%s on %s returned to %.2f%%.",
		metricLabel(rule.Metric),
		serverName,
		currentValue,
	)
	externalMessage := fmt.Sprintf(
		"✅ <b>ALERT RESOLVED</b>\n<b>Rule:</b> %s\n<b>Server:</b> %s\n<b>Value:</b> %.2f%%",
		rule.Name,
		serverName,
		currentValue,
	)
	return title, dashboardMessage, externalMessage
}

// metricLabel chuyển mã metric thành nhãn dễ đọc trong notification.
func metricLabel(metric string) string {
	switch metric {
	case "cpu":
		return "CPU usage"
	case "ram":
		return "Memory usage"
	case "disk":
		return "Disk usage"
	default:
		return metric
	}
}

// sendNotifications gửi message tới từng channel đã chọn của rule.
// Một channel lỗi không chặn các channel còn lại.
func (j *AlertJob) sendNotifications(channels []alert.AlertChannel, message string) {
	for _, channel := range channels {
		var err error
		switch channel.Type {
		case "telegram":
			token, _ := channel.Config["bot_token"].(string)
			chatID, _ := channel.Config["chat_id"].(string)
			if token != "" && chatID != "" {
				err = notifier.SendTelegram(token, chatID, message)
			}
		case "discord":
			webhookURL, _ := channel.Config["webhook_url"].(string)
			if webhookURL != "" {
				err = notifier.SendDiscord(webhookURL, message)
			}
		case "email":
			err = notifier.SendEmail(emailConfigFromChannel(channel), alertEmailSubject(message), alertEmailBody(message))
		}
		if err != nil {
			j.logger.Warn("failed to send alert notification", "channel_id", channel.ID, "channel_type", channel.Type, "error", err)
		}
	}
}

func emailConfigFromChannel(channel alert.AlertChannel) notifier.EmailConfig {
	port := 587
	switch value := channel.Config["smtp_port"].(type) {
	case float64:
		if value >= 1 && value <= 65535 {
			port = int(value)
		}
	case int:
		if value >= 1 && value <= 65535 {
			port = value
		}
	}
	useTLS := false
	if rawTLS, ok := channel.Config["use_tls"].(bool); ok {
		useTLS = rawTLS
	}
	stringValue := func(key string) string {
		value, _ := channel.Config[key].(string)
		return value
	}
	return notifier.EmailConfig{
		Host:     stringValue("smtp_host"),
		Port:     port,
		Username: stringValue("username"),
		Password: stringValue("password"),
		From:     stringValue("from"),
		To:       stringValue("to"),
		UseTLS:   useTLS,
	}
}

func alertEmailSubject(message string) string {
	plain := alertEmailBody(message)
	switch {
	case strings.Contains(plain, "SERVER OFFLINE"):
		return "DatrixOps alert: server offline"
	case strings.Contains(plain, "SERVER ONLINE"):
		return "DatrixOps resolved: server online"
	case strings.Contains(plain, "ALERT RESOLVED"):
		return "DatrixOps alert resolved"
	default:
		return "DatrixOps alert firing"
	}
}

func alertEmailBody(message string) string {
	replacements := map[string]string{
		"<b>":   "",
		"</b>":  "",
		"&lt;":  "<",
		"&gt;":  ">",
		"&amp;": "&",
	}
	body := message
	for old, next := range replacements {
		body = strings.ReplaceAll(body, old, next)
	}
	return body
}
