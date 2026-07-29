package webhook

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

var ErrEndpointNotFound = errors.New("webhook endpoint not found")

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) ListEndpoints(ctx context.Context, userID string) ([]Endpoint, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT id, user_id, name, url, events, enabled, last_delivery_status,
		       last_delivery_at, last_delivery_error, created_at, updated_at
		FROM system_webhooks
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list system webhooks: %w", err)
	}
	defer rows.Close()

	endpoints := make([]Endpoint, 0)
	for rows.Next() {
		var endpoint Endpoint
		var eventsBytes []byte
		if err := rows.Scan(
			&endpoint.ID,
			&endpoint.UserID,
			&endpoint.Name,
			&endpoint.URL,
			&eventsBytes,
			&endpoint.Enabled,
			&endpoint.LastDeliveryStatus,
			&endpoint.LastDeliveryAt,
			&endpoint.LastDeliveryError,
			&endpoint.CreatedAt,
			&endpoint.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan system webhook: %w", err)
		}
		_ = json.Unmarshal(eventsBytes, &endpoint.Events)
		endpoints = append(endpoints, endpoint)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate system webhooks: %w", err)
	}
	return endpoints, nil
}

func (r *Repository) ListEnabledForEvent(ctx context.Context, userID, eventType string) ([]Endpoint, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT id, user_id, name, url, signing_secret, events, enabled, last_delivery_status,
		       last_delivery_at, last_delivery_error, created_at, updated_at
		FROM system_webhooks
		WHERE user_id = $1
		  AND enabled = true
		  AND events ? $2
		ORDER BY created_at ASC
	`, userID, eventType)
	if err != nil {
		return nil, fmt.Errorf("list enabled system webhooks: %w", err)
	}
	defer rows.Close()

	endpoints := make([]Endpoint, 0)
	for rows.Next() {
		var endpoint Endpoint
		var eventsBytes []byte
		if err := rows.Scan(
			&endpoint.ID,
			&endpoint.UserID,
			&endpoint.Name,
			&endpoint.URL,
			&endpoint.StoredSecret,
			&eventsBytes,
			&endpoint.Enabled,
			&endpoint.LastDeliveryStatus,
			&endpoint.LastDeliveryAt,
			&endpoint.LastDeliveryError,
			&endpoint.CreatedAt,
			&endpoint.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan enabled system webhook: %w", err)
		}
		_ = json.Unmarshal(eventsBytes, &endpoint.Events)
		endpoints = append(endpoints, endpoint)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate enabled system webhooks: %w", err)
	}
	return endpoints, nil
}

func (r *Repository) CreateEndpoint(ctx context.Context, endpoint *Endpoint) error {
	eventsBytes, _ := json.Marshal(endpoint.Events)
	err := r.db.Pool.QueryRow(ctx, `
		INSERT INTO system_webhooks (user_id, name, url, signing_secret, events, enabled)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, updated_at
	`,
		endpoint.UserID,
		endpoint.Name,
		endpoint.URL,
		endpoint.SigningSecret,
		eventsBytes,
		endpoint.Enabled,
	).Scan(&endpoint.ID, &endpoint.CreatedAt, &endpoint.UpdatedAt)
	if err != nil {
		return fmt.Errorf("create system webhook: %w", err)
	}
	return nil
}

func (r *Repository) GetEndpoint(ctx context.Context, id, userID string) (*Endpoint, error) {
	var endpoint Endpoint
	var eventsBytes []byte
	err := r.db.Pool.QueryRow(ctx, `
		SELECT id, user_id, name, url, signing_secret, events, enabled,
		       last_delivery_status, last_delivery_at, last_delivery_error, created_at, updated_at
		FROM system_webhooks
		WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(
		&endpoint.ID,
		&endpoint.UserID,
		&endpoint.Name,
		&endpoint.URL,
		&endpoint.StoredSecret,
		&eventsBytes,
		&endpoint.Enabled,
		&endpoint.LastDeliveryStatus,
		&endpoint.LastDeliveryAt,
		&endpoint.LastDeliveryError,
		&endpoint.CreatedAt,
		&endpoint.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrEndpointNotFound
		}
		return nil, fmt.Errorf("get system webhook: %w", err)
	}
	_ = json.Unmarshal(eventsBytes, &endpoint.Events)
	return &endpoint, nil
}

