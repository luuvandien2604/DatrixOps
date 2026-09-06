package website

import "time"

type Website struct {
	ID               string     `json:"id"`
	UserID           string     `json:"user_id"`
	Name             string     `json:"name"`
	URL              string     `json:"url"`
	Status           string     `json:"status"` // "UP", "DOWN", "UNKNOWN"
	SSLIssuer        *string    `json:"ssl_issuer,omitempty"`
	SSLValidTo       *time.Time `json:"ssl_valid_to,omitempty"`
	SSLDaysRemaining *int       `json:"ssl_days_remaining,omitempty"`
	DownStartedAt    *time.Time `json:"down_started_at,omitempty"`
	LastSSLAlertAt   *time.Time `json:"last_ssl_alert_at,omitempty"`
	LastCheck        *time.Time `json:"last_check,omitempty"`
	ChannelIDs       []string   `json:"channel_ids,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type CreateWebsiteRequest struct {
	Name       string   `json:"name" validate:"required"`
	URL        string   `json:"url" validate:"required,url"`
	ChannelIDs []string `json:"channel_ids,omitempty"`
}

type CheckResult struct {
	WebsiteID        string
	Status           string
	StatusCode       *int
	ResponseTimeMS   int
	FailureKind      *string
	SSLDaysRemaining *int
	CheckedAt        time.Time
}
