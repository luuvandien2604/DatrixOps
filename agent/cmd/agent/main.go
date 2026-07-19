package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/luuvandien2604/DatrixOps/agent/internal/client"
	"github.com/luuvandien2604/DatrixOps/agent/internal/collector"
	"github.com/luuvandien2604/DatrixOps/agent/internal/config"
	"github.com/luuvandien2604/DatrixOps/agent/internal/terminal"
)

var (
	Version       = "dev"
	VersionMarker = "datrixops-agent-version=dev"
	Commit        = "none"
	BuildTime     = "unknown"
)

var (
	containerIdentifierPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$`)
	serviceIdentifierPattern   = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.@:$ -]{0,199}$`)
)

func main() {
	log.Printf("Starting DatrixOps Agent %s (%s)...", Version, VersionMarker)

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	apiClient := client.New(cfg)

	// Graceful shutdown context
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go terminal.Run(ctx, cfg)

	// Initial heartbeat immediately on startup with snapshot
	sendHeartbeat(ctx, apiClient, true, cfg.MonitoredServices)

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
			sendHeartbeat(ctx, apiClient, sendSnapshot, cfg.MonitoredServices)
		}
	}
}

func sendHeartbeat(ctx context.Context, apiClient *client.DatrixClient, includeSnapshot bool, monitoredServices []string) {
	metrics, err := collector.Collect()
	if err != nil {
		log.Printf("Error collecting metrics: %v", err)
		return
	}

	metrics.Version = Version
	metrics.TerminalChannelConnected = terminal.Connected()

	if includeSnapshot {
		metrics.Snapshot = collector.CollectSnapshot(Version, monitoredServices)
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

	if response.UpdateAvailable || response.UpdateRequired {
		log.Printf("Agent update available (%s). Waiting for an approved agent_update task.", response.LatestVersion)
	}
}

func prepareAgentUpdate(ctx context.Context) error {
	binaryURL, err := agentBinaryURL()
	if err != nil {
		return err
	}
	executablePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve agent executable: %w", err)
	}
	executablePath, err = filepath.Abs(executablePath)
	if err != nil {
		return fmt.Errorf("resolve absolute executable path: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, binaryURL, nil)
	if err != nil {
		return fmt.Errorf("create update request: %w", err)
	}
	response, err := (&http.Client{Timeout: 2 * time.Minute}).Do(request)
	if err != nil {
		return fmt.Errorf("download update: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("download update: unexpected HTTP status %d", response.StatusCode)
	}

	updatePath := executablePath + ".update"
	updateFile, err := os.OpenFile(updatePath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0755)
	if err != nil {
		return fmt.Errorf("create staged update: %w", err)
	}
	written, copyErr := io.Copy(updateFile, io.LimitReader(response.Body, 256<<20))
	closeErr := updateFile.Close()
	if copyErr != nil {
		_ = os.Remove(updatePath)
		return fmt.Errorf("write staged update: %w", copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(updatePath)
		return fmt.Errorf("close staged update: %w", closeErr)
	}
	if written == 0 {
		_ = os.Remove(updatePath)
		return fmt.Errorf("downloaded update is empty")
	}
	if err := validateStagedBinary(updatePath); err != nil {
		_ = os.Remove(updatePath)
		return err
	}

	if runtime.GOOS == "windows" {
		return writeWindowsUpdateScript(executablePath, updatePath)
	}
	if err := os.Chmod(updatePath, 0755); err != nil {
		_ = os.Remove(updatePath)
		return fmt.Errorf("mark staged update executable: %w", err)
	}
	if err := os.Rename(updatePath, executablePath); err != nil {
		_ = os.Remove(updatePath)
		return fmt.Errorf("replace agent binary: %w", err)
	}
	return nil
}

func validateStagedBinary(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open staged update for validation: %w", err)
	}
	defer file.Close()

	header := make([]byte, 4)
	if _, err := io.ReadFull(file, header); err != nil {
		return fmt.Errorf("read staged update header: %w", err)
	}
	valid := false
	switch runtime.GOOS {
	case "linux":
		valid = bytes.Equal(header, []byte{0x7f, 'E', 'L', 'F'})
	case "windows":
		valid = header[0] == 'M' && header[1] == 'Z'
	case "darwin":
		valid = bytes.Equal(header, []byte{0xfe, 0xed, 0xfa, 0xce}) ||
			bytes.Equal(header, []byte{0xfe, 0xed, 0xfa, 0xcf}) ||
			bytes.Equal(header, []byte{0xce, 0xfa, 0xed, 0xfe}) ||
			bytes.Equal(header, []byte{0xcf, 0xfa, 0xed, 0xfe}) ||
			bytes.Equal(header, []byte{0xca, 0xfe, 0xba, 0xbe})
	}
	if !valid {
		return fmt.Errorf("downloaded file is not a valid %s agent binary", runtime.GOOS)
	}
	return nil
}

func agentBinaryURL() (string, error) {
	baseURL := "https://datrixops.vandien.space"
	switch runtime.GOOS {
	case "linux":
		if runtime.GOARCH != "amd64" && runtime.GOARCH != "arm64" {
			return "", fmt.Errorf("unsupported Linux architecture %s", runtime.GOARCH)
		}
		return fmt.Sprintf("%s/datrixops-agent-linux-%s", baseURL, runtime.GOARCH), nil
	case "darwin":
		if runtime.GOARCH != "amd64" && runtime.GOARCH != "arm64" {
			return "", fmt.Errorf("unsupported macOS architecture %s", runtime.GOARCH)
		}
		return fmt.Sprintf("%s/datrixops-agent-darwin-%s", baseURL, runtime.GOARCH), nil
	case "windows":
		if runtime.GOARCH != "amd64" {
			return "", fmt.Errorf("unsupported Windows architecture %s", runtime.GOARCH)
		}
		return baseURL + "/datrixops-agent-windows-amd64.exe", nil
	default:
		return "", fmt.Errorf("unsupported operating system %s", runtime.GOOS)
	}
}

func writeWindowsUpdateScript(executablePath, updatePath string) error {
	escape := func(value string) string { return strings.ReplaceAll(value, "'", "''") }
	scriptPath := executablePath + ".update.ps1"
	script := fmt.Sprintf(`$ErrorActionPreference = 'Stop'
Wait-Process -Id %d -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 750
Move-Item -LiteralPath '%s' -Destination '%s' -Force
Start-ScheduledTask -TaskName 'DatrixOpsAgent'
Remove-Item -LiteralPath $MyInvocation.MyCommand.Path -Force
`, os.Getpid(), escape(updatePath), escape(executablePath))
	if err := os.WriteFile(scriptPath, []byte(script), 0600); err != nil {
		_ = os.Remove(updatePath)
		return fmt.Errorf("write Windows update script: %w", err)
	}
	return nil
}

func activatePreparedAgentUpdate() {
	if runtime.GOOS == "windows" {
		executablePath, err := os.Executable()
		if err != nil {
			log.Printf("Failed to resolve agent executable for activation: %v", err)
			return
		}
		scriptPath := executablePath + ".update.ps1"
		cmd := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath)
		if err := cmd.Start(); err != nil {
			log.Printf("Failed to launch Windows update helper: %v", err)
			return
		}
	}
	if runtime.GOOS == "linux" {
		unitName := fmt.Sprintf("datrixops-agent-update-%d", os.Getpid())
		if path, err := exec.LookPath("systemd-run"); err == nil {
			systemctlPath, systemctlErr := exec.LookPath("systemctl")
			if systemctlErr != nil {
				systemctlPath = "/bin/systemctl"
			}
			cmd := exec.Command(
				path,
				"--unit", unitName,
				"--on-active=1s",
				"--property=Type=oneshot",
				systemctlPath, "restart", "datrixops-agent",
			)
			if output, err := cmd.CombinedOutput(); err != nil {
				log.Printf("Failed to schedule systemd restart helper: %v | output: %s", err, string(output))
			} else {
				log.Printf("Scheduled systemd restart helper %s", unitName)
			}
		} else {
			log.Printf("systemd-run not found; falling back to process exit restart: %v", err)
		}
	}
	if runtime.GOOS == "darwin" {
		cmd := exec.Command("launchctl", "kickstart", "-k", "system/com.datrixops.agent")
		if output, err := cmd.CombinedOutput(); err != nil {
			log.Printf("Failed to request launchd agent restart: %v | output: %s", err, string(output))
		}
	}
	log.Println("Agent update staged successfully. Exiting so the service manager starts the new binary...")
	os.Exit(1)
}

// triggerRestart thoát process hiện tại để service manager của OS tự khởi động lại
// (systemd Restart=always trên Linux, launchd KeepAlive trên macOS, Scheduled Task
// restart-on-failure trên Windows). Khác agent_update: không tải lại binary mới.
func triggerRestart() {
	// Đợi đủ thời gian để request báo kết quả task kịp gửi đi trước khi process thoát.
	time.Sleep(2 * time.Second)
	log.Println("🔁 Exiting for restart. Service manager should bring the agent back up...")
	os.Exit(1) // non-zero so Windows Task Scheduler applies restart-on-failure
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
	timeout := time.Duration(task.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	taskContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

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
	serviceName := payload["service_name"]
	serviceManager := payload["service_manager"]
	isDockerTask := task.Type == "docker_start" || task.Type == "docker_stop" || task.Type == "docker_restart" || task.Type == "docker_logs"
	serviceActions := map[string]string{
		"service_start":   "start",
		"service_stop":    "stop",
		"service_restart": "restart",
		"service_reload":  "reload",
	}
	serviceAction, isServiceTask := serviceActions[task.Type]
	if isDockerTask && !containerIdentifierPattern.MatchString(containerID) {
		statusStr = "failed"
		resultStr = "Invalid or missing container identifier"
	} else if isServiceTask && !serviceIdentifierPattern.MatchString(serviceName) {
		statusStr = "failed"
		resultStr = "Invalid or missing service identifier"
	} else if isServiceTask {
		log.Printf("Received %s task for %s (%s)", task.Type, serviceName, serviceManager)
		serviceResult, serviceErr := executeServiceAction(taskContext, serviceAction, serviceName, serviceManager)
		resultStr = serviceResult
		if serviceErr != nil {
			statusStr = "failed"
			resultStr = serviceErr.Error()
		}
	} else {

		switch task.Type {
		case "docker_start":
			cmd = exec.CommandContext(taskContext, "docker", "start", containerID)
		case "docker_stop":
			cmd = exec.CommandContext(taskContext, "docker", "stop", containerID)
		case "docker_restart":
			cmd = exec.CommandContext(taskContext, "docker", "restart", containerID)
		case "docker_logs":
			cmd = exec.CommandContext(taskContext, "docker", "logs", "--tail", "100", containerID)

		case "agent_update":
			log.Println("Received agent_update task. Downloading the current release...")
			if err := prepareAgentUpdate(taskContext); err != nil {
				statusStr = "failed"
				resultStr = "Unable to stage agent update: " + err.Error()
			} else {
				postAction = "update"
				statusStr = "completed"
				resultStr = "Agent update staged; activation requested. Waiting for the new version heartbeat."
			}

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
	}

	if cmd != nil {
		out, err := cmd.CombinedOutput()
		if err != nil {
			statusStr = "failed"
			if taskContext.Err() == context.DeadlineExceeded {
				resultStr = string(out) + " Error: task timed out"
			} else {
				resultStr = string(out) + " Error: " + err.Error()
			}
		} else {
			resultStr = string(out)
		}
	}

	// 1. GỬI BÁO CÁO TRƯỚC: Đảm bảo Backend đã ghi nhận thành công
	err := apiClient.ReportTaskResult(ctx, task.ID, statusStr, resultStr)
	if err != nil {
		log.Printf("Failed to report task %s result: %v", task.ID, err)
		if postAction != "" {
			log.Printf("Skipping post-task action %q because acknowledgement failed", postAction)
			return
		}
	}

	// 2. THỰC THI HÀNH ĐỘNG SAU: Lúc này tắt máy/app là an toàn tuyệt đối
	switch postAction {
	case "update":
		activatePreparedAgentUpdate()
	case "restart":
		triggerRestart()
	case "reboot":
		triggerReboot()
	}
}
