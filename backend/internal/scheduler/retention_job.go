package scheduler

import (
	"context"
	"log/slog"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

// RetentionJob bounds high-volume operational tables. It intentionally uses
// small batches so cleanup cannot monopolize PostgreSQL on a small VPS.
type RetentionJob struct {
	db              *database.DB
	logger          *slog.Logger
	metricsDays     int
	operationalDays int
	stop            chan struct{}
}

func NewRetentionJob(db *database.DB, logger *slog.Logger, metricsDays, operationalDays int) *RetentionJob {
	return &RetentionJob{
		db:              db,
		logger:          logger.With("component", "RetentionJob"),
		metricsDays:     metricsDays,
		operationalDays: operationalDays,
		stop:            make(chan struct{}),
	}
}

func (j *RetentionJob) Start() {
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		j.run()
		for {
			select {
			case <-ticker.C:
				j.run()
			case <-j.stop:
				return
			}
		}
	}()
}

func (j *RetentionJob) Stop() {
	close(j.stop)
}

func (j *RetentionJob) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	j.deleteBatches(ctx, "server_metrics", "created_at", j.metricsDays)
	j.deleteBatches(ctx, "website_checks", "checked_at", j.metricsDays)
	j.deleteBatches(ctx, "dashboard_notifications", "created_at", j.operationalDays)
	j.deleteBatches(ctx, "system_webhook_deliveries", "created_at", j.operationalDays)
	j.deleteBatches(ctx, "terminal_sessions", "started_at", j.operationalDays)
}

func (j *RetentionJob) deleteBatches(ctx context.Context, table, timestampColumn string, days int) {
	// Table and column names are compile-time constants supplied only above.
	query := "DELETE FROM " + table + " WHERE ctid IN (" +
		"SELECT ctid FROM " + table + " WHERE " + timestampColumn +
		" < NOW() - make_interval(days => $1) LIMIT 5000)"
	for batch := 0; batch < 20; batch++ {
		result, err := j.db.Pool.Exec(ctx, query, days)
		if err != nil {
			j.logger.Warn("retention cleanup failed", "table", table, "error", err)
			return
		}
		if result.RowsAffected() < 5000 {
			return
		}
	}
}
