package alert

import "time"

// AlertChannel là một đích nhận thông báo do người dùng cấu hình,
// ví dụ Telegram bot hoặc Discord webhook.
type AlertChannel struct {
	ID        string                 `json:"id"`
	UserID    string                 `json:"user_id"`
	Name      string                 `json:"name"`
	Type      string                 `json:"type"`
	Config    map[string]interface{} `json:"config"`
	Enabled   bool                   `json:"enabled"`
	CreatedAt time.Time              `json:"created_at"`
	UpdatedAt time.Time              `json:"updated_at"`
}

// AlertRuleChannel là thông tin channel tối giản được trả kèm một rule.
// Không trả Config để tránh đưa bot token hoặc webhook URL vào danh sách rule.
type AlertRuleChannel struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Enabled bool   `json:"enabled"`
}

// AlertRule định nghĩa điều kiện cảnh báo và danh sách channel sẽ nhận thông báo.
// ChannelIDs được dùng khi tạo rule; Channels được dùng khi trả rule về frontend.
type AlertRule struct {
	ID              string             `json:"id"`
	UserID          string             `json:"user_id"`
	Name            string             `json:"name"`
	Metric          string             `json:"metric"`   // cpu, ram, status
	Operator        string             `json:"operator"` // >, <, ==
	Threshold       float64            `json:"threshold"`
	DurationMinutes int                `json:"duration_minutes"`
	ServerID        *string            `json:"server_id"`
	Enabled         bool               `json:"enabled"`
	ChannelIDs      []string           `json:"channel_ids,omitempty"`
	Channels        []AlertRuleChannel `json:"channels"`
	CreatedAt       time.Time          `json:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at"`
}
