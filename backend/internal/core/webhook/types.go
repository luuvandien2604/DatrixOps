package webhook

import "time"

type Endpoint struct {
	ID                 string     `json:"id"`
	UserID             string     `json:"user_id"`
	Name               string     `json:"name"`
	URL                string     `json:"-"`
	URLDisplay         string     `json:"url_display"`
	SigningSecret      string     `json:"signing_secret,omitempty"`
	StoredSecret       string     `json:"-"`
	Events             []string   `json:"events"`
	Enabled            bool       `json:"enabled"`
	LastDeliveryStatus *string    `json:"last_delivery_status,omitempty"`
	LastDeliveryAt     *time.Time `json:"last_delivery_at,omitempty"`
	LastDeliveryError  *string    `json:"last_delivery_error,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type Delivery struct {
	ID             string     `json:"id"`
	UserID         string     `json:"-"`
	WebhookID      string     `json:"webhook_id"`
	WebhookName    string     `json:"webhook_name"`
	EndpointURL    string     `json:"-"`
	EndpointSecret string     `json:"-"`
	EventType      string     `json:"event_type"`
	EventID        string     `json:"event_id"`
	Payload        []byte     `json:"-"`
	Status         string     `json:"status"`
	StatusCode     *int       `json:"status_code,omitempty"`
	LatencyMs      *int       `json:"latency_ms,omitempty"`
	AttemptCount   int        `json:"attempt_count"`
	MaxAttempts    int        `json:"max_attempts"`
	NextAttemptAt  *time.Time `json:"next_attempt_at,omitempty"`
	DeliveredAt    *time.Time `json:"delivered_at,omitempty"`
	ErrorMessage   *string    `json:"error_message,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

type CreateRequest struct {
	Name          string   `json:"name"`
	URL           string   `json:"url"`
	Events        []string `json:"events"`
	Enabled       *bool    `json:"enabled"`
	SigningSecret string   `json:"signing_secret"`
}

type UpdateRequest struct {
	Name         *string   `json:"name"`
	URL          *string   `json:"url"`
	Events       *[]string `json:"events"`
	Enabled      *bool     `json:"enabled"`
	RotateSecret bool      `json:"rotate_secret"`
}

type TestPayload struct {
	EventID  string         `json:"event_id"`
	Event    string         `json:"event"`
	Source   string         `json:"source"`
	SentAt   time.Time      `json:"sent_at"`
	Test     bool           `json:"test"`
	Metadata map[string]any `json:"metadata"`
}

type EventPayload struct {
	EventID  string         `json:"event_id"`
	Event    string         `json:"event"`
	Source   string         `json:"source"`
	SentAt   time.Time      `json:"sent_at"`
	Test     bool           `json:"test"`
	Resource map[string]any `json:"resource,omitempty"`
	Alert    map[string]any `json:"alert,omitempty"`
	Metrics  map[string]any `json:"metrics,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}
