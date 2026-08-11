package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
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
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/luuvandien2604/DatrixOps/agent/internal/client"
	"github.com/luuvandien2604/DatrixOps/agent/internal/collector"
	"github.com/luuvandien2604/DatrixOps/agent/internal/config"
	"github.com/luuvandien2604/DatrixOps/agent/internal/terminal"
	"github.com/luuvandien2604/DatrixOps/agent/internal/uninstall"
	agentupdate "github.com/luuvandien2604/DatrixOps/agent/internal/update"
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
	// Detached uninstall helpers reuse the Agent binary but must bypass normal
	// configuration, heartbeat, and terminal startup.
	if handled, err := uninstall.RunHelperFromArgs(os.Args[1:]); handled {
		if err != nil {
			log.Fatalf("Agent uninstall helper failed: %v", err)
		}
		return
	}
	if handled, exitCode := runCronWrapperFromArgs(os.Args[1:]); handled {
		os.Exit(exitCode)
	}

	log.Printf("Starting DatrixOps Agent %s (%s)...", Version, VersionMarker)

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	apiClient := client.New(cfg)

	// Graceful shutdown context
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	terminalSupport := terminal.EnvironmentSupport()
	if terminalSupport.Supported {
		go terminal.Run(ctx, cfg)
	} else {
		log.Printf("Terminal reverse channel disabled: %s", terminalSupport.Reason)
	}

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
	terminalSupport := terminal.EnvironmentSupport()
	metrics.TerminalSupported = terminalSupport.Supported
	metrics.TerminalUnsupportedReason = terminalSupport.Reason
	metrics.TerminalChannelConnected = terminal.Connected()
	metrics.TerminalChannelError = terminal.LastError()
	metrics.RemoteUninstallSupported = uninstall.Supported()

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

type agentUpdatePayload struct {
	TargetVersion  string `json:"target_version"`
	ReleaseBaseURL string `json:"release_base_url"`
	ReleaseLayout  string `json:"release_layout"`
}

func prepareAgentUpdate(ctx context.Context, payload agentUpdatePayload) error {
	binaryURL, expectedSHA256, expectedSize, err := agentBinaryURL(ctx, payload)
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
	if expectedSize > 0 && written != expectedSize {
		_ = os.Remove(updatePath)
		return fmt.Errorf("downloaded update size mismatch: got %d bytes, expected %d", written, expectedSize)
	}
	if expectedSHA256 != "" {
		if err := validateFileSHA256(updatePath, expectedSHA256); err != nil {
			_ = os.Remove(updatePath)
			return err
		}
	}
	if err := validateStagedBinary(updatePath); err != nil {
		_ = os.Remove(updatePath)
		return err
	}
	if strings.TrimSpace(payload.TargetVersion) != "" {
		if err := validateEmbeddedAgentVersion(updatePath, payload.TargetVersion); err != nil {
			_ = os.Remove(updatePath)
			return err
		}
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

func validateFileSHA256(path, expected string) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open staged update for checksum: %w", err)
	}
	defer file.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return fmt.Errorf("hash staged update: %w", err)
	}
	actual := hex.EncodeToString(hasher.Sum(nil))
	if !strings.EqualFold(actual, strings.TrimSpace(expected)) {
		return fmt.Errorf("downloaded update checksum mismatch: got %s, expected %s", actual, expected)
	}
	return nil
}

