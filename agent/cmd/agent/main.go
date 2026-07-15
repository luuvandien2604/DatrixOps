package main

import (
	"context"
	"encoding/json"
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

	response, err := apiClient.SendHeartbeat(ctx, metrics)
	if err != nil {
		log.Printf("Failed to send heartbeat: %v", err)
		return
	}

	log.Printf("Heartbeat sent successfully. CPU: %.2f%%, RAM: %d/%d", metrics.CPUUsage, metrics.MemoryUsed, metrics.MemoryTotal)

	// Process Tasks
	for _, task := range response.Tasks {
		log.Printf("Received task %s: %s", task.ID, task.Type)
		go processTask(ctx, apiClient, task)
	}

	if response.UpdateRequired {
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

func processTask(ctx context.Context, apiClient *client.DatrixClient, task client.Task) {
	// Execute the command based on type
	var cmd *exec.Cmd
	var resultStr string
	var statusStr = "completed"

	// payload depends on type
	var payload map[string]string
	_ = json.Unmarshal([]byte(task.Payload), &payload)
	containerID := payload["container_id"]

	switch task.Type {
	case "docker_start":
		cmd = exec.Command("docker", "start", containerID)
	case "docker_stop":
		cmd = exec.Command("docker", "stop", containerID)
	case "docker_restart":
		cmd = exec.Command("docker", "restart", containerID)
	case "docker_logs":
		cmd = exec.Command("docker", "logs", "--tail", "100", containerID)
	default:
		statusStr = "failed"
		resultStr = "Unknown task type: " + task.Type
	}

	if cmd != nil {
		out, err := cmd.CombinedOutput()
		if err != nil {
			statusStr = "failed"
			resultStr = string(out) + " Error: " + err.Error()
		} else {
			resultStr = string(out)
		}
	}

	err := apiClient.ReportTaskResult(ctx, task.ID, statusStr, resultStr)
	if err != nil {
		log.Printf("Failed to report task %s result: %v", task.ID, err)
	}
}
