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
	LastCheck        *time.Time `json:"last_check,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type CreateWebsiteRequest struct {
	Name string `json:"name" validate:"required"`
	URL  string `json:"url" validate:"required,url"`
}
