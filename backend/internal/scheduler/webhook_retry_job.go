package scheduler

import (
	"context"
	"log/slog"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/core/webhook"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

type WebhookRetryJob struct {
	repo   *webhook.Repository
	logger *slog.Logger
	stop   chan struct{}
}

func NewWebhookRetryJob(db *database.DB, logger *slog.Logger) *WebhookRetryJob {
	return &WebhookRetryJob{
		repo:   webhook.NewRepository(db),
		logger: logger.With("component", "WebhookRetryJob"),
		stop:   make(chan struct{}),
	}
}

func (j *WebhookRetryJob) Start() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		j.logger.Info("WebhookRetryJob started")
		j.run()

		for {
			select {
			case <-ticker.C:
				j.run()
			case <-j.stop:
				j.logger.Info("WebhookRetryJob stopped")
				return
			}
		}
	}()
}

func (j *WebhookRetryJob) Stop() {
	close(j.stop)
}

func (j *WebhookRetryJob) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()

	deliveries, err := j.repo.ListRetryableDeliveries(ctx, 20)
	if err != nil {
		j.logger.Warn("failed to list retryable webhook deliveries", "error", err)
		return
	}

	for _, delivery := range deliveries {
		updated := webhook.RetryDelivery(delivery)
		if err := j.repo.UpdateDeliveryAttempt(ctx, updated); err != nil {
			j.logger.Warn("failed to update webhook retry attempt", "delivery_id", delivery.ID, "error", err)
		}
	}
}