func validateEmbeddedAgentVersion(path, targetVersion string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read staged update for version validation: %w", err)
	}
	marker := "datrixops-agent-version=" + strings.TrimSpace(targetVersion)
	if !bytes.Contains(content, []byte(marker)) {
		return fmt.Errorf("downloaded update does not contain expected version marker %s", marker)
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

func agentBinaryURL(ctx context.Context, payload agentUpdatePayload) (string, string, int64, error) {
	targetVersion := strings.TrimSpace(payload.TargetVersion)
	if targetVersion == "" {
		return "", "", 0, fmt.Errorf("agent update payload is missing target_version")
	}
	semverRegex := regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)
	if !semverRegex.MatchString(targetVersion) {
		return "", "", 0, fmt.Errorf("invalid target_version format %q (must match X.Y.Z)", targetVersion)
	}

	baseURL := strings.TrimRight(strings.TrimSpace(payload.ReleaseBaseURL), "/")
	if baseURL == "" {
		return "", "", 0, fmt.Errorf("agent update payload is missing release_base_url")
	}

	// Layout precedence: task payload -> local Agent configuration -> error
	rawLayout := strings.TrimSpace(payload.ReleaseLayout)
	if rawLayout == "" {
		if envLayout := strings.TrimSpace(os.Getenv("DATRIXOPS_AGENT_RELEASE_LAYOUT")); envLayout != "" {
			rawLayout = envLayout
		} else {
			return "", "", 0, fmt.Errorf("release layout is not specified in update task payload or local agent configuration")
		}
	}
	layout, err := agentupdate.ParseLayout(rawLayout)
	if err != nil {
		return "", "", 0, fmt.Errorf("parse release layout: %w", err)
	}

	publicKey, err := agentupdate.ReleasePublicKey()
	if err != nil {
		return "", "", 0, err
	}
	updateClient := agentupdate.NewClient(publicKey)

	manifestURL, err := agentupdate.ManifestURL(baseURL, layout, targetVersion)
	if err != nil {
		return "", "", 0, fmt.Errorf("resolve manifest URL: %w", err)
	}
	signatureURL, err := agentupdate.SignatureURL(baseURL, layout, targetVersion)
	if err != nil {
		return "", "", 0, fmt.Errorf("resolve signature URL: %w", err)
	}

	manifest, err := updateClient.FetchManifest(ctx, manifestURL, signatureURL)
	if err != nil {
		return "", "", 0, err
	}
	if manifest.Version != targetVersion {
		return "", "", 0, fmt.Errorf("release manifest version mismatch: got %s, expected %s", manifest.Version, targetVersion)
	}
	artifact, err := manifest.ArtifactFor(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		return "", "", 0, err
	}

	artifactURL, err := agentupdate.ArtifactURL(baseURL, layout, targetVersion, artifact.URL)
	if err != nil {
		return "", "", 0, fmt.Errorf("resolve artifact URL: %w", err)
	}

	return artifactURL, artifact.SHA256, artifact.Size, nil
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
		} else {
			log.Printf("Launched Windows update helper %s", scriptPath)
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

	// postAction defers destructive/restart actions until the backend has
	// acknowledged the task result.
	var postAction string
	var preparedUninstall *uninstall.Prepared

	// payload depends on type. Decode into map[string]any first so boolean or
	// numeric policy fields do not break string fields such as script_id.
	var rawPayload map[string]any
	_ = json.Unmarshal([]byte(task.Payload), &rawPayload)
	payloadValue := func(key string) string {
		value, ok := rawPayload[key]
		if !ok || value == nil {
			return ""
		}
		switch typed := value.(type) {
		case string:
			return typed
		case float64:
			return strconv.FormatInt(int64(typed), 10)
		case bool:
			if typed {
				return "true"
			}
			return "false"
		default:
			return fmt.Sprint(typed)
		}
	}
	payload := map[string]string{
		"container_id":       payloadValue("container_id"),
		"service_name":       payloadValue("service_name"),
		"service_manager":    payloadValue("service_manager"),
		"script_id":          payloadValue("script_id"),
		"source":             payloadValue("source"),
		"unit":               payloadValue("unit"),
		"lines":              payloadValue("lines"),
		"target_version":     payloadValue("target_version"),
		"release_base_url":   payloadValue("release_base_url"),
		"release_layout":     payloadValue("release_layout"),
		"server_id":          payloadValue("server_id"),
		"confirm_url":        payloadValue("confirm_url"),
		"confirm_token":      payloadValue("confirm_token"),
		"output_limit_bytes": payloadValue("output_limit_bytes"),
	}
	containerID := payload["container_id"]
	serviceName := payload["service_name"]
	serviceManager := payload["service_manager"]
	scriptID := payload["script_id"]
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

		case "script_run":
			log.Printf("Received script_run task: %s", scriptID)
			scriptResult, scriptErr := executeAllowlistedScript(taskContext, scriptID)
			outputLimit := parseTaskOutputLimit(payload["output_limit_bytes"], 12000, 1024, 20000)
			resultStr = limitTaskOutput(scriptResult, outputLimit)
			if scriptErr != nil {
				statusStr = "failed"
				resultStr = limitTaskOutput(scriptResult+" Error: "+scriptErr.Error(), outputLimit)
			}

		case "log_read":
			log.Printf("Received read-only log task")
			logResult, logErr := executeReadOnlyLog(taskContext, payload)
			resultStr = limitTaskOutput(logResult, 20000)
			if logErr != nil {
				statusStr = "failed"
				resultStr = limitTaskOutput(logResult+" Error: "+logErr.Error(), 20000)
			}

		case "agent_update":
			log.Println("Received agent_update task. Downloading the current release...")
			updatePayload := agentUpdatePayload{
				TargetVersion:  payload["target_version"],
				ReleaseBaseURL: payload["release_base_url"],
				ReleaseLayout:  payload["release_layout"],
			}
			if err := prepareAgentUpdate(taskContext, updatePayload); err != nil {
				statusStr = "failed"
				resultStr = "Unable to stage agent update: " + err.Error()
			} else {
				postAction = "update"
				statusStr = "completed"
				resultStr = "Agent update staged; activation requested. Waiting for the new version heartbeat."
			}

		case "agent_uninstall":
			log.Println("Received agent_uninstall task. Preparing detached Linux helper...")
			uninstallRequest := uninstall.Request{
				ServerID:     payload["server_id"],
				TaskID:       task.ID,
				ConfirmURL:   payload["confirm_url"],
				ConfirmToken: payload["confirm_token"],
			}
			prepared, err := uninstall.Prepare(uninstallRequest)
			if err != nil {
				statusStr = "failed"
				resultStr = "Unable to prepare Agent uninstall: " + err.Error()
			} else {
				preparedUninstall = prepared
				postAction = "uninstall"
				statusStr = "completed"
				resultStr = "Detached Agent uninstall helper prepared"
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
			if postAction == "uninstall" {
				uninstall.Cleanup(preparedUninstall)
			}
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
	case "uninstall":
		if err := uninstall.Activate(preparedUninstall); err != nil {
			log.Printf("Failed to activate Agent uninstall helper: %v", err)
			if preparedUninstall != nil {
				confirmCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				defer cancel()
				if confirmErr := uninstall.Confirm(
					confirmCtx,
					preparedUninstall.Request,
					"failed",
					err.Error(),
				); confirmErr != nil {
					log.Printf("Failed to report uninstall activation failure: %v", confirmErr)
				}
			}
		}
	}
}

