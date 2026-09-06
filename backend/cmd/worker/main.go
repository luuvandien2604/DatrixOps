package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/core/website"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/logger"
	"github.com/luuvandien2604/DatrixOps/backend/internal/scheduler"
)

func main() {
	log := logger.New()
	cfg, err := config.Load()
	if err != nil {
		log.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	db, err := database.Connect(context.Background(), cfg.DatabaseURL, log)
	if err != nil {
		log.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.VerifySchema(context.Background()); err != nil {
		log.Error("database schema verification failed", "error", err)
		os.Exit(1)
	}

	healthServer := startHealthServer(log)
	defer stopHealthServer(healthServer, log)
	stopHeartbeat := startWorkerHeartbeat(db, log)
	defer stopHeartbeat()

	stopSchedulers := startSchedulers(db, log, cfg)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("worker shutting down")
	stopSchedulers()
	time.Sleep(250 * time.Millisecond)
	log.Info("worker stopped")
}

func startHealthServer(log *slog.Logger) *http.Server {
	port := os.Getenv("WORKER_HEALTH_PORT")
	if port == "" {
		port = "8081"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","component":"worker"}`))
	})
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      5 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	go func() {
		log.Info("worker health server starting", "port", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("worker health server failed", "error", err)
		}
	}()
	return server
}

func stopHealthServer(server *http.Server, log *slog.Logger) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Warn("worker health server shutdown failed", "error", err)
	}
}

func startWorkerHeartbeat(db *database.DB, log *slog.Logger) func() {
	ctx, cancel := context.WithCancel(context.Background())
	update := func() {
		updateCtx, updateCancel := context.WithTimeout(ctx, 5*time.Second)
		defer updateCancel()
		_, err := db.Pool.Exec(updateCtx,
			`INSERT INTO system_runtime (component, status, metadata, updated_at)
			 VALUES ('worker', 'healthy', '{}'::jsonb, NOW())
			 ON CONFLICT (component) DO UPDATE
			 SET status = EXCLUDED.status,
			     metadata = EXCLUDED.metadata,
			     updated_at = EXCLUDED.updated_at`,
		)
		if err != nil && ctx.Err() == nil {
			log.Warn("failed to persist worker heartbeat", "error", err)
		}
	}
	update()
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				update()
			}
		}
	}()
	return cancel
}

func startSchedulers(db *database.DB, log *slog.Logger, cfg *config.Config) func() {
	websiteRepo := website.NewRepository(db)
	websiteJob := scheduler.NewWebsiteJob(websiteRepo, db, log)
	websiteJob.Start()

	alertJob := scheduler.NewAlertJob(db, log)
	alertJob.Start()

	webhookRetryJob := scheduler.NewWebhookRetryJob(db, log)
	webhookRetryJob.Start()

	retentionJob := scheduler.NewRetentionJob(db, log, cfg.MetricsRetentionDays, cfg.OperationalRetentionDays)
	retentionJob.Start()

	return func() {
		websiteJob.Stop()
		alertJob.Stop()
		webhookRetryJob.Stop()
		retentionJob.Stop()
	}
}
