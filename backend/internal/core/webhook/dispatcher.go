package webhook

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
)

type Dispatcher struct {
	repo *Repository
}

func NewDispatcher(db *database.DB) *Dispatcher {
	return &Dispatcher{repo: NewRepository(db)}
}

func (d *Dispatcher) TransitionEventState(ctx context.Context, userID, serverID, eventType, resourceKey, state string) (bool, error) {
	return d.repo.UpsertEventState(ctx, userID, serverID, eventType, resourceKey, state)
}

func (d *Dispatcher) Dispatch(ctx context.Context, userID, eventType string, payload EventPayload) error {
	if !allowedEvents[eventType] {
		return fmt.Errorf("unsupported webhook event: %s", eventType)
	}

	endpoints, err := d.repo.ListEnabledForEvent(ctx, userID, eventType)
	if err != nil {
		return err
	}
	if len(endpoints) == 0 {
		return nil
	}

	if payload.EventID == "" {
		payload.EventID = "evt_" + randomHex(16)
	}
	payload.Event = eventType
	payload.Source = "datrixops.control_plane"
	payload.SentAt = time.Now().UTC()

	payloadBytes, _ := json.Marshal(payload)
	for _, endpoint := range endpoints {
		delivery := RetryDelivery(Delivery{
			UserID:         userID,
			WebhookID:      endpoint.ID,
			WebhookName:    endpoint.Name,
			EndpointURL:    endpoint.URL,
			EndpointSecret: endpoint.StoredSecret,
			EventType:      eventType,
			EventID:        payload.EventID,
			Payload:        payloadBytes,
			MaxAttempts:    3,
		})
		if err := d.repo.RecordDelivery(ctx, delivery); err != nil {
			return err
		}
	}
	return nil
}

func RetryDelivery(delivery Delivery) Delivery {
	delivery.AttemptCount++
	if delivery.MaxAttempts <= 0 {
		delivery.MaxAttempts = 3
	}

	result, sendErr := notifier.SendSignedWebhook(
		delivery.EndpointURL,
		delivery.Payload,
		delivery.EndpointSecret,
		delivery.EventID,
		delivery.EventType,
	)

	statusCode := result.StatusCode
	latencyMs := result.LatencyMs
	delivery.StatusCode = &statusCode
	delivery.LatencyMs = &latencyMs
	if result.StatusCode == 0 {
		delivery.StatusCode = nil
	}
	if result.LatencyMs == 0 {
		delivery.LatencyMs = nil
	}

	if sendErr == nil {
		now := time.Now().UTC()
		delivery.Status = "delivered"
		delivery.DeliveredAt = &now
		delivery.NextAttemptAt = nil
		delivery.ErrorMessage = nil
		return delivery
	}

	message := sendErr.Error()
	delivery.ErrorMessage = &message
	if delivery.AttemptCount >= delivery.MaxAttempts {
		delivery.Status = "dead"
		delivery.NextAttemptAt = nil
		return delivery
	}

	delivery.Status = "failed"
	nextAttempt := time.Now().UTC().Add(retryDelay(delivery.AttemptCount))
	delivery.NextAttemptAt = &nextAttempt
	return delivery
}

func retryDelay(attempt int) time.Duration {
	switch attempt {
	case 1:
		return time.Minute
	case 2:
		return 5 * time.Minute
	default:
		return 15 * time.Minute
	}
}