func executeAllowlistedScript(ctx context.Context, scriptID string) (string, error) {
	if runtime.GOOS != "linux" {
		return "", fmt.Errorf("script library is currently supported only on Linux")
	}
	switch scriptID {
	case "system_health_summary":
		return combinedOutput(ctx, "sh", "-c", "printf '== uptime ==\\n'; uptime; printf '\\n== disk ==\\n'; df -hT -x tmpfs -x devtmpfs; printf '\\n== memory ==\\n'; free -m; printf '\\n== top cpu ==\\n'; ps -eo pid,user,comm,%cpu,%mem --sort=-%cpu | head -n 12")
	case "journal_errors_recent":
		return combinedOutput(ctx, "journalctl", "-p", "warning..alert", "-n", "120", "--no-pager", "-o", "short-iso")
	case "restart_nginx":
		return combinedOutput(ctx, "systemctl", "restart", "nginx")
	default:
		return "", fmt.Errorf("script is not allowlisted")
	}
}

func executeReadOnlyLog(ctx context.Context, payload map[string]string) (string, error) {
	if runtime.GOOS != "linux" {
		return "", fmt.Errorf("read-only log viewer is currently supported only on Linux")
	}
	lines := payload["lines"]
	if lines == "" {
		lines = "200"
	}
	switch payload["source"] {
	case "journal":
		args := []string{"-n", lines, "--no-pager", "-o", "short-iso"}
		if unit := strings.TrimSpace(payload["unit"]); unit != "" {
			args = append([]string{"-u", unit}, args...)
		}
		return combinedOutput(ctx, "journalctl", args...)
	case "nginx_access":
		return combinedOutput(ctx, "tail", "-n", lines, "/var/log/nginx/access.log")
	case "nginx_error":
		return combinedOutput(ctx, "tail", "-n", lines, "/var/log/nginx/error.log")
	case "mysql_error":
		path := firstExistingLogPath(
			"/var/log/mysql/error.log",
			"/var/log/mysqld.log",
			"/var/log/mariadb/mariadb.log",
		)
		if path == "" {
			return "", fmt.Errorf("no supported MySQL or MariaDB error log path was found")
		}
		return combinedOutput(ctx, "tail", "-n", lines, path)
	case "docker":
		containerID := payload["container_id"]
		if !containerIdentifierPattern.MatchString(containerID) {
			return "", fmt.Errorf("invalid or missing container identifier")
		}
		return combinedOutput(ctx, "docker", "logs", "--tail", lines, containerID)
	default:
		return "", fmt.Errorf("unsupported read-only log source")
	}
}

func combinedOutput(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	output, err := cmd.CombinedOutput()
	return string(output), err
}

func firstExistingLogPath(paths ...string) string {
	for _, path := range paths {
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			return path
		}
	}
	return ""
}

func limitTaskOutput(output string, limit int) string {
	if limit <= 0 || len(output) <= limit {
		return output
	}
	return output[:limit] + "\n...[truncated]"
}

func parseTaskOutputLimit(raw string, fallback, minLimit, maxLimit int) int {
	limit, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return fallback
	}
	if limit < minLimit {
		return minLimit
	}
	if limit > maxLimit {
		return maxLimit
	}
	return limit
}
