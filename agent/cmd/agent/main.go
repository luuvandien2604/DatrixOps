package main

import (
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/luuvandien2604/DatrixOps/agent/internal/config"
)

var (
	Version   = "dev"
	Commit    = "none"
	BuildTime = "unknown"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	logger.Info("datrixops agent starting",
		"version", Version,
		"server_url", cfg.ServerURL,
		"interval_seconds", cfg.IntervalSeconds,
	)

	// TODO (Sprint 2): Initialize collectors and sender
	// TODO (Sprint 2): Start collection loop

	fmt.Println("DatrixOps Agent is running. Press Ctrl+C to stop.")

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("agent stopped")
}
