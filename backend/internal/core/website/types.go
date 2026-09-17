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

type DailyUptimeRollup struct {
	ID                  string    `json:"id"`
	EntityType          string    `json:"entity_type"`
	EntityID            string    `json:"entity_id"`
	Date                string    `json:"date"` // YYYY-MM-DD
	UptimePct           float64   `json:"uptime_pct"`
	DowntimeSeconds     int       `json:"downtime_seconds"`
	TotalChecks         int       `json:"total_checks"`
	FailedChecks        int       `json:"failed_checks"`
	AvgLatencyMS        float64   `json:"avg_latency_ms"`
	Status              string    `json:"status"` // operational, degraded, outage, no_data
	IncidentTitle       *string   `json:"incident_title,omitempty"`
	IncidentDescription *string   `json:"incident_description,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type UptimeDayBar struct {
	Date            string  `json:"date"`   // YYYY-MM-DD
	Status          string  `json:"status"` // "operational", "degraded", "outage", "no_data"
	UptimePct       float64 `json:"uptime_pct"`
	DowntimeSeconds int     `json:"downtime_seconds"`
	AvgLatencyMS    float64 `json:"avg_latency_ms"`
	IncidentTitle   string  `json:"incident_title,omitempty"`
}

type UptimeSummaryItem struct {
	ID               string         `json:"id"`
	Name             string         `json:"name"`
	URL              string         `json:"url,omitempty"`
	CurrentStatus    string         `json:"current_status"` // "UP", "DOWN"
	OverallUptimePct float64        `json:"overall_uptime_pct"`
	Days             []UptimeDayBar `json:"days"`
}

type UptimeSummaryResponse struct {
	StartDate string              `json:"start_date"` // YYYY-MM-DD
	EndDate   string              `json:"end_date"`   // YYYY-MM-DD
	DaysCount int                 `json:"days_count"` // e.g. 90
	Items     []UptimeSummaryItem `json:"items"`
}