func (r *Repository) UpdateEndpoint(ctx context.Context, endpoint *Endpoint) error {
	eventsBytes, _ := json.Marshal(endpoint.Events)
	result, err := r.db.Pool.Exec(ctx, `
		UPDATE system_webhooks
		SET name = $3,
		    url = $4,
		    signing_secret = $5,
		    events = $6,
		    enabled = $7,
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, endpoint.ID, endpoint.UserID, endpoint.Name, endpoint.URL, endpoint.StoredSecret, eventsBytes, endpoint.Enabled)
	if err != nil {
		return fmt.Errorf("update system webhook: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrEndpointNotFound
	}
	return nil
}

func (r *Repository) DeleteEndpoint(ctx context.Context, id, userID string) error {
	result, err := r.db.Pool.Exec(ctx, `
		DELETE FROM system_webhooks
		WHERE id = $1 AND user_id = $2
	`, id, userID)
	if err != nil {
		return fmt.Errorf("delete system webhook: %w", err)
	}
	if result.RowsAffected() == 0 {
		return ErrEndpointNotFound
	}
	return nil
}

func (r *Repository) RecordDelivery(ctx context.Context, delivery Delivery) error {
	_, err := r.db.Pool.Exec(ctx, `
		INSERT INTO system_webhook_deliveries (
			webhook_id, user_id, event_type, event_id, payload, status, status_code,
			latency_ms, attempt_count, max_attempts, next_attempt_at, delivered_at, error_message
		)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)
	`,
		delivery.WebhookID,
		delivery.UserID,
		delivery.EventType,
		delivery.EventID,
		string(delivery.Payload),
		delivery.Status,
		delivery.StatusCode,
		delivery.LatencyMs,
		delivery.AttemptCount,
		delivery.MaxAttempts,
		delivery.NextAttemptAt,
		delivery.DeliveredAt,
		delivery.ErrorMessage,
	)
	if err != nil {
		return fmt.Errorf("record system webhook delivery: %w", err)
	}

	_, err = r.db.Pool.Exec(ctx, `
		UPDATE system_webhooks
		SET last_delivery_status = $3,
		    last_delivery_at = NOW(),
		    last_delivery_error = $4,
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, delivery.WebhookID, delivery.UserID, delivery.Status, delivery.ErrorMessage)
	if err != nil {
		return fmt.Errorf("update system webhook delivery status: %w", err)
	}
	return nil
}

func (r *Repository) ListDeliveries(ctx context.Context, userID string, limit int) ([]Delivery, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT d.id, d.webhook_id, w.name, d.event_type, d.event_id, d.status,
		       d.status_code, d.latency_ms, d.attempt_count, d.max_attempts,
		       d.next_attempt_at, d.delivered_at, d.error_message, d.created_at
		FROM system_webhook_deliveries d
		JOIN system_webhooks w ON w.id = d.webhook_id
		WHERE d.user_id = $1
		ORDER BY d.created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("list system webhook deliveries: %w", err)
	}
	defer rows.Close()

	deliveries := make([]Delivery, 0)
	for rows.Next() {
		var delivery Delivery
		if err := rows.Scan(
			&delivery.ID,
			&delivery.WebhookID,
			&delivery.WebhookName,
			&delivery.EventType,
			&delivery.EventID,
			&delivery.Status,
			&delivery.StatusCode,
			&delivery.LatencyMs,
			&delivery.AttemptCount,
			&delivery.MaxAttempts,
			&delivery.NextAttemptAt,
			&delivery.DeliveredAt,
			&delivery.ErrorMessage,
			&delivery.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan system webhook delivery: %w", err)
		}
		deliveries = append(deliveries, delivery)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate system webhook deliveries: %w", err)
	}
	return deliveries, nil
}

