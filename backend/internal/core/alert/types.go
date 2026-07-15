package alert

import "time"

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

type AlertRule struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	Name            string    `json:"name"`
	Metric          string    `json:"metric"` // cpu, ram, disk, status
	Operator        string    `json:"operator"` // >, <, ==
	Threshold       float64   `json:"threshold"`
	DurationMinutes int       `json:"duration_minutes"`
	ServerID        *string   `json:"server_id"`
	Enabled         bool      `json:"enabled"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}
