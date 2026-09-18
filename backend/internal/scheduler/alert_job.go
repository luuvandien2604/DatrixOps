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
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
)

// AlertJob định kỳ đánh giá alert rule, ghi notification lên Dashboard
// và gửi thông báo ra đúng channel được liên kết với từng rule.
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
	query := `SELECT id, name, last_seen_at FROM servers WHERE user_id = $1 AND enrolled_at IS NOT NULL AND bootstrap_completed_at IS NOT NULL AND COALESCE(deletion_status, 'active') = 'active'`
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

	if rule.Metric == "network_latency" {
		targetFilter := ""
		if rule.TargetName != nil && *rule.TargetName != "" {
			targetFilter = strings.TrimSpace(*rule.TargetName)
		}
		var currentValue float64
		var count int
		aggFunc := "MAX"
		if rule.Operator == "<" {
			aggFunc = "MIN"
		}
		query := fmt.Sprintf(`
			SELECT COALESCE(%s(r.latency_ms), 0), COUNT(r.id)
			FROM (
				SELECT DISTINCT ON (nt.id) r.latency_ms, r.id
				FROM network_targets nt
				JOIN network_target_results r ON r.target_id = nt.id
				WHERE nt.agent_id = $1::uuid AND nt.enabled = true
				  AND ($2 = '' OR nt.name ILIKE '%%' || $2 || '%%' OR nt.tag ILIKE '%%' || $2 || '%%' OR nt.host ILIKE '%%' || $2 || '%%')
				  AND r.measured_at >= NOW() - INTERVAL '15 minutes'
				ORDER BY nt.id, r.measured_at DESC
			) r
			WHERE r.latency_ms IS NOT NULL
		`, aggFunc)
		if err := j.db.Pool.QueryRow(ctx, query, serverID, targetFilter).Scan(&currentValue, &count); err != nil || count == 0 {
			return false, 0, false
		}
		return compareAlertValue(rule.Operator, currentValue, rule.Threshold), currentValue, true
	}

	if rule.Metric == "network_loss" {
		targetFilter := ""
		if rule.TargetName != nil && *rule.TargetName != "" {
			targetFilter = strings.TrimSpace(*rule.TargetName)
		}
		var currentValue float64
		var count int
		aggFunc := "MAX"
		if rule.Operator == "<" {
			aggFunc = "MIN"
		}
		query := fmt.Sprintf(`
			SELECT COALESCE(%s(r.packet_loss), 0), COUNT(r.id)
			FROM (
				SELECT DISTINCT ON (nt.id) r.packet_loss, r.id
				FROM network_targets nt
				JOIN network_target_results r ON r.target_id = nt.id
				WHERE nt.agent_id = $1::uuid AND nt.enabled = true
				  AND ($2 = '' OR nt.name ILIKE '%%' || $2 || '%%' OR nt.tag ILIKE '%%' || $2 || '%%' OR nt.host ILIKE '%%' || $2 || '%%')
				  AND r.measured_at >= NOW() - INTERVAL '15 minutes'
				ORDER BY nt.id, r.measured_at DESC
			) r
			WHERE r.packet_loss IS NOT NULL
		`, aggFunc)
		if err := j.db.Pool.QueryRow(ctx, query, serverID, targetFilter).Scan(&currentValue, &count); err != nil || count == 0 {
			return false, 0, false
		}
		return compareAlertValue(rule.Operator, currentValue, rule.Threshold), currentValue, true
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
					_, _, notifSet := buildAlertNotification(rule, serverName, currentValue, true, activeDuration, true, condStarted)
					j.logger.Info("Alert reminder sent", "rule", rule.Name, "server", serverName, "repeat_minutes", rule.RepeatIntervalMinutes)
					j.sendNotifications(channels, notifSet)
				}
			}
		}
		return
	}

	title, dashboardMessage, notifSet := buildAlertNotification(rule, serverName, currentValue, true, 0, false, nil)
	loc, _ := time.LoadLocation("Asia/Ho_Chi_Minh")
	if loc == nil {
		loc = time.FixedZone("ICT", 7*3600)
	}
	nowStr := time.Now().In(loc).Format("02/01/2006 15:04:05")
	target := ""
	if rule.TargetName != nil {
		target = *rule.TargetName
	}
	metadata, _ := json.Marshal(map[string]interface{}{
		"metric":        rule.Metric,
		"operator":      rule.Operator,
		"threshold":     rule.Threshold,
		"current_value": currentValue,
		"failed_at":     nowStr,
		"rule_name":     rule.Name,
		"server_name":   serverName,
		"target_name":   target,
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

	title, dashboardMessage, notifSet := buildAlertNotification(rule, serverName, currentValue, false, downtimeDuration, false, conditionStartedAt)
	loc, _ := time.LoadLocation("Asia/Ho_Chi_Minh")
	if loc == nil {
		loc = time.FixedZone("ICT", 7*3600)
	}
	nowStr := time.Now().In(loc).Format("02/01/2006 15:04:05")
	failedAtStr := nowStr
	if conditionStartedAt != nil {
		failedAtStr = conditionStartedAt.In(loc).Format("02/01/2006 15:04:05")
	}
	downtimeStr := formatDurationShort(downtimeDuration)
	target := ""
	if rule.TargetName != nil {
		target = *rule.TargetName
	}
	metadata, _ := json.Marshal(map[string]interface{}{
		"metric":            rule.Metric,
		"operator":          rule.Operator,
		"threshold":         rule.Threshold,
		"current_value":     currentValue,
		"downtime_duration": downtimeStr,
		"failed_at":         failedAtStr,
		"recovered_at":      nowStr,
		"rule_name":         rule.Name,
		"server_name":       serverName,
		"target_name":       target,
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

func formatDurationShort(d time.Duration) string {
	if d <= 0 {
		return "0s"
	}
	d = d.Round(time.Second)
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	minutes := int(d.Minutes()) % 60
	seconds := int(d.Seconds()) % 60

	if days > 0 {
		if hours > 0 {
			return fmt.Sprintf("%dd %dh", days, hours)
		}
		return fmt.Sprintf("%dd", days)
	}
	if hours > 0 {
		if minutes > 0 {
			return fmt.Sprintf("%dh %dm", hours, minutes)
		}
		return fmt.Sprintf("%dh", hours)
	}
	if minutes > 0 {
		if seconds > 0 {
			return fmt.Sprintf("%dm %ds", minutes, seconds)
		}
		return fmt.Sprintf("%dm", minutes)
	}
	return fmt.Sprintf("%ds", seconds)
}

type alertRow struct {
	LeftLabel  string
	LeftVal    string
	RightLabel string
	RightVal   string
}

func buildAlertNotification(rule alert.AlertRule, serverName string, currentValue float64, isFiring bool, downtimeDuration time.Duration, isReminder bool, startedAt *time.Time) (string, string, alertNotificationSet) {
	metricName := metricLabel(rule.Metric)
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		loc = time.FixedZone("ICT", 7*3600)
	}
	now := time.Now().In(loc)
	nowStr := now.Format("02/01/2006 15:04:05")
	failedAtStr := nowStr
	if startedAt != nil {
		failedAtStr = startedAt.In(loc).Format("02/01/2006 15:04:05")
	}
	downtimeStr := formatDurationShort(downtimeDuration)

	target := ""
	if rule.TargetName != nil && *rule.TargetName != "" {
		target = *rule.TargetName
	}

	// 1. STATUS (OFFLINE / ONLINE)
	if rule.Metric == "status" {
		if isFiring {
			if isReminder {
				title := fmt.Sprintf("%s offline (reminder)", serverName)
				dashMsg := fmt.Sprintf("Server %s is still OFFLINE (active for %s).", serverName, downtimeStr)
				summary := fmt.Sprintf("Server %s is still offline. Active duration: %s.", serverName, downtimeStr)
				teleMsg := fmt.Sprintf(
					"⚠️ <b>%s offline (reminder)</b>\nRule: <i>%s</i>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Status:</b> <code>Offline</code>\n<b>Duration Active:</b> <code>%s</code>\n<b>Failed at:</b> %s\n\n<i>DatrixOps Monitoring</i>",
					serverName, rule.Name, serverName, downtimeStr, failedAtStr,
				)
				discord := notifier.DiscordEmbed{
					Title:       fmt.Sprintf("⚠️ %s offline (reminder)", serverName),
					Description: fmt.Sprintf("Rule: %s", rule.Name),
					Color:       0xF59E0B,
					Fields: []notifier.DiscordEmbedField{
						{Name: "Server", Value: serverName, Inline: true},
						{Name: "Status", Value: "`Offline`", Inline: true},
						{Name: "\u200b", Value: "\u200b", Inline: true},
						{Name: "Duration Active", Value: fmt.Sprintf("`%s`", downtimeStr), Inline: true},
						{Name: "Failed at", Value: fmt.Sprintf("`%s`", failedAtStr), Inline: true},
						{Name: "\u200b", Value: "\u200b", Inline: true},
					},
					Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
				}
				emailSubj := fmt.Sprintf("[DATRIXOPS REMINDER] %s offline (%s)", serverName, downtimeStr)
				emailRows := []alertRow{
					{LeftLabel: "Server", LeftVal: serverName, RightLabel: "Status", RightVal: "Offline"},
					{LeftLabel: "Duration Active", LeftVal: downtimeStr, RightLabel: "Condition", RightVal: fmt.Sprintf("No heartbeat > %dm", rule.DurationMinutes)},
					{LeftLabel: "Failed at", LeftVal: failedAtStr, RightLabel: "Reminded at", RightVal: nowStr},
				}
				emailHTML := renderAlertEmail(rule.Name, summary, "REMINDER", "reminder", emailRows)
				return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
			}

			title := fmt.Sprintf("%s offline", serverName)
			dashMsg := fmt.Sprintf("Server %s has stopped reporting heartbeat for > %dm.", serverName, rule.DurationMinutes)
			summary := fmt.Sprintf("Server %s has stopped reporting heartbeat (> %dm timeout).", serverName, rule.DurationMinutes)
			teleMsg := fmt.Sprintf(
				"🔴 <b>%s offline</b>\nRule: <i>%s</i>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Status:</b> <code>Offline</code>\n<b>Condition:</b> <code>No heartbeat > %dm</code>\n<b>Failed at:</b> %s\n\n<i>DatrixOps Monitoring</i>",
				serverName, rule.Name, serverName, rule.DurationMinutes, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("🔴 %s offline", serverName),
				Description: fmt.Sprintf("Rule: %s", rule.Name),
				Color:       0xEF4444,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Status", Value: "`Offline`", Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Condition", Value: fmt.Sprintf("`No heartbeat > %dm`", rule.DurationMinutes), Inline: true},
					{Name: "Failed at", Value: fmt.Sprintf("`%s`", nowStr), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS ALERT] %s offline", serverName)
			emailRows := []alertRow{
				{LeftLabel: "Server", LeftVal: serverName, RightLabel: "Status", RightVal: "Offline"},
				{LeftLabel: "Condition", LeftVal: fmt.Sprintf("No heartbeat > %dm", rule.DurationMinutes), RightLabel: "Failed at", RightVal: nowStr},
			}
			emailHTML := renderAlertEmail(rule.Name, summary, "OFFLINE", "firing", emailRows)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		} else {
			title := fmt.Sprintf("%s recovered", serverName)
			dashMsg := fmt.Sprintf("Server %s is back online. (Downtime: %s)", serverName, downtimeStr)
			summary := fmt.Sprintf("Server %s is back online and reporting telemetry normally.", serverName)
			teleMsg := fmt.Sprintf(
				"🟢 <b>%s recovered</b>\nRule: <i>%s</i>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Status:</b> <code>Online</code>\n<b>Downtime:</b> <code>%s</code>\n<b>Failed at:</b> %s\n<b>Recovered at:</b> %s\n\n<i>DatrixOps Monitoring</i>",
				serverName, rule.Name, serverName, downtimeStr, failedAtStr, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("🟢 %s recovered", serverName),
				Description: fmt.Sprintf("Rule: %s", rule.Name),
				Color:       0x10B981,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Status", Value: "`Online`", Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Condition", Value: "`Heartbeat restored`", Inline: true},
					{Name: "Downtime", Value: fmt.Sprintf("`%s`", downtimeStr), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Failed at", Value: fmt.Sprintf("`%s`", failedAtStr), Inline: true},
					{Name: "Recovered at", Value: fmt.Sprintf("`%s`", nowStr), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS RESOLVED] %s recovered", serverName)
			emailRows := []alertRow{
				{LeftLabel: "Server", LeftVal: serverName, RightLabel: "Status", RightVal: "Online"},
				{LeftLabel: "Condition", LeftVal: "Heartbeat restored", RightLabel: "Downtime", RightVal: downtimeStr},
				{LeftLabel: "Failed at", LeftVal: failedAtStr, RightLabel: "Recovered at", RightVal: nowStr},
			}
			emailHTML := renderAlertEmail(rule.Name, summary, "RESOLVED", "resolved", emailRows)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		}
	}

	// 2. DOCKER CONTAINER
	if rule.Metric == "container" {
		item := target
		if item == "" {
			item = "container"
		}
		if isFiring {
			title := fmt.Sprintf("%s failed", item)
			dashMsg := fmt.Sprintf("Container %s is stopped or unhealthy on %s.", item, serverName)
			summary := fmt.Sprintf("Container %s is stopped or unhealthy on server %s.", item, serverName)
			teleMsg := fmt.Sprintf(
				"🔴 <b>%s failed</b>\nRule: <i>%s</i>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Container:</b> <code>%s</code>\n<b>Status:</b> <code>Stopped / Unhealthy</code>\n<b>Failed at:</b> %s\n\n<i>DatrixOps Monitoring</i>",
				item, rule.Name, serverName, item, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("🔴 %s failed", item),
				Description: fmt.Sprintf("Rule: %s", rule.Name),
				Color:       0xEF4444,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Container", Value: fmt.Sprintf("`%s`", item), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Status", Value: "`Stopped / Unhealthy`", Inline: true},
					{Name: "Expected", Value: "`Running`", Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Failed at", Value: fmt.Sprintf("`%s`", nowStr), Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS ALERT] %s failed on %s", item, serverName)
			emailRows := []alertRow{
				{LeftLabel: "Server", LeftVal: serverName, RightLabel: "Container", RightVal: item},
				{LeftLabel: "Status", LeftVal: "Stopped / Unhealthy", RightLabel: "Expected", RightVal: "Running"},
				{LeftLabel: "Failed at", LeftVal: nowStr, RightLabel: "", RightVal: ""},
			}
			emailHTML := renderAlertEmail(rule.Name, summary, "FAILED", "firing", emailRows)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		} else {
			title := fmt.Sprintf("%s recovered", item)
			dashMsg := fmt.Sprintf("Container %s is healthy and running on %s. (Downtime: %s)", item, serverName, downtimeStr)
			summary := fmt.Sprintf("Container %s is healthy and running normally on server %s.", item, serverName)
			teleMsg := fmt.Sprintf(
				"🟢 <b>%s recovered</b>\nRule: <i>%s</i>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Container:</b> <code>%s</code>\n<b>Status:</b> <code>Running (Healthy)</code>\n<b>Downtime:</b> <code>%s</code>\n<b>Failed at:</b> %s\n<b>Recovered at:</b> %s\n\n<i>DatrixOps Monitoring</i>",
				item, rule.Name, serverName, item, downtimeStr, failedAtStr, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("🟢 %s recovered", item),
				Description: fmt.Sprintf("Rule: %s", rule.Name),
				Color:       0x10B981,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Container", Value: fmt.Sprintf("`%s`", item), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Status", Value: "`Running (Healthy)`", Inline: true},
					{Name: "Downtime", Value: fmt.Sprintf("`%s`", downtimeStr), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Failed at", Value: fmt.Sprintf("`%s`", failedAtStr), Inline: true},
					{Name: "Recovered at", Value: fmt.Sprintf("`%s`", nowStr), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS RESOLVED] %s recovered on %s", item, serverName)
			emailRows := []alertRow{
				{LeftLabel: "Server", LeftVal: serverName, RightLabel: "Container", RightVal: item},
				{LeftLabel: "Status", LeftVal: "Running (Healthy)", RightLabel: "Downtime", RightVal: downtimeStr},
				{LeftLabel: "Failed at", LeftVal: failedAtStr, RightLabel: "Recovered at", RightVal: nowStr},
			}
			emailHTML := renderAlertEmail(rule.Name, summary, "RESOLVED", "resolved", emailRows)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		}
	}

	// 3. SYSTEMD SERVICE
	if rule.Metric == "service" {
		item := target
		if item == "" {
			item = "service"
		}
		if isFiring {
			title := fmt.Sprintf("%s failed", item)
			dashMsg := fmt.Sprintf("Service %s is inactive or failed on %s.", item, serverName)
			summary := fmt.Sprintf("Systemd service %s is inactive or failed on server %s.", item, serverName)
			teleMsg := fmt.Sprintf(
				"🔴 <b>%s failed</b>\nRule: <i>%s</i>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Service:</b> <code>%s</code>\n<b>Status:</b> <code>Failed / Inactive</code>\n<b>Failed at:</b> %s\n\n<i>DatrixOps Monitoring</i>",
				item, rule.Name, serverName, item, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("🔴 %s failed", item),
				Description: fmt.Sprintf("Rule: %s", rule.Name),
				Color:       0xEF4444,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Service", Value: fmt.Sprintf("`%s`", item), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Status", Value: "`Failed / Inactive`", Inline: true},
					{Name: "Expected", Value: "`Active (running)`", Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Failed at", Value: fmt.Sprintf("`%s`", nowStr), Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS ALERT] %s failed on %s", item, serverName)
			emailRows := []alertRow{
				{LeftLabel: "Server", LeftVal: serverName, RightLabel: "Service", RightVal: item},
				{LeftLabel: "Status", LeftVal: "Failed / Inactive", RightLabel: "Expected", RightVal: "Active (running)"},
				{LeftLabel: "Failed at", LeftVal: nowStr, RightLabel: "", RightVal: ""},
			}
			emailHTML := renderAlertEmail(rule.Name, summary, "FAILED", "firing", emailRows)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		} else {
			title := fmt.Sprintf("%s recovered", item)
			dashMsg := fmt.Sprintf("Service %s is active and running on %s. (Downtime: %s)", item, serverName, downtimeStr)
			summary := fmt.Sprintf("Systemd service %s is active and running normally on server %s.", item, serverName)
			teleMsg := fmt.Sprintf(
				"🟢 <b>%s recovered</b>\nRule: <i>%s</i>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Service:</b> <code>%s</code>\n<b>Status:</b> <code>Active (running)</code>\n<b>Downtime:</b> <code>%s</code>\n<b>Failed at:</b> %s\n<b>Recovered at:</b> %s\n\n<i>DatrixOps Monitoring</i>",
				item, rule.Name, serverName, item, downtimeStr, failedAtStr, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("🟢 %s recovered", item),
				Description: fmt.Sprintf("Rule: %s", rule.Name),
				Color:       0x10B981,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Service", Value: fmt.Sprintf("`%s`", item), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Status", Value: "`Active (running)`", Inline: true},
					{Name: "Downtime", Value: fmt.Sprintf("`%s`", downtimeStr), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Failed at", Value: fmt.Sprintf("`%s`", failedAtStr), Inline: true},
					{Name: "Recovered at", Value: fmt.Sprintf("`%s`", nowStr), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS RESOLVED] %s recovered on %s", item, serverName)
			emailRows := []alertRow{
				{LeftLabel: "Server", LeftVal: serverName, RightLabel: "Service", RightVal: item},
				{LeftLabel: "Status", LeftVal: "Active (running)", RightLabel: "Downtime", RightVal: downtimeStr},
				{LeftLabel: "Failed at", LeftVal: failedAtStr, RightLabel: "Recovered at", RightVal: nowStr},
			}
			emailHTML := renderAlertEmail(rule.Name, summary, "RESOLVED", "resolved", emailRows)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		}
	}

	// 4. METRICS (CPU, RAM, DISK, NETWORK)
	unit := "%"
	if rule.Metric == "network_latency" {
		unit = "ms"
	}

	if isFiring {
		if isReminder {
			title := fmt.Sprintf("%s alert (reminder)", rule.Name)
			dashMsg := fmt.Sprintf("%s on %s is %.2f%s (%s %.2f%s) - active for %s.", metricName, serverName, currentValue, unit, rule.Operator, rule.Threshold, unit, downtimeStr)
			summary := fmt.Sprintf("%s on %s remains in violation at %.2f%s (Condition: %s %.2f%s) - active for %s.", metricName, serverName, currentValue, unit, rule.Operator, rule.Threshold, unit, downtimeStr)
			teleMsg := fmt.Sprintf(
				"⚠️ <b>%s alert (reminder)</b>\nRule: <i>%s</i>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Metric:</b> <code>%s</code>\n<b>Current Value:</b> <code>%.2f%s</code> (Threshold: %s %.2f%s)\n<b>Duration Active:</b> <code>%s</code>\n<b>Time:</b> %s\n\n<i>DatrixOps Monitoring</i>",
				rule.Name, rule.Name, serverName, metricName, currentValue, unit, rule.Operator, rule.Threshold, unit, downtimeStr, nowStr,
			)
			discord := notifier.DiscordEmbed{
				Title:       fmt.Sprintf("⚠️ %s alert (reminder)", rule.Name),
				Description: fmt.Sprintf("Rule: %s", rule.Name),
				Color:       0xF59E0B,
				Fields: []notifier.DiscordEmbedField{
					{Name: "Server", Value: serverName, Inline: true},
					{Name: "Metric", Value: metricName, Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Current Value", Value: fmt.Sprintf("`%.2f%s`", currentValue, unit), Inline: true},
					{Name: "Condition", Value: fmt.Sprintf("`%s %.2f%s`", rule.Operator, rule.Threshold, unit), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
					{Name: "Duration Active", Value: fmt.Sprintf("`%s`", downtimeStr), Inline: true},
					{Name: "Triggered at", Value: fmt.Sprintf("`%s`", failedAtStr), Inline: true},
					{Name: "\u200b", Value: "\u200b", Inline: true},
				},
				Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
			}
			emailSubj := fmt.Sprintf("[DATRIXOPS REMINDER] Firing (%s): %s on %s", downtimeStr, rule.Name, serverName)
			emailRows := []alertRow{
				{LeftLabel: "Server", LeftVal: serverName, RightLabel: "Metric", RightVal: metricName},
				{LeftLabel: "Current Value", LeftVal: fmt.Sprintf("%.2f%s", currentValue, unit), RightLabel: "Condition", RightVal: fmt.Sprintf("%s %.2f%s", rule.Operator, rule.Threshold, unit)},
				{LeftLabel: "Duration Active", LeftVal: downtimeStr, RightLabel: "Triggered at", RightVal: failedAtStr},
			}
			emailHTML := renderAlertEmail(rule.Name, summary, "REMINDER", "reminder", emailRows)
			return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
		}

		title := fmt.Sprintf("%s alert", rule.Name)
		dashMsg := fmt.Sprintf("%s on %s is %.2f%s (%s %.2f%s).", metricName, serverName, currentValue, unit, rule.Operator, rule.Threshold, unit)
		summary := fmt.Sprintf("%s on %s reached %.2f%s (Condition: %s %.2f%s).", metricName, serverName, currentValue, unit, rule.Operator, rule.Threshold, unit)
		teleMsg := fmt.Sprintf(
			"🔴 <b>%s alert</b>\nRule: <i>%s</i>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Metric:</b> <code>%s</code>\n<b>Current Value:</b> <code>%.2f%s</code> (Condition: %s %.2f%s)\n<b>Triggered at:</b> %s\n\n<i>DatrixOps Monitoring</i>",
			rule.Name, rule.Name, serverName, metricName, currentValue, unit, rule.Operator, rule.Threshold, unit, nowStr,
		)
		discord := notifier.DiscordEmbed{
			Title:       fmt.Sprintf("🔴 %s alert", rule.Name),
			Description: fmt.Sprintf("Rule: %s", rule.Name),
			Color:       0xEF4444,
			Fields: []notifier.DiscordEmbedField{
				{Name: "Server", Value: serverName, Inline: true},
				{Name: "Metric", Value: metricName, Inline: true},
				{Name: "\u200b", Value: "\u200b", Inline: true},
				{Name: "Current Value", Value: fmt.Sprintf("`%.2f%s`", currentValue, unit), Inline: true},
				{Name: "Condition", Value: fmt.Sprintf("`%s %.2f%s`", rule.Operator, rule.Threshold, unit), Inline: true},
				{Name: "\u200b", Value: "\u200b", Inline: true},
				{Name: "Triggered at", Value: fmt.Sprintf("`%s`", nowStr), Inline: true},
			},
			Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
		}
		emailSubj := fmt.Sprintf("[DATRIXOPS ALERT] %s on %s", rule.Name, serverName)
		emailRows := []alertRow{
			{LeftLabel: "Server", LeftVal: serverName, RightLabel: "Metric", RightVal: metricName},
			{LeftLabel: "Current Value", LeftVal: fmt.Sprintf("%.2f%s", currentValue, unit), RightLabel: "Condition", RightVal: fmt.Sprintf("%s %.2f%s", rule.Operator, rule.Threshold, unit)},
			{LeftLabel: "Triggered at", LeftVal: nowStr, RightLabel: "", RightVal: ""},
		}
		emailHTML := renderAlertEmail(rule.Name, summary, "FIRING", "firing", emailRows)
		return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
	}

	// Resolved
	title := fmt.Sprintf("%s recovered", rule.Name)
	dashMsg := fmt.Sprintf("%s on %s returned to %.2f%s. (Duration: %s)", metricName, serverName, currentValue, unit, downtimeStr)
	summary := fmt.Sprintf("%s on %s returned to %.2f%s (within normal threshold).", metricName, serverName, currentValue, unit)
	teleMsg := fmt.Sprintf(
		"🟢 <b>%s recovered</b>\nRule: <i>%s</i>\n─────────────────────────────\n<b>Server:</b> <code>%s</code>\n<b>Metric:</b> <code>%s</code>\n<b>Current Value:</b> <code>%.2f%s</code>\n<b>Duration:</b> <code>%s</code>\n<b>Triggered at:</b> %s\n<b>Resolved at:</b> %s\n\n<i>DatrixOps Monitoring</i>",
		rule.Name, rule.Name, serverName, metricName, currentValue, unit, downtimeStr, failedAtStr, nowStr,
	)
	discord := notifier.DiscordEmbed{
		Title:       fmt.Sprintf("🟢 %s recovered", rule.Name),
		Description: fmt.Sprintf("Rule: %s", rule.Name),
		Color:       0x10B981,
		Fields: []notifier.DiscordEmbedField{
			{Name: "Server", Value: serverName, Inline: true},
			{Name: "Metric", Value: metricName, Inline: true},
			{Name: "\u200b", Value: "\u200b", Inline: true},
			{Name: "Current Value", Value: fmt.Sprintf("`%.2f%s`", currentValue, unit), Inline: true},
			{Name: "Duration", Value: fmt.Sprintf("`%s`", downtimeStr), Inline: true},
			{Name: "\u200b", Value: "\u200b", Inline: true},
			{Name: "Triggered at", Value: fmt.Sprintf("`%s`", failedAtStr), Inline: true},
			{Name: "Resolved at", Value: fmt.Sprintf("`%s`", nowStr), Inline: true},
			{Name: "\u200b", Value: "\u200b", Inline: true},
		},
		Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Monitoring"},
	}
	emailSubj := fmt.Sprintf("[DATRIXOPS RESOLVED] %s on %s", rule.Name, serverName)
	emailRows := []alertRow{
		{LeftLabel: "Server", LeftVal: serverName, RightLabel: "Metric", RightVal: metricName},
		{LeftLabel: "Current Value", LeftVal: fmt.Sprintf("%.2f%s", currentValue, unit), RightLabel: "Duration", RightVal: downtimeStr},
		{LeftLabel: "Triggered at", LeftVal: failedAtStr, RightLabel: "Resolved at", RightVal: nowStr},
	}
	emailHTML := renderAlertEmail(rule.Name, summary, "RESOLVED", "resolved", emailRows)
	return title, dashMsg, alertNotificationSet{teleMsg, discord, emailSubj, emailHTML}
}

// renderAlertEmail dựng email HTML dùng layout bảng (table-based) để tương thích
// với Outlook/Gmail — không dùng flexbox/grid vì nhiều mail client bỏ qua CSS đó.
// Theme sáng (nền trắng) theo phong cách Datadog/PagerDuty: an toàn hơn dark theme
// vì nhiều client tự áp dark-mode riêng và có thể làm vỡ màu chữ trên nền tối.
func renderAlertEmail(ruleName, summary, statusText, statusType string, rows []alertRow) string {
	accentColor := "#DC2626"
	badgeBg := "#FEE2E2"
	badgeText := "#B91C1C"

	switch statusType {
	case "resolved":
		accentColor = "#16A34A"
		badgeBg = "#DCFCE7"
		badgeText = "#15803D"
		if statusText == "" {
			statusText = "RESOLVED"
		}
	case "reminder":
		accentColor = "#F59E0B"
		badgeBg = "#FEF3C7"
		badgeText = "#B45309"
		if statusText == "" {
			statusText = "REMINDER"
		}
	default: // firing / failed / offline
		accentColor = "#DC2626"
		badgeBg = "#FEE2E2"
		badgeText = "#B91C1C"
		if statusText == "" {
			statusText = "FAILED"
		}
	}

	var rowsHTML strings.Builder
	for _, row := range rows {
		rowsHTML.WriteString(fmt.Sprintf(`
      <tr>
        <td class="stat" width="50%%">%s</td>
        <td class="stat stat-right" width="50%%">%s</td>
      </tr>`, statCell(row.LeftLabel, row.LeftVal), statCell(row.RightLabel, row.RightVal)))
	}

	preheader := summary
	if preheader == "" {
		preheader = fmt.Sprintf("%s – %s", ruleName, statusText)
	}

	tmpl := `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>
  body { margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .preheader { display: none; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; overflow: hidden; mso-hide: all; }
  .card { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06); }
  .accent-bar { height: 4px; background: {{ACCENT}}; }
  .brand { padding: 14px 24px; border-bottom: 1px solid #f1f5f9; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #94a3b8; }
  .content { padding: 24px; }
  .title-row { margin: 0 0 20px 0; overflow: hidden; }
  .title { font-size: 19px; font-weight: 700; color: #0f172a; line-height: 28px; }
  .badge { float: right; background: {{BADGE_BG}}; color: {{BADGE_TEXT}}; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; letter-spacing: 0.5px; }
  .stats-table { width: 100%; border-collapse: collapse; }
  .stat-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 4px; }
  .stat-val { font-size: 14px; color: #1e293b; font-weight: 600; font-family: 'SFMono-Regular', Consolas, monospace; }
  .stat { padding: 12px 12px 12px 0; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .stat-right { padding-left: 12px; padding-right: 0; }
  .footer { padding: 14px 24px; background: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 11px; color: #94a3b8; }
</style>
</head>
<body>
<div class="preheader">{{PREHEADER}}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>
<div class="card">
  <div class="accent-bar"></div>
  <div class="brand">DATRIXOPS MONITORING</div>
  <div class="content">
    <div class="title-row">
      <span class="badge">● {{STATUS_TEXT}}</span>
      <span class="title">{{RULE_NAME}}</span>
    </div>
    <table class="stats-table">{{ROWS}}
    </table>
  </div>
  <div class="footer">Automated notification sent by DatrixOps Control Plane.</div>
</div>
</td></tr></table>
</body>
</html>`

	r := strings.NewReplacer(
		"{{ACCENT}}", accentColor,
		"{{BADGE_BG}}", badgeBg,
		"{{BADGE_TEXT}}", badgeText,
		"{{STATUS_TEXT}}", statusText,
		"{{RULE_NAME}}", ruleName,
		"{{ROWS}}", rowsHTML.String(),
		"{{PREHEADER}}", preheader,
	)
	return r.Replace(tmpl)
}

// statCell render một ô nhãn+giá trị trong lưới 2 cột của email; ô rỗng dùng để
// cân bằng hàng khi số liệu là số lẻ, giữ 2 cột luôn thẳng hàng dọc.
func statCell(label, val string) string {
	if label == "" {
		return `&nbsp;`
	}
	return fmt.Sprintf(`<div class="stat-label">%s</div><div class="stat-val">%s</div>`, label, val)
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
	case "network_latency":
		return "Network Latency"
	case "network_loss":
		return "Network Packet Loss"
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
	cleanTarget := strings.TrimSuffix(target, ".service")
	if cleanTarget != "" {
		var found bool
		for _, s := range snap.Services {
			sName := strings.ToLower(strings.TrimSpace(s.Name))
			dName := strings.ToLower(strings.TrimSpace(s.DisplayName))
			cleanSName := strings.TrimSuffix(sName, ".service")
			cleanDName := strings.TrimSuffix(dName, ".service")

			if cleanSName == cleanTarget || cleanDName == cleanTarget || sName == target || dName == target || strings.Contains(cleanSName, cleanTarget) {
				found = true
				status := strings.ToLower(strings.TrimSpace(s.Status))
				subStatus := strings.ToLower(strings.TrimSpace(s.SubStatus))

				// Service is normal only if status is running/active/ok and subStatus is not failed/dead
				if (status == "running" || status == "active" || status == "ok") && subStatus != "failed" && subStatus != "dead" {
					return false, 0, true
				}
				// Otherwise service is stopped, dead, failed, inactive, not_installed -> trigger alert
				return true, 0, true
			}
		}
		if !found {
			// Service not found in snapshot -> trigger alert
			return true, 0, true
		}
	} else {
		for _, s := range snap.Services {
			status := strings.ToLower(strings.TrimSpace(s.Status))
			subStatus := strings.ToLower(strings.TrimSpace(s.SubStatus))
			if status == "failed" || status == "dead" || subStatus == "failed" || subStatus == "dead" {
				return true, 0, true
			}
		}
		return false, 0, true
	}
	return false, 0, true
}
