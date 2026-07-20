package uninstall

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const helperFileArgument = "--uninstall-helper-file"

// Request contains all data required by the detached uninstall helper.
// ConfirmToken is a short-lived one-time token and must never be logged.
type Request struct {
	ServerID       string `json:"server_id"`
	TaskID         string `json:"task_id"`
	ConfirmURL     string `json:"confirm_url"`
	ConfirmToken   string `json:"confirm_token"`
	ExecutablePath string `json:"executable_path"`
}

// Prepared describes the temporary helper binary and request file that are
// created before the Agent acknowledges the uninstall task to the backend.
type Prepared struct {
	Request     Request
	HelperPath  string
	RequestPath string
}

// Supported reports whether this Agent process can safely use the detached
// uninstall implementation on the current host. The value is included in each
// heartbeat so the backend never queues this task to an older/unsupported Agent.
func Supported() bool {
	return platformSupported()
}

// Prepare validates the request and delegates OS-specific helper preparation.
// No destructive action is performed here, so the Agent can safely report the
// task result before activating the helper.
func Prepare(req Request) (*Prepared, error) {
	if err := validateRequest(req); err != nil {
		return nil, err
	}
	return preparePlatform(req)
}

// Activate starts the prepared helper outside the Agent service lifecycle.
// On Linux this uses a transient systemd unit so stopping the Agent service
// does not kill the helper before cleanup finishes.
func Activate(prepared *Prepared) error {
	if prepared == nil {
		return fmt.Errorf("prepared uninstall helper is nil")
	}
	return activatePlatform(prepared)
}

// Cleanup removes temporary helper artifacts when the task cannot be
// acknowledged or activated. It never performs service removal.
func Cleanup(prepared *Prepared) {
	if prepared == nil {
		return
	}
	_ = os.Remove(prepared.RequestPath)
	_ = os.Remove(prepared.HelperPath)
	if prepared.HelperPath != "" {
		_ = os.Remove(filepath.Dir(prepared.HelperPath))
	}
}

// RunHelperFromArgs detects helper mode before the normal Agent startup path.
// It returns handled=true when the current process was launched as a detached
// uninstaller, allowing main() to exit without starting heartbeat/terminal.
func RunHelperFromArgs(args []string) (handled bool, err error) {
	if len(args) == 0 {
		return false, nil
	}
	if len(args) != 2 || args[0] != helperFileArgument {
		return false, nil
	}

	requestPath := strings.TrimSpace(args[1])
	if requestPath == "" {
		return true, fmt.Errorf("uninstall helper request path is empty")
	}
	return true, runPlatformHelper(requestPath)
}

// Confirm reports helper completion or failure using the one-time token.
// It is exported so the main Agent can report a synchronous activation error.
func Confirm(ctx context.Context, req Request, status, errorMessage string) error {
	return confirmWithRetry(ctx, req, status, errorMessage)
}

// EncodeRequest is useful for diagnostics/tests without exposing the raw token
// in logs. Production helper activation uses a root-only request file instead.
func EncodeRequest(req Request) (string, error) {
	content, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("encode uninstall request: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(content), nil
}

// validateRequest rejects incomplete or unsafe requests before any temporary
// files are created.
func validateRequest(req Request) error {
	if strings.TrimSpace(req.ServerID) == "" {
		return fmt.Errorf("uninstall server_id is required")
	}
	if strings.TrimSpace(req.TaskID) == "" {
		return fmt.Errorf("uninstall task_id is required")
	}
	if strings.TrimSpace(req.ConfirmURL) == "" {
		return fmt.Errorf("uninstall confirm_url is required")
	}
	if strings.TrimSpace(req.ConfirmToken) == "" {
		return fmt.Errorf("uninstall confirm_token is required")
	}
	return nil
}

// writeRequestFile serializes the one-time request into a root-readable file.
// The helper removes this file immediately after reading it.
func writeRequestFile(path string, req Request) error {
	content, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("encode uninstall request: %w", err)
	}
	if err := os.WriteFile(path, content, 0o600); err != nil {
		return fmt.Errorf("write uninstall request file: %w", err)
	}
	return nil
}
