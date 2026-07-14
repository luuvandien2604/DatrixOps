package main

import (
	"context"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
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

	metrics.Version = Version

	if includeSnapshot {
		metrics.Snapshot = collector.CollectSnapshot()
	}

	updateRequired, err := apiClient.SendHeartbeat(ctx, metrics)
	if err != nil {
		log.Printf("Failed to send heartbeat: %v", err)
		return
	}

	log.Printf("Heartbeat sent successfully. CPU: %.2f%%, RAM: %d/%d", metrics.CPUUsage, metrics.MemoryUsed, metrics.MemoryTotal)

	if updateRequired {
		log.Println("🔄 Update required! Initiating auto-update...")
		triggerAutoUpdate()
	}
}

func triggerAutoUpdate() {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command", "Invoke-WebRequest -Uri https://datrixops.vandien.space/install.ps1 -OutFile install.ps1; .\\install.ps1 -Token $env:DATRIXOPS_AGENT_TOKEN")
	} else if runtime.GOOS == "darwin" {
		cmd = exec.Command("sh", "-c", "curl -sL https://datrixops.vandien.space/install-mac.sh | bash -s -- $DATRIXOPS_AGENT_TOKEN")
	} else {
		cmd = exec.Command("sh", "-c", "curl -sL https://datrixops.vandien.space/install.sh | bash -s -- $DATRIXOPS_AGENT_TOKEN")
	}

	// Detach process
	if err := cmd.Start(); err != nil {
		log.Printf("❌ Failed to start auto-update: %v", err)
		return
	}

	log.Println("🚀 Auto-update script launched. Exiting agent to allow replacement...")
	os.Exit(0)
}
