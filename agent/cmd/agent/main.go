package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/luuvandien2604/DatrixOps/agent/internal/client"
	"github.com/luuvandien2604/DatrixOps/agent/internal/collector"
	"github.com/luuvandien2604/DatrixOps/agent/internal/config"
)

var (
	Version   = "dev"
	Commit    = "none"
	BuildTime = "unknown"
)

func main() {
	log.Println("Starting DatrixOps Agent...")

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	apiClient := client.New(cfg)

	// Graceful shutdown context
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Initial heartbeat immediately on startup with snapshot
	sendHeartbeat(ctx, apiClient, true)

	// Ticker for periodic heartbeats
	ticker := time.NewTicker(time.Duration(cfg.IntervalSeconds) * time.Second)
	defer ticker.Stop()

	var lastSnapshotTime time.Time

	for {
		select {
		case <-ctx.Done():
			log.Println("Agent shutting down gracefully...")
			return
		case <-ticker.C:
			// Send snapshot every 60 seconds
			sendSnapshot := false
			if time.Since(lastSnapshotTime) >= 60*time.Second {
				sendSnapshot = true
				lastSnapshotTime = time.Now()
			}
			sendHeartbeat(ctx, apiClient, sendSnapshot)
		}
	}
}

func sendHeartbeat(ctx context.Context, apiClient *client.DatrixClient, includeSnapshot bool) {
	metrics, err := collector.Collect()
	if err != nil {
		log.Printf("Error collecting metrics: %v", err)
		return
	}

	if includeSnapshot {
		metrics.Snapshot = collector.CollectSnapshot()
	}

	if err := apiClient.SendHeartbeat(ctx, metrics); err != nil {
		log.Printf("Failed to send heartbeat: %v", err)
		return
	}

	log.Printf("Heartbeat sent successfully. CPU: %.2f%%, RAM: %d/%d", metrics.CPUUsage, metrics.MemoryUsed, metrics.MemoryTotal)
}