func (r *Repository) ListRetryableDeliveries(ctx context.Context, limit int) ([]Delivery, error) {
	rows, err := r.db.Pool.Query(ctx, `
		SELECT d.id, d.webhook_id, d.user_id, w.name, w.url, w.signing_secret,
		       d.event_type, d.event_id, d.payload, d.attempt_count, d.max_attempts
		FROM system_webhook_deliveries d
		JOIN system_webhooks w ON w.id = d.webhook_id
		WHERE d.status = 'failed'
		  AND d.attempt_count < d.max_attempts
		  AND d.next_attempt_at <= NOW()
		  AND w.enabled = true
		ORDER BY d.next_attempt_at ASC, d.created_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("list retryable webhook deliveries: %w", err)
	}
	defer rows.Close()

	deliveries := make([]Delivery, 0)
	for rows.Next() {
		var delivery Delivery
		if err := rows.Scan(
			&delivery.ID,
			&delivery.WebhookID,
			&delivery.UserID,
			&delivery.WebhookName,
			&delivery.EndpointURL,
			&delivery.EndpointSecret,
			&delivery.EventType,
			&delivery.EventID,
			&delivery.Payload,
			&delivery.AttemptCount,
			&delivery.MaxAttempts,
		); err != nil {
			return nil, fmt.Errorf("scan retryable webhook delivery: %w", err)
		}
		deliveries = append(deliveries, delivery)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate retryable webhook deliveries: %w", err)
	}
	return deliveries, nil
}

func (r *Repository) UpdateDeliveryAttempt(ctx context.Context, delivery Delivery) error {
	_, err := r.db.Pool.Exec(ctx, `
		UPDATE system_webhook_deliveries
		SET status = $2,
		    status_code = $3,
		    latency_ms = $4,
		    attempt_count = $5,
		    next_attempt_at = $6,
		    delivered_at = $7,
		    error_message = $8
		WHERE id = $1
	`, delivery.ID, delivery.Status, delivery.StatusCode, delivery.LatencyMs, delivery.AttemptCount, delivery.NextAttemptAt, delivery.DeliveredAt, delivery.ErrorMessage)
	if err != nil {
		return fmt.Errorf("update webhook delivery attempt: %w", err)
	}

	_, err = r.db.Pool.Exec(ctx, `
		UPDATE system_webhooks
		SET last_delivery_status = $3,
		    last_delivery_at = NOW(),
		    last_delivery_error = $4,
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, delivery.WebhookID, delivery.UserID, delivery.Status, delivery.ErrorMessage)
	if err != nil {
		return fmt.Errorf("update webhook endpoint attempt status: %w", err)
	}
	return nil
}

func (r *Repository) UpsertEventState(ctx context.Context, userID, serverID, eventType, resourceKey, state string) (bool, error) {
	var changed bool
	err := r.db.Pool.QueryRow(ctx, `
		WITH existing AS (
			SELECT state
			FROM system_event_state
			WHERE user_id = $1
			  AND event_type = $3
			  AND resource_key = $4
		),
		inserted AS (
			INSERT INTO system_event_state (user_id, server_id, event_type, resource_key, state)
			SELECT $1, NULLIF($2, '')::uuid, $3, $4, $5
			WHERE NOT EXISTS (SELECT 1 FROM existing)
			ON CONFLICT DO NOTHING
			RETURNING true AS changed
		),
		updated AS (
			UPDATE system_event_state
			SET state = $5,
			    server_id = NULLIF($2, '')::uuid,
			    last_event_at = NOW(),
			    updated_at = NOW()
			WHERE user_id = $1
			  AND event_type = $3
			  AND resource_key = $4
			  AND state IS DISTINCT FROM $5
			RETURNING true AS changed
		)
		SELECT EXISTS (SELECT 1 FROM inserted UNION ALL SELECT 1 FROM updated)
	`, userID, serverID, eventType, resourceKey, state).Scan(&changed)
	if err != nil {
		return false, fmt.Errorf("upsert system event state: %w", err)
	}
	return changed, nil
}
