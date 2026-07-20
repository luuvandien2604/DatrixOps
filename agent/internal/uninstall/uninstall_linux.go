//go:build linux

package uninstall

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const (
	linuxServiceName = "datrixops-agent.service"
	linuxServiceFile = "/etc/systemd/system/datrixops-agent.service"
	linuxDropInDir   = "/etc/systemd/system/datrixops-agent.service.d"
)

// platformSupported verifies the privileges and systemd commands required by
// the Linux detached helper before advertising capability to the backend.
func platformSupported() bool {
	if os.Geteuid() != 0 {
		return false
	}
	if _, err := exec.LookPath("systemd-run"); err != nil {
		return false
	}
	if _, err := exec.LookPath("systemctl"); err != nil {
		return false
	}
	return true
}

// preparePlatform copies the running binary to /tmp and writes a mode-0600
// request file. The temporary copy is needed because the helper later removes
// the installed Agent binary while it is still executing.
func preparePlatform(req Request) (*Prepared, error) {
	executablePath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("resolve Agent executable: %w", err)
	}
	executablePath, err = filepath.Abs(executablePath)
	if err != nil {
		return nil, fmt.Errorf("resolve absolute Agent executable: %w", err)
	}

	stamp := fmt.Sprintf("%d-%d", os.Getpid(), time.Now().UnixNano())
	helperDirectory := "/usr/local/libexec/datrixops"
	if err := os.MkdirAll(helperDirectory, 0o700); err != nil {
		return nil, fmt.Errorf("create uninstall helper directory: %w", err)
	}
	if err := os.Chmod(helperDirectory, 0o700); err != nil {
		return nil, fmt.Errorf("secure uninstall helper directory: %w", err)
	}
	helperPath := filepath.Join(helperDirectory, "datrixops-agent-uninstall-"+stamp)
	requestPath := helperPath + ".json"

	if err := copyExecutable(executablePath, helperPath); err != nil {
		return nil, err
	}

	req.ExecutablePath = executablePath
	if err := writeRequestFile(requestPath, req); err != nil {
		_ = os.Remove(helperPath)
		return nil, err
	}

	return &Prepared{
		Request:     req,
		HelperPath:  helperPath,
		RequestPath: requestPath,
	}, nil
}

