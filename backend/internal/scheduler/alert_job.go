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

type AlertJob struct {
	db     *database.DB
	logger *slog.Logger
	stop   chan struct{}
}

func NewAlertJob(db *database.DB, logger *slog.Logger) *AlertJob {
	return &AlertJob{
		db:     db,
		logger: logger.With("component", "AlertJob"),
		stop:   make(chan struct{}),
	}
}

func (j *AlertJob) Start() {
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()

		j.logger.Info("AlertJob started")
		// Run once immediately
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

func (j *AlertJob) Stop() {
	close(j.stop)
}

func (j *AlertJob) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Fetch all rules
	rows, err := j.db.Pool.Query(ctx, `SELECT id, user_id, name, metric, operator, threshold, duration_minutes, server_id, enabled FROM alert_rules WHERE enabled = true`)
	if err != nil {
		j.logger.Error("failed to list rules", "error", err)
		return
	}
	defer rows.Close()

	var rules []alert.AlertRule
	for rows.Next() {
		var rule alert.AlertRule
		if err := rows.Scan(&rule.ID, &rule.UserID, &rule.Name, &rule.Metric, &rule.Operator, &rule.Threshold, &rule.DurationMinutes, &rule.ServerID, &rule.Enabled); err == nil {
			rules = append(rules, rule)
		}
	}
	rows.Close() // close explicitly

	// Fetch all active channels
	rows, err = j.db.Pool.Query(ctx, `SELECT id, user_id, name, type, config, enabled FROM alert_channels WHERE enabled = true`)
	if err != nil {
		j.logger.Error("failed to list channels", "error", err)
		return
	}
	defer rows.Close()

	channelsByUser := make(map[string][]alert.AlertChannel)
	for rows.Next() {
		var ch alert.AlertChannel
		var configBytes []byte
		if err := rows.Scan(&ch.ID, &ch.UserID, &ch.Name, &ch.Type, &configBytes, &ch.Enabled); err == nil {
			ch.Config = make(map[string]interface{})
			_ = json.Unmarshal(configBytes, &ch.Config)
		}
		channelsByUser[ch.UserID] = append(channelsByUser[ch.UserID], ch)
	}
	rows.Close()

	for _, rule := range rules {
		userChannels := channelsByUser[rule.UserID]
		// Alert state is part of the dashboard source of truth and must be
		// evaluated even when the user has not configured a notification channel.
		j.evaluateRule(ctx, rule, userChannels)
	}
}

func (j *AlertJob) evaluateRule(ctx context.Context, rule alert.AlertRule, channels []alert.AlertChannel) {
	// 1. Fetch servers matching rule AND user
	query := `SELECT id, name, last_seen_at FROM servers WHERE user_id = $1`
	var args []interface{}
	args = append(args, rule.UserID)

	if rule.ServerID != nil {
		query += ` AND id = $2`
		args = append(args, *rule.ServerID)
	}

	rows, err := j.db.Pool.Query(ctx, query, args...)
	if err != nil {
		j.logger.Error("failed to query servers", "error", err)
		return
	}
	defer rows.Close()

	type Server struct {
		ID       string
		Name     string
		LastSeen *time.Time
	}
	var servers []Server
	for rows.Next() {
		var s Server
		if err := rows.Scan(&s.ID, &s.Name, &s.LastSeen); err == nil {
			servers = append(servers, s)
		}
	}
	rows.Close() // Explicitly close before next queries

	for _, s := range servers {
		// Evaluate condition
		isFiring := false
		currentValue := float64(0)

		if rule.Metric == "status" { // status == offline
			if s.LastSeen == nil || time.Since(*s.LastSeen) > 1*time.Minute {
				isFiring = true
			}
		} else {
			// Query latest metric
			var val float64
			metricCol := "cpu_usage"
			if rule.Metric == "ram" {
				metricCol = "memory_used * 100.0 / NULLIF(memory_total, 0)"
			}
			err := j.db.Pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM server_metrics WHERE server_id = $1 ORDER BY created_at DESC LIMIT 1`, metricCol), s.ID).Scan(&val)
			if err == nil {
				currentValue = val
				if rule.Operator == ">" && val > rule.Threshold {
					isFiring = true
				} else if rule.Operator == "<" && val < rule.Threshold {
					isFiring = true
				}
			}
		}

		// Get current state
		var currentState string
		err := j.db.Pool.QueryRow(ctx, `SELECT status FROM alert_state WHERE rule_id = $1 AND server_id = $2`, rule.ID, s.ID).Scan(&currentState)
		if err != nil {
			currentState = "ok" // not found
		}

		// State transition
		if isFiring && currentState == "ok" {
			// Fire alert
			j.logger.Info("Alert firing", "rule", rule.Name, "server", s.Name)
			j.db.Pool.Exec(ctx, `INSERT INTO alert_state (rule_id, server_id, status, last_triggered_at) VALUES ($1, $2, 'firing', NOW()) ON CONFLICT (rule_id, server_id) DO UPDATE SET status = 'firing', last_triggered_at = NOW()`, rule.ID, s.ID)

			msg := fmt.Sprintf("🚨 <b>ALERT FIRING</b>\n<b>Rule:</b> %s\n<b>Server:</b> %s\n<b>Value:</b> %.2f", rule.Name, s.Name, currentValue)
			if rule.Metric == "status" {
				msg = fmt.Sprintf("🚨 <b>SERVER OFFLINE</b>\n<b>Server:</b> %s\nLast seen > 1 mins ago.", s.Name)
			}
			j.sendNotifications(channels, msg)

		} else if !isFiring && currentState == "firing" {
			// Resolve alert
			j.logger.Info("Alert resolved", "rule", rule.Name, "server", s.Name)
			j.db.Pool.Exec(ctx, `UPDATE alert_state SET status = 'ok', last_triggered_at = NOW() WHERE rule_id = $1 AND server_id = $2`, rule.ID, s.ID)

			msg := fmt.Sprintf("✅ <b>ALERT RESOLVED</b>\n<b>Rule:</b> %s\n<b>Server:</b> %s\n<b>Value:</b> %.2f", rule.Name, s.Name, currentValue)
			if rule.Metric == "status" {
				msg = fmt.Sprintf("✅ <b>SERVER ONLINE</b>\n<b>Server:</b> %s is back online.", s.Name)
			}
			j.sendNotifications(channels, msg)
		}
	}
}

func (j *AlertJob) sendNotifications(channels []alert.AlertChannel, msg string) {
	for _, c := range channels {
		switch c.Type {
		case "telegram":
			token, _ := c.Config["bot_token"].(string)
			chatID, _ := c.Config["chat_id"].(string)
			if token != "" && chatID != "" {
				notifier.SendTelegram(token, chatID, msg)
			}
		case "discord":
			url, _ := c.Config["webhook_url"].(string)
			if url != "" {
				// Strip HTML tags for discord
				discordMsg := msg
				notifier.SendDiscord(url, discordMsg)
			}
		}
	}
}
