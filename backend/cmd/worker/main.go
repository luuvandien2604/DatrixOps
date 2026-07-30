package main

import (
	"context"
	"log/slog"
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

	stopSchedulers := startSchedulers(db, log)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("worker shutting down")
	stopSchedulers()
	time.Sleep(250 * time.Millisecond)
	log.Info("worker stopped")
}

func startSchedulers(db *database.DB, log *slog.Logger) func() {
	websiteRepo := website.NewRepository(db)
	websiteJob := scheduler.NewWebsiteJob(websiteRepo, log)
	websiteJob.Start()

	alertJob := scheduler.NewAlertJob(db, log)
	alertJob.Start()

	webhookRetryJob := scheduler.NewWebhookRetryJob(db, log)
	webhookRetryJob.Start()

	return func() {
		websiteJob.Stop()
		alertJob.Stop()
		webhookRetryJob.Stop()
	}
}
