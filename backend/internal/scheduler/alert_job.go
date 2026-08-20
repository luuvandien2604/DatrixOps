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

	title, dashboardMessage, notifSet := buildAlertNotification(rule, serverName, currentValue, true)
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
	j.sendNotifications(channels, notifSet)
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

	title, dashboardMessage, _ := buildAlertNotification(rule, serverName, currentValue, false)
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
	// Do not send resolved notifications to external channels (Telegram, Discord, Email) to reduce noise.
	// j.sendNotifications(channels, notifSet)
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

type alertNotificationSet struct {
	telegramMessage string
	discordEmbed    notifier.DiscordEmbed
	emailSubject    string
	emailHTML       string
}

// buildAlertNotification tạo nội dung thông báo chuẩn hóa cho Telegram, Discord Embed và Email HTML.
func buildAlertNotification(rule alert.AlertRule, serverName string, currentValue float64, isFiring bool) (string, string, alertNotificationSet) {
	metricName := metricLabel(rule.Metric)
	nowStr := time.Now().UTC().Format("2006-01-02 15:04:05 UTC")

	if rule.Metric == "status" {
		if isFiring {
			title := "Server offline: " + serverName
			dashMsg := fmt.Sprintf("Agent %s has stopped reporting heartbeat for > 1m.", serverName)
			teleMsg := fmt.Sprintf(
				"<b>[DATRIXOPS ALERT] SERVER OFFLINE</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Status:</b> <b>Offline / Heartbeat Lost</b>\n<b>Condition:</b> No heartbeat received (&gt; 1m)\n<b>Time:</b> %s",
				serverName, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       "[DATRIXOPS ALERT] SERVER OFFLINE: " + serverName,
				Description: fmt.Sprintf("Agent **%s** has stopped reporting heartbeat telemetry.", serverName),
				Color:       0xEF4444,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Status", Value: "Offline / Unreachable", Inline: true},
					{Name: "Condition", Value: "No heartbeat (> 1m)", Inline: true},
					{Name: "Triggered At", Value: nowStr, Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := "[DATRIXOPS ALERT] Server Offline: " + serverName
			emailHTML := renderAlertEmail(serverName, "Server Offline Alert", "Heartbeat Status", "Offline", "No heartbeat > 1m", nowStr, true)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		} else {
			title := "Server online: " + serverName
			dashMsg := fmt.Sprintf("Agent %s is reporting heartbeat data again.", serverName)
			teleMsg := fmt.Sprintf(
				"<b>[DATRIXOPS ALERT] SERVER ONLINE</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Status:</b> <b>Online / Connected</b>\n<b>Time:</b> %s",
				serverName, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       "[DATRIXOPS ALERT] SERVER ONLINE: " + serverName,
				Description: fmt.Sprintf("Agent **%s** is back online.", serverName),
				Color:       0x10B981,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Status", Value: "Online / Connected", Inline: true},
					{Name: "Triggered At", Value: nowStr, Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := "[DATRIXOPS RESOLVED] Server Online: " + serverName
			emailHTML := renderAlertEmail(serverName, "Server Online Recovered", "Heartbeat Status", "Online", "Reporting telemetry", nowStr, false)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		}
	}

	if isFiring {
		title := "Alert firing: " + rule.Name
		dashMsg := fmt.Sprintf("%s on %s is %.2f%% (%s %.2f%%).", metricName, serverName, currentValue, rule.Operator, rule.Threshold)
		teleMsg := fmt.Sprintf(
			"<b>[DATRIXOPS ALERT] CRITICAL FIRING</b>\n─────────────────────────────\n<b>Rule:</b> <b>%s</b>\n<b>Server:</b> <code>%s</code>\n<b>Metric:</b> %s\n<b>Current Value:</b> <code>%.2f%%</code> (Threshold: %s %.2f%%, Duration: &gt; %dm)\n<b>Time:</b> %s",
			rule.Name, serverName, metricName, currentValue, rule.Operator, rule.Threshold, rule.DurationMinutes, nowStr,
		)
		discord := notifier.DiscordEmbed{
			Title:       fmt.Sprintf("[DATRIXOPS ALERT] %s", rule.Name),
			Description: fmt.Sprintf("Threshold breached on **%s**.", serverName),
			Color:       0xEF4444,
			Fields: []notifier.DiscordEmbedField{
				{Name: "Server", Value: serverName, Inline: true},
				{Name: "Metric", Value: metricName, Inline: true},
				{Name: "Current Value", Value: fmt.Sprintf("**%.2f%%**", currentValue), Inline: true},
				{Name: "Condition", Value: fmt.Sprintf("%s %.2f%% (> %dm)", rule.Operator, rule.Threshold, rule.DurationMinutes), Inline: true},
				{Name: "Triggered At", Value: nowStr, Inline: true},
			},
			Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
		}
		emailSubj := fmt.Sprintf("[DATRIXOPS ALERT] Firing: %s on %s", rule.Name, serverName)
		emailHTML := renderAlertEmail(serverName, rule.Name, metricName, fmt.Sprintf("%.2f%%", currentValue), fmt.Sprintf("%s %.2f%%", rule.Operator, rule.Threshold), nowStr, true)
		return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
	}

	// Resolved
	title := "Alert resolved: " + rule.Name
	dashMsg := fmt.Sprintf("%s on %s returned to %.2f%%.", metricName, serverName, currentValue)
	teleMsg := fmt.Sprintf(
		"<b>[DATRIXOPS ALERT] RESOLVED OK</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Rule:</b> <b>%s</b>\n<b>Metric:</b> %s\n<b>Current Value:</b> <code>%.2f%%</code> (Normal)\n<b>Timestamp:</b> %s\n─────────────────────────────\n<b>Control Plane:</b> Status Normal",
		serverName, rule.Name, metricName, currentValue, nowStr,
	)
	discord := notifier.DiscordEmbed{
		Title:       fmt.Sprintf("[DATRIXOPS ALERT] RESOLVED OK: %s", rule.Name),
		Description: fmt.Sprintf("Metric has returned to normal operational limits on server **%s**.", serverName),
		Color:       0x10B981,
		Fields: []notifier.DiscordEmbedField{
			{Name: "Server", Value: serverName, Inline: true},
			{Name: "Metric", Value: metricName, Inline: true},
			{Name: "Current Value", Value: fmt.Sprintf("%.2f%%", currentValue), Inline: true},
			{Name: "Status", Value: "Resolved / Healthy", Inline: true},
			{Name: "Timestamp", Value: nowStr, Inline: false},
		},
		Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Infrastructure Monitoring"},
	}
	emailSubj := fmt.Sprintf("[DATRIXOPS RESOLVED] %s on %s", rule.Name, serverName)
	emailHTML := renderAlertEmail(serverName, rule.Name, metricName, fmt.Sprintf("%.2f%%", currentValue), "Normal", nowStr, false)
	return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
}

func renderAlertEmail(server, rule, metric, value, threshold, timestamp string, isCritical bool) string {
	statusBg := "#EF4444"
	statusText := "CRITICAL ALERT"
	if !isCritical {
		statusBg = "#10B981"
		statusText = "RESOLVED"
	}

	tmpl := `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 24px; }
.card { max-width: 560px; margin: 0 auto; background: #131b2e; border: 1px solid #232f48; border-radius: 12px; overflow: hidden; }
.header { padding: 20px 24px; background: #1a243b; border-bottom: 1px solid #232f48; display: flex; align-items: center; justify-content: space-between; }
.brand { font-size: 14px; font-weight: 700; letter-spacing: 1px; color: #ffffff; }
.badge { background: {{STATUS_BG}}; color: #ffffff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; }
.content { padding: 24px; }
.title { font-size: 18px; font-weight: 700; color: #ffffff; margin: 0 0 16px 0; }
.table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.table td { padding: 10px 0; border-bottom: 1px solid #1e293b; font-size: 13px; }
.label { color: #94a3b8; width: 35%; }
.val { color: #f1f5f9; font-weight: 600; font-family: monospace; }
.footer { padding: 16px 24px; background: #0e1526; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <span class="brand">DATRIXOPS MONITORING</span>
    <span class="badge">{{STATUS_TEXT}}</span>
  </div>
  <div class="content">
    <div class="title">{{RULE_NAME}}</div>
    <table class="table">
      <tr><td class="label">Server</td><td class="val">{{SERVER_NAME}}</td></tr>
      <tr><td class="label">Metric</td><td class="val">{{METRIC_NAME}}</td></tr>
      <tr><td class="label">Current Value</td><td class="val">{{VALUE}}</td></tr>
      <tr><td class="label">Condition</td><td class="val">{{CONDITION}}</td></tr>
      <tr><td class="label">Timestamp</td><td class="val">{{TIMESTAMP}}</td></tr>
    </table>
  </div>
  <div class="footer">
    Automated notification sent by DatrixOps Control Plane.
  </div>
</div>
</body>
</html>`

	r := strings.NewReplacer(
		"{{STATUS_BG}}", statusBg,
		"{{STATUS_TEXT}}", statusText,
		"{{RULE_NAME}}", rule,
		"{{SERVER_NAME}}", server,
		"{{METRIC_NAME}}", metric,
		"{{VALUE}}", value,
		"{{CONDITION}}", threshold,
		"{{TIMESTAMP}}", timestamp,
	)
	return r.Replace(tmpl)
}

// metricLabel chuyển mã metric thành nhãn dễ đọc trong notification.
func metricLabel(metric string) string {
	switch metric {
	case "cpu":
		return "CPU Usage"
	case "ram":
		return "Memory Usage"
	case "disk":
		return "Disk Usage"
	default:
		return metric
	}
}

// sendNotifications gửi message tới từng channel đã chọn của rule theo đúng định dạng tối ưu.
func (j *AlertJob) sendNotifications(channels []alert.AlertChannel, notif alertNotificationSet) {
	for _, channel := range channels {
		var err error
		switch channel.Type {
		case "telegram":
			token, _ := channel.Config["bot_token"].(string)
			chatID, _ := channel.Config["chat_id"].(string)
			if token != "" && chatID != "" {
				err = notifier.SendTelegram(token, chatID, notif.telegramMessage)
			}
		case "discord":
			webhookURL, _ := channel.Config["webhook_url"].(string)
			if webhookURL != "" {
				err = notifier.SendDiscordEmbed(webhookURL, notif.discordEmbed)
			}
		case "email":
			err = notifier.SendHTMLEmail(emailConfigFromChannel(channel), notif.emailSubject, notif.emailHTML)
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
