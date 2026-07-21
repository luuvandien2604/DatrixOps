package alert

import "time"

// AlertChannel là một đích nhận thông báo do người dùng cấu hình,
// ví dụ Telegram bot hoặc Discord webhook.
type AlertChannel struct {
	ID         string                 `json:"id"`
	UserID     string                 `json:"user_id"`
	Name       string                 `json:"name"`
	Type       string                 `json:"type"`
	Config     map[string]interface{} `json:"config"`
	Enabled    bool                   `json:"enabled"`
	UsageCount int                    `json:"usage_count"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
}

// AlertRuleChannel là thông tin channel tối giản được trả kèm một rule.
// Không trả Config để tránh đưa bot token hoặc webhook URL ra frontend.
type AlertRuleChannel struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	Enabled bool   `json:"enabled"`
}

// AlertRule định nghĩa điều kiện cảnh báo, phạm vi agent và các channel nhận tin.
// ServerID nil nghĩa là rule áp dụng cho toàn bộ agent thuộc user hiện tại.
type AlertRule struct {
	ID              string             `json:"id"`
	UserID          string             `json:"user_id"`
	Name            string             `json:"name"`
	Metric          string             `json:"metric"`   // cpu, ram, status
	Operator        string             `json:"operator"` // >, <, ==
	Threshold       float64            `json:"threshold"`
	DurationMinutes int                `json:"duration_minutes"`
	ServerID        *string            `json:"server_id"`
	ServerName      *string            `json:"server_name,omitempty"`
	Enabled         bool               `json:"enabled"`
	ChannelIDs      []string           `json:"channel_ids,omitempty"`
	Channels        []AlertRuleChannel `json:"channels"`
	CreatedAt       time.Time          `json:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at"`
}

// DashboardNotification là một sự kiện alert hiển thị trong chuông thông báo.
// ReadAt nil nghĩa là thông báo chưa được người dùng xem.
type DashboardNotification struct {
	ID          string     `json:"id"`
	Kind        string     `json:"kind"`
	Severity    string     `json:"severity"`
	Title       string     `json:"title"`
	Message     string     `json:"message"`
	AlertRuleID *string    `json:"alert_rule_id,omitempty"`
	ServerID    *string    `json:"server_id,omitempty"`
	ServerName  *string    `json:"server_name,omitempty"`
	ReadAt      *time.Time `json:"read_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// NotificationListResponse trả danh sách thông báo cùng số lượng chưa xem.
// Frontend dùng UnreadCount để cập nhật badge trên biểu tượng chuông.
type NotificationListResponse struct {
	Items       []DashboardNotification `json:"items"`
	UnreadCount int                     `json:"unread_count"`
}