// activatePlatform launches the helper as an independent transient systemd
// unit. --no-block returns immediately so processTask can finish cleanly.
func activatePlatform(prepared *Prepared) error {
	systemdRun, err := exec.LookPath("systemd-run")
	if err != nil {
		cleanupPrepared(prepared)
		return fmt.Errorf("systemd-run is required for safe Agent uninstall: %w", err)
	}

	unitName := fmt.Sprintf("datrixops-agent-uninstall-%d", time.Now().UnixNano())
	cmd := exec.Command(
		systemdRun,
		"--unit", unitName,
		"--collect",
		"--no-block",
		"--property=Type=oneshot",
		"--property=KillMode=process",
		"--",
		prepared.HelperPath,
		helperFileArgument,
		prepared.RequestPath,
	)
	if output, err := cmd.CombinedOutput(); err != nil {
		cleanupPrepared(prepared)
		return fmt.Errorf("start detached uninstall helper: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

// runPlatformHelper performs the destructive Linux cleanup after the main
// Agent has acknowledged the task. The helper always attempts a backend
// callback, even when one or more cleanup steps fail.
func runPlatformHelper(requestPath string) error {
	helperExecutable, _ := os.Executable()
	defer func() {
		_ = os.Remove(requestPath)
		if helperExecutable != "" {
			_ = os.Remove(helperExecutable)
			_ = os.Remove(filepath.Dir(helperExecutable))
		}
	}()

	content, err := os.ReadFile(requestPath)
	if err != nil {
		return fmt.Errorf("read uninstall request file: %w", err)
	}
	_ = os.Remove(requestPath)

	var req Request
	if err := json.Unmarshal(content, &req); err != nil {
		return fmt.Errorf("decode uninstall request file: %w", err)
	}
	if err := validateRequest(req); err != nil {
		return err
	}

	// Give the main Agent enough time to return the task acknowledgement.
	time.Sleep(2 * time.Second)

	cleanupErr := uninstallLinux(req.ExecutablePath)
	status := "completed"
	errorMessage := ""
	if cleanupErr != nil {
		status = "failed"
		errorMessage = cleanupErr.Error()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	confirmErr := confirmWithRetry(ctx, req, status, errorMessage)
	if cleanupErr != nil && confirmErr != nil {
		return fmt.Errorf("uninstall failed: %v; confirmation failed: %w", cleanupErr, confirmErr)
	}
	if cleanupErr != nil {
		return cleanupErr
	}
	if confirmErr != nil {
		return fmt.Errorf("confirm completed uninstall: %w", confirmErr)
	}
	return nil
}

// uninstallLinux stops/disables the systemd service and removes Agent files.
// All steps are attempted so a partial failure does not prevent later cleanup.
func uninstallLinux(executablePath string) error {
	var failures []error

	if err := runSystemctl("disable", linuxServiceName); err != nil {
		failures = append(failures, err)
	}
	if err := runSystemctl("stop", linuxServiceName); err != nil {
		failures = append(failures, err)
	}

	for _, path := range []string{
		linuxServiceFile,
		executablePath,
		executablePath + ".update",
		"/usr/local/bin/.datrixops-agent.update",
	} {
		if strings.TrimSpace(path) == "" {
			continue
		}
		if err := removeIfExists(path); err != nil {
			failures = append(failures, err)
		}
	}
	if err := os.RemoveAll(linuxDropInDir); err != nil {
		failures = append(failures, fmt.Errorf("remove systemd drop-in directory: %w", err))
	}

	if err := runSystemctl("daemon-reload"); err != nil {
		failures = append(failures, err)
	}
	// reset-failed may return non-zero if the unit was already removed; this is
	// harmless and should not turn an otherwise successful uninstall into failure.
	_ = runSystemctl("reset-failed", linuxServiceName)

	return errors.Join(failures...)
}

// confirmWithRetry sends the one-time callback with bounded retries to survive
// a short network interruption during service removal.
func confirmWithRetry(ctx context.Context, req Request, status, errorMessage string) error {
	payload, err := json.Marshal(map[string]string{
		"server_id": req.ServerID,
		"task_id":   req.TaskID,
		"token":     req.ConfirmToken,
		"status":    status,
		"error":     errorMessage,
	})
	if err != nil {
		return fmt.Errorf("encode uninstall confirmation: %w", err)
	}

	var lastErr error
	for attempt := 1; attempt <= 5; attempt++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, req.ConfirmURL, bytes.NewReader(payload))
		if err != nil {
			return fmt.Errorf("create uninstall confirmation request: %w", err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("User-Agent", "DatrixOps-Agent-Uninstall")

		response, err := (&http.Client{Timeout: 10 * time.Second}).Do(request)
		if err == nil {
			body, readErr := io.ReadAll(io.LimitReader(response.Body, 8<<10))
			response.Body.Close()
			if readErr == nil && response.StatusCode >= 200 && response.StatusCode < 300 {
				return nil
			}
			if readErr != nil {
				lastErr = fmt.Errorf("read uninstall confirmation response: %w", readErr)
			} else {
				lastErr = fmt.Errorf("uninstall confirmation returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
			}
		} else {
			lastErr = err
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("uninstall confirmation canceled: %w", ctx.Err())
		case <-time.After(time.Duration(attempt) * time.Second):
		}
	}
	return fmt.Errorf("uninstall confirmation failed after retries: %w", lastErr)
}

// copyExecutable creates an executable temporary clone with restrictive mode.
func copyExecutable(sourcePath, destinationPath string) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return fmt.Errorf("open Agent executable: %w", err)
	}
	defer source.Close()

	destination, err := os.OpenFile(destinationPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o700)
	if err != nil {
		return fmt.Errorf("create uninstall helper: %w", err)
	}
	_, copyErr := io.Copy(destination, source)
	closeErr := destination.Close()
	if copyErr != nil {
		_ = os.Remove(destinationPath)
		return fmt.Errorf("copy uninstall helper: %w", copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(destinationPath)
		return fmt.Errorf("close uninstall helper: %w", closeErr)
	}
	return nil
}

// runSystemctl executes one systemctl operation and includes command output in
// any returned error for easier remote troubleshooting.
func runSystemctl(args ...string) error {
	path, err := exec.LookPath("systemctl")
	if err != nil {
		return fmt.Errorf("systemctl is unavailable: %w", err)
	}
	cmd := exec.Command(path, args...)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("systemctl %s failed: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return nil
}

// removeIfExists removes a file and ignores the already-absent case.
func removeIfExists(path string) error {
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove %s: %w", path, err)
	}
	return nil
}

// cleanupPrepared removes temporary files when helper activation fails.
func cleanupPrepared(prepared *Prepared) {
	if prepared == nil {
		return
	}
	_ = os.Remove(prepared.RequestPath)
	_ = os.Remove(prepared.HelperPath)
}
