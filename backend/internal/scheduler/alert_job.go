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
		SELECT id, user_id, name, metric, operator, threshold, duration_minutes, COALESCE(repeat_interval_minutes, 0), target_name, server_id, enabled
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
			&rule.RepeatIntervalMinutes,
			&rule.TargetName,
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
	query := `SELECT id, name, last_seen_at FROM servers WHERE user_id = $1 AND enrolled_at IS NOT NULL AND bootstrap_completed_at IS NOT NULL AND deletion_status IS NULL`
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
		if lastSeen == nil {
			return false, 0, false
		}
		durationMinutes := rule.DurationMinutes
		if durationMinutes < 1 {
			durationMinutes = 1
		}
		thresholdDuration := time.Duration(durationMinutes) * time.Minute
		return time.Since(*lastSeen) >= thresholdDuration, 0, true
	}

	if rule.Metric == "container" {
		var snapshotJSON []byte
		err := j.db.Pool.QueryRow(ctx, `SELECT snapshot FROM servers WHERE id = $1`, serverID).Scan(&snapshotJSON)
		if err != nil {
			if rule.TargetName != nil && *rule.TargetName != "" {
				return true, 0, true
			}
			return false, 0, false
		}
		target := ""
		if rule.TargetName != nil {
			target = *rule.TargetName
		}
		return evaluateContainerCondition(target, snapshotJSON)
	}

	if rule.Metric == "service" {
		var snapshotJSON []byte
		err := j.db.Pool.QueryRow(ctx, `SELECT snapshot FROM servers WHERE id = $1`, serverID).Scan(&snapshotJSON)
		if err != nil {
			if rule.TargetName != nil && *rule.TargetName != "" {
				return true, 0, true
			}
			return false, 0, false
		}
		target := ""
		if rule.TargetName != nil {
			target = *rule.TargetName
		}
		return evaluateServiceCondition(target, snapshotJSON)
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

	// For status, container, and service rules, trigger immediately once condition is satisfied
	if rule.Metric == "status" || rule.Metric == "container" || rule.Metric == "service" {
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
		INSERT INTO alert_state (rule_id, server_id, status, last_triggered_at, last_notified_at)
		VALUES ($1, $2, 'firing', NOW(), NOW())
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
		_ = tx.Rollback(ctx)
		// Check if periodic reminder should be sent
		if rule.RepeatIntervalMinutes > 0 {
			var lastNotified *time.Time
			var condStarted *time.Time
			err := j.db.Pool.QueryRow(ctx, `
				SELECT last_notified_at, condition_started_at
				FROM alert_state
				WHERE rule_id = $1 AND server_id = $2
			`, rule.ID, serverID).Scan(&lastNotified, &condStarted)
			if err == nil {
				if lastNotified == nil || time.Since(*lastNotified) >= time.Duration(rule.RepeatIntervalMinutes)*time.Minute {
					_, _ = j.db.Pool.Exec(ctx, `
						UPDATE alert_state
						SET last_notified_at = NOW()
						WHERE rule_id = $1 AND server_id = $2
					`, rule.ID, serverID)

					activeDuration := time.Duration(0)
					if condStarted != nil {
						activeDuration = time.Since(*condStarted)
					}
					_, _, notifSet := buildAlertNotification(rule, serverName, currentValue, true, activeDuration, true)
					j.logger.Info("Alert reminder sent", "rule", rule.Name, "server", serverName, "repeat_minutes", rule.RepeatIntervalMinutes)
					j.sendNotifications(channels, notifSet)
				}
			}
		}
		return
	}

	title, dashboardMessage, notifSet := buildAlertNotification(rule, serverName, currentValue, true, 0, false)
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
	var conditionStartedAt *time.Time
	if err := tx.QueryRow(ctx, `
		SELECT status, condition_started_at
		FROM alert_state
		WHERE rule_id = $1 AND server_id = $2
		FOR UPDATE
	`, rule.ID, serverID).Scan(&previousStatus, &conditionStartedAt); err != nil {
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
		    last_notified_at = NULL,
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

	downtimeDuration := time.Duration(0)
	if conditionStartedAt != nil {
		downtimeDuration = time.Since(*conditionStartedAt)
	}

	title, dashboardMessage, notifSet := buildAlertNotification(rule, serverName, currentValue, false, downtimeDuration, false)
	metadata, _ := json.Marshal(map[string]interface{}{
		"metric":            rule.Metric,
		"operator":          rule.Operator,
		"threshold":         rule.Threshold,
		"current_value":     currentValue,
		"downtime_duration": formatDuration(downtimeDuration),
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

	j.logger.Info("Alert resolved", "rule", rule.Name, "server", serverName, "channels", len(channels), "downtime", formatDuration(downtimeDuration))
	// Send resolved notifications to external channels (Telegram, Discord, Email)
	j.sendNotifications(channels, notifSet)
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

func formatDuration(d time.Duration) string {
	if d <= 0 {
		return "0s"
	}
	d = d.Round(time.Second)
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	minutes := int(d.Minutes()) % 60
	seconds := int(d.Seconds()) % 60

	if days > 0 {
		if minutes > 0 {
			return fmt.Sprintf("%dd %dh %dm", days, hours, minutes)
		}
		return fmt.Sprintf("%dd %dh", days, hours)
	}
	if hours > 0 {
		if seconds > 0 {
			return fmt.Sprintf("%dh %dm %ds", hours, minutes, seconds)
		}
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	if minutes > 0 {
		if seconds > 0 {
			return fmt.Sprintf("%dm %ds", minutes, seconds)
		}
		return fmt.Sprintf("%dm", minutes)
	}
	return fmt.Sprintf("%ds", seconds)
}

func buildAlertNotification(rule alert.AlertRule, serverName string, currentValue float64, isFiring bool, downtimeDuration time.Duration, isReminder bool) (string, string, alertNotificationSet) {
	metricName := metricLabel(rule.Metric)
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		loc = time.FixedZone("ICT", 7*3600)
	}
	nowStr := time.Now().In(loc).Format("2006-01-02 15:04:05 (GMT+7)")
	downtimeStr := formatDuration(downtimeDuration)

	target := ""
	if rule.TargetName != nil && *rule.TargetName != "" {
		target = *rule.TargetName
	}

	// 1. STATUS (OFFLINE / ONLINE)
	if rule.Metric == "status" {
		if isFiring {
			if isReminder {
				title := "[REMINDER] Server offline: " + serverName
				dashMsg := fmt.Sprintf("Agent %s is still OFFLINE (active for %s).", serverName, downtimeStr)
				teleMsg := fmt.Sprintf(
					"<b>[DATRIXOPS REMINDER] SERVER OFFLINE</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Status:</b> <b>Offline / Heartbeat Lost</b>\n<b>Duration Active:</b> <code>%s</code>\n<b>Reminder Interval:</b> Every %dm\n<b>Time:</b> %s",
					serverName, downtimeStr, rule.RepeatIntervalMinutes, nowStr,
				)
				discord := notifier.DiscordEmbed{
					Title:       "[DATRIXOPS REMINDER] SERVER STILL OFFLINE: " + serverName,
					Description: fmt.Sprintf("Agent **%s** has been offline for **%s**.", serverName, downtimeStr),
					Color:       0xF59E0B,
					Fields: []notifier.DiscordEmbedField{
						{Name: "Server", Value: serverName, Inline: true},
						{Name: "Status", Value: "Offline / Unreachable", Inline: true},
						{Name: "Duration Active", Value: downtimeStr, Inline: true},
						{Name: "Reminder Every", Value: fmt.Sprintf("%d minutes", rule.RepeatIntervalMinutes), Inline: true},
						{Name: "Timestamp", Value: nowStr, Inline: false},
					},
					Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring Reminder"},
				}
				emailSubj := fmt.Sprintf("[DATRIXOPS REMINDER] Server Offline (%s): %s", downtimeStr, serverName)
				emailHTML := renderAlertEmail(serverName, "Server Offline Reminder", "Heartbeat Status", "Offline", fmt.Sprintf("No heartbeat > %dm", rule.DurationMinutes), nowStr, downtimeStr, true)
				return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
			}

			title := "Server offline: " + serverName
			dashMsg := fmt.Sprintf("Agent %s has stopped reporting heartbeat for > %dm.", serverName, rule.DurationMinutes)
			teleMsg := fmt.Sprintf(
				"<b>[DATRIXOPS ALERT] SERVER OFFLINE</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Status:</b> <b>Offline / Heartbeat Lost</b>\n<b>Condition:</b> No heartbeat received (&gt; %dm)\n<b>Time:</b> %s",
				serverName, rule.DurationMinutes, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       "[DATRIXOPS ALERT] SERVER OFFLINE: " + serverName,
				Description: fmt.Sprintf("Agent **%s** has stopped reporting heartbeat telemetry.", serverName),
				Color:       0xEF4444,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Status", Value: "Offline / Unreachable", Inline: true},
					{Name: "Condition", Value: fmt.Sprintf("No heartbeat (> %dm)", rule.DurationMinutes), Inline: true},
					{Name: "Triggered At", Value: nowStr, Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := "[DATRIXOPS ALERT] Server Offline: " + serverName
			emailHTML := renderAlertEmail(serverName, "Server Offline Alert", "Heartbeat Status", "Offline", fmt.Sprintf("No heartbeat > %dm", rule.DurationMinutes), nowStr, "", true)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		} else {
			title := "Server online: " + serverName
			dashMsg := fmt.Sprintf("Agent %s is reporting heartbeat data again. (Downtime: %s)", serverName, downtimeStr)
			teleMsg := fmt.Sprintf(
				"<b>[DATRIXOPS RESOLVED] SERVER ONLINE</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Status:</b> <b>Online / Connected</b>\n<b>Downtime Duration:</b> <code>%s</code>\n<b>Recovered At:</b> %s",
				serverName, downtimeStr, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       "[DATRIXOPS RESOLVED] SERVER ONLINE: " + serverName,
				Description: fmt.Sprintf("Agent **%s** is back online and reporting telemetry.", serverName),
				Color:       0x10B981,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Status", Value: "Online / Connected", Inline: true},
					{Name: "Downtime Duration", Value: downtimeStr, Inline: true},
					{Name: "Recovered At", Value: nowStr, Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := "[DATRIXOPS RESOLVED] Server Online: " + serverName
			emailHTML := renderAlertEmail(serverName, "Server Online Recovered", "Heartbeat Status", "Online", "Reporting telemetry", nowStr, downtimeStr, false)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		}
	}

	// 2. DOCKER CONTAINER
	if rule.Metric == "container" {
		item := target
		if item == "" {
			item = "Docker Container"
		}
		if isFiring {
			title := fmt.Sprintf("Container down: %s on %s", item, serverName)
			dashMsg := fmt.Sprintf("Container %s is stopped or unhealthy on %s.", item, serverName)
			teleMsg := fmt.Sprintf(
				"<b>[DATRIXOPS ALERT] CONTAINER DOWN</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Container:</b> <code>%s</code>\n<b>Status:</b> <b>Stopped / Unhealthy</b>\n<b>Time:</b> %s",
				serverName, item, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("[DATRIXOPS ALERT] CONTAINER DOWN: %s", item),
				Description: fmt.Sprintf("Container **%s** on server **%s** is stopped or unhealthy.", item, serverName),
				Color:       0xEF4444,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Container", Value: item, Inline: true},
					{Name: "Status", Value: "Stopped / Unhealthy", Inline: true},
					{Name: "Triggered At", Value: nowStr, Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS ALERT] Container Down: %s on %s", item, serverName)
			emailHTML := renderAlertEmail(serverName, rule.Name, "Docker Container", "Stopped / Unhealthy", "Running", nowStr, "", true)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		} else {
			title := fmt.Sprintf("Container running: %s on %s", item, serverName)
			dashMsg := fmt.Sprintf("Container %s is healthy and running on %s. (Downtime: %s)", item, serverName, downtimeStr)
			teleMsg := fmt.Sprintf(
				"<b>[DATRIXOPS RESOLVED] CONTAINER RUNNING</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Container:</b> <code>%s</code>\n<b>Status:</b> <b>Running / Healthy</b>\n<b>Downtime Duration:</b> <code>%s</code>\n<b>Recovered At:</b> %s",
				serverName, item, downtimeStr, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("[DATRIXOPS RESOLVED] CONTAINER RUNNING: %s", item),
				Description: fmt.Sprintf("Container **%s** on server **%s** is back up and running.", item, serverName),
				Color:       0x10B981,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Container", Value: item, Inline: true},
					{Name: "Status", Value: "Running / Healthy", Inline: true},
					{Name: "Downtime Duration", Value: downtimeStr, Inline: true},
					{Name: "Recovered At", Value: nowStr, Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS RESOLVED] Container Running: %s on %s", item, serverName)
			emailHTML := renderAlertEmail(serverName, rule.Name, "Docker Container", "Running", "Running", nowStr, downtimeStr, false)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		}
	}

	// 3. SYSTEMD SERVICE
	if rule.Metric == "service" {
		item := target
		if item == "" {
			item = "System Service"
		}
		if isFiring {
			title := fmt.Sprintf("Service failed: %s on %s", item, serverName)
			dashMsg := fmt.Sprintf("Service %s is inactive or failed on %s.", item, serverName)
			teleMsg := fmt.Sprintf(
				"<b>[DATRIXOPS ALERT] SERVICE FAILED</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Service:</b> <code>%s</code>\n<b>Status:</b> <b>Failed / Inactive</b>\n<b>Time:</b> %s",
				serverName, item, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("[DATRIXOPS ALERT] SERVICE FAILED: %s", item),
				Description: fmt.Sprintf("Service **%s** on server **%s** is inactive or failed.", item, serverName),
				Color:       0xEF4444,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Service", Value: item, Inline: true},
					{Name: "Status", Value: "Failed / Inactive", Inline: true},
					{Name: "Triggered At", Value: nowStr, Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS ALERT] Service Failed: %s on %s", item, serverName)
			emailHTML := renderAlertEmail(serverName, rule.Name, "Systemd Service", "Failed / Inactive", "Active (running)", nowStr, "", true)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		} else {
			title := fmt.Sprintf("Service active: %s on %s", item, serverName)
			dashMsg := fmt.Sprintf("Service %s is active and running on %s. (Downtime: %s)", item, serverName, downtimeStr)
			teleMsg := fmt.Sprintf(
				"<b>[DATRIXOPS RESOLVED] SERVICE ACTIVE</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Service:</b> <code>%s</code>\n<b>Status:</b> <b>Active (running)</b>\n<b>Downtime Duration:</b> <code>%s</code>\n<b>Recovered At:</b> %s",
				serverName, item, downtimeStr, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("[DATRIXOPS RESOLVED] SERVICE ACTIVE: %s", item),
				Description: fmt.Sprintf("Service **%s** on server **%s** has recovered.", item, serverName),
				Color:       0x10B981,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Service", Value: item, Inline: true},
					{Name: "Status", Value: "Active (running)", Inline: true},
					{Name: "Downtime Duration", Value: downtimeStr, Inline: true},
					{Name: "Recovered At", Value: nowStr, Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS RESOLVED] Service Active: %s on %s", item, serverName)
			emailHTML := renderAlertEmail(serverName, rule.Name, "Systemd Service", "Active (running)", "Active (running)", nowStr, downtimeStr, false)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		}
	}

	// 4. METRICS (CPU, RAM, DISK)
	if isFiring {
		if isReminder {
			title := "[REMINDER] Alert firing: " + rule.Name
			dashMsg := fmt.Sprintf("%s on %s is %.2f%% (%s %.2f%%) - active for %s.", metricName, serverName, currentValue, rule.Operator, rule.Threshold, downtimeStr)
			teleMsg := fmt.Sprintf(
				"<b>[DATRIXOPS REMINDER] STILL FIRING</b>\n─────────────────────────────\n<b>Rule:</b> <b>%s</b>\n<b>Server:</b> <code>%s</code>\n<b>Metric:</b> %s\n<b>Current Value:</b> <code>%.2f%%</code> (Threshold: %s %.2f%%)\n<b>Duration Active:</b> <code>%s</code>\n<b>Time:</b> %s",
				rule.Name, serverName, metricName, currentValue, rule.Operator, rule.Threshold, downtimeStr, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("[DATRIXOPS REMINDER] %s", rule.Name),
				Description: fmt.Sprintf("Threshold continues to be breached on **%s** (active for **%s**).", serverName, downtimeStr),
				Color:       0xF59E0B,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Metric", Value: metricName, Inline: true},
					{Name: "Current Value", Value: fmt.Sprintf("**%.2f%%**", currentValue), Inline: true},
					{Name: "Duration Active", Value: downtimeStr, Inline: true},
					{Name: "Condition", Value: fmt.Sprintf("%s %.2f%%", rule.Operator, rule.Threshold), Inline: true},
					{Name: "Timestamp", Value: nowStr, Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring Reminder"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS REMINDER] Firing (%s): %s on %s", downtimeStr, rule.Name, serverName)
			emailHTML := renderAlertEmail(serverName, rule.Name, metricName, fmt.Sprintf("%.2f%%", currentValue), fmt.Sprintf("%s %.2f%%", rule.Operator, rule.Threshold), nowStr, downtimeStr, true)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		}

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
		emailHTML := renderAlertEmail(serverName, rule.Name, metricName, fmt.Sprintf("%.2f%%", currentValue), fmt.Sprintf("%s %.2f%%", rule.Operator, rule.Threshold), nowStr, "", true)
		return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
	}

	// Resolved
	title := "Alert resolved: " + rule.Name
	dashMsg := fmt.Sprintf("%s on %s returned to %.2f%%. (Duration: %s)", metricName, serverName, currentValue, downtimeStr)
	teleMsg := fmt.Sprintf(
		"<b>[DATRIXOPS RESOLVED] METRIC NORMAL</b>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Rule:</b> <b>%s</b>\n<b>Metric:</b> %s\n<b>Current Value:</b> <code>%.2f%%</code> (Normal)\n<b>Incident Duration:</b> <code>%s</code>\n<b>Timestamp:</b> %s",
		serverName, rule.Name, metricName, currentValue, downtimeStr, nowStr,
	)
	discord := notifier.DiscordEmbed{
		Title:       fmt.Sprintf("[DATRIXOPS RESOLVED] %s", rule.Name),
		Description: fmt.Sprintf("Metric has returned to normal operational limits on server **%s**.", serverName),
		Color:       0x10B981,
		Fields: []notifier.DiscordEmbedField{
			{Name: "Server", Value: serverName, Inline: true},
			{Name: "Metric", Value: metricName, Inline: true},
			{Name: "Current Value", Value: fmt.Sprintf("%.2f%%", currentValue), Inline: true},
			{Name: "Status", Value: "Resolved / Healthy", Inline: true},
			{Name: "Incident Duration", Value: downtimeStr, Inline: true},
			{Name: "Recovered At", Value: nowStr, Inline: true},
		},
		Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Infrastructure Monitoring"},
	}
	emailSubj := fmt.Sprintf("[DATRIXOPS RESOLVED] %s on %s", rule.Name, serverName)
	emailHTML := renderAlertEmail(serverName, rule.Name, metricName, fmt.Sprintf("%.2f%%", currentValue), "Normal", nowStr, downtimeStr, false)
	return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
}

func renderAlertEmail(server, rule, metric, value, threshold, timestamp, downtime string, isCritical bool) string {
	statusBg := "#EF4444"
	statusText := "CRITICAL ALERT"
	if !isCritical {
		statusBg = "#10B981"
		statusText = "RESOLVED"
	}

	downtimeRow := ""
	if downtime != "" {
		downtimeRow = fmt.Sprintf(`<tr><td class="label">Duration</td><td class="val">%s</td></tr>`, downtime)
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
      {{DOWNTIME_ROW}}
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
		"{{DOWNTIME_ROW}}", downtimeRow,
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
	case "status":
		return "Heartbeat Status"
	case "container":
		return "Docker Container"
	case "service":
		return "Systemd Service"
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

func evaluateContainerCondition(targetName string, snapshotJSON []byte) (satisfied bool, val float64, ok bool) {
	if len(snapshotJSON) == 0 || string(snapshotJSON) == "{}" {
		if strings.TrimSpace(targetName) != "" {
			return true, 0, true
		}
		return false, 0, false
	}
	var snap struct {
		DockerContainers []struct {
			Name   string `json:"name"`
			State  string `json:"state"`
			Status string `json:"status"`
		} `json:"docker_containers"`
	}
	if err := json.Unmarshal(snapshotJSON, &snap); err != nil {
		return false, 0, false
	}
	target := strings.ToLower(strings.TrimSpace(targetName))
	if target != "" {
		var found bool
		for _, c := range snap.DockerContainers {
			cName := strings.TrimPrefix(strings.ToLower(c.Name), "/")
			if cName == target || strings.Contains(cName, target) {
				found = true
				if strings.ToLower(c.State) != "running" || strings.Contains(strings.ToLower(c.Status), "unhealthy") {
					return true, 0, true
				}
				return false, 0, true
			}
		}
		if !found {
			return true, 0, true
		}
	} else {
		for _, c := range snap.DockerContainers {
			if strings.ToLower(c.State) != "running" || strings.Contains(strings.ToLower(c.Status), "unhealthy") {
				return true, 0, true
			}
		}
		return false, 0, true
	}
	return false, 0, true
}

func evaluateServiceCondition(targetName string, snapshotJSON []byte) (satisfied bool, val float64, ok bool) {
	if len(snapshotJSON) == 0 || string(snapshotJSON) == "{}" {
		if strings.TrimSpace(targetName) != "" {
			return true, 0, true
		}
		return false, 0, false
	}
	var snap struct {
		Services []struct {
			Name        string `json:"name"`
			DisplayName string `json:"display_name"`
			Status      string `json:"status"`
			SubStatus   string `json:"sub_status"`
		} `json:"services"`
	}
	if err := json.Unmarshal(snapshotJSON, &snap); err != nil {
		return false, 0, false
	}
	target := strings.ToLower(strings.TrimSpace(targetName))
	if target != "" {
		var found bool
		for _, s := range snap.Services {
			sName := strings.ToLower(s.Name)
			dName := strings.ToLower(s.DisplayName)
			if sName == target || dName == target || strings.Contains(sName, target) {
				found = true
				if strings.ToLower(s.Status) != "running" && strings.ToLower(s.Status) != "active" {
					return true, 0, true
				}
				return false, 0, true
			}
		}
		if !found {
			return true, 0, true
		}
	} else {
		for _, s := range snap.Services {
			if strings.ToLower(s.Status) == "failed" || strings.ToLower(s.SubStatus) == "failed" {
				return true, 0, true
			}
		}
		return false, 0, true
	}
	return false, 0, true
}
