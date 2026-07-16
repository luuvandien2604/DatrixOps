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

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("powershell", "-ExecutionPolicy", "Bypass", "-Command", "Invoke-WebRequest -Uri https://datrixops.vandien.space/install.ps1 -OutFile install.ps1; .\\install.ps1 -Token $env:DATRIXOPS_AGENT_TOKEN")
	case "darwin":
		cmd = exec.Command("sh", "-c", "curl -sL https://datrixops.vandien.space/install-mac.sh | bash -s -- $DATRIXOPS_AGENT_TOKEN")
	default: // linux
		cmd = exec.Command("sh", "-c", "curl -sL https://datrixops.vandien.space/install.sh | bash -s -- $DATRIXOPS_AGENT_TOKEN")
	}

	if err := cmd.Start(); err != nil {
		log.Printf("❌ Failed to start auto-update: %v", err)
		return
	}

	log.Println("🚀 Auto-update script launched. Exiting agent to allow replacement...")
	os.Exit(1)
}

// triggerRestart thoát process hiện tại để service manager của OS tự khởi động lại
// (systemd Restart=always trên Linux, launchd KeepAlive trên macOS, Scheduled Task
// restart-on-failure trên Windows). Khác agent_update: không tải lại binary mới.
func triggerRestart() {
	// Đợi đủ thời gian để request báo kết quả task kịp gửi đi trước khi process thoát.
	time.Sleep(2 * time.Second)
	log.Println("🔁 Exiting for restart. Service manager should bring the agent back up...")
	os.Exit(1) // non-zero — xem giải thích trong triggerAutoUpdate() ở trên
}

// triggerReboot khởi động lại toàn bộ máy chủ (khác triggerRestart chỉ restart
// process Agent). Yêu cầu Agent đang chạy với quyền đủ để reboot máy:
// - Linux: agent chạy bằng systemd, mặc định user root nếu không set User= trong service file
// - macOS: agent cài bằng "sudo", LaunchDaemon mặc định chạy quyền root
// - Windows: Scheduled Task chạy dưới tài khoản SYSTEM (đã cấu hình trong install.ps1)
func triggerReboot() {
	time.Sleep(2 * time.Second)

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		// /r: Khởi động lại
		// /t 0: Không chờ giây nào
		// /f: Ép buộc đóng tất cả ứng dụng (Force)
		// /d p:4:1: Ghi chú lý do là "Hệ thống bảo trì" (giúp tránh việc Windows từ chối lệnh)
		cmd = exec.Command("shutdown", "/r", "/t", "0", "/f", "/d", "p:4:1")
	case "darwin":
		cmd = exec.Command("shutdown", "-r", "now")
	default:
		cmd = exec.Command("reboot")
	}

	log.Println("💥 Rebooting host now...")
	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("❌ Reboot command failed: %v | output: %s", err, string(out))
	} else if len(out) > 0 {
		log.Printf("Reboot command output: %s", string(out))
	}
}

func processTask(ctx context.Context, apiClient *client.DatrixClient, task client.Task) {
	// Execute the command based on type
	var cmd *exec.Cmd
	var resultStr string
	var statusStr = "completed"

	// Dùng biến này để "nhớ" hành động cần làm sau khi report xong
	var postAction string

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

	case "agent_update":
		log.Println("Received agent_update task. Initiating auto-update...")
		postAction = "update" // Đánh dấu lại, CHƯA CHẠY NGAY
		statusStr = "completed"
		resultStr = "Auto update initiated"

	case "agent_restart":
		log.Println("Received agent_restart task. Restarting agent process...")
		postAction = "restart" // Đánh dấu lại, CHƯA CHẠY NGAY
		statusStr = "completed"
		resultStr = "Agent restart initiated"

	case "vps_reboot":
		log.Println("Received vps_reboot task. Rebooting host...")
		postAction = "reboot" // Đánh dấu lại, CHƯA CHẠY NGAY
		statusStr = "completed"
		resultStr = "Reboot initiated"

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

	// 1. GỬI BÁO CÁO TRƯỚC: Đảm bảo Backend đã ghi nhận thành công
	err := apiClient.ReportTaskResult(ctx, task.ID, statusStr, resultStr)
	if err != nil {
		log.Printf("Failed to report task %s result: %v", task.ID, err)
	}

	// 2. THỰC THI HÀNH ĐỘNG SAU: Lúc này tắt máy/app là an toàn tuyệt đối
	switch postAction {
	case "update":
		triggerAutoUpdate()
	case "restart":
		triggerRestart()
	case "reboot":
		triggerReboot()
	}
}
