package terminal

import (
	"context"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

type SupportStatus struct {
	Supported bool
	Reason    string
}

var (
	supportOnce sync.Once
	support     SupportStatus
)

// EnvironmentSupport is authoritative for whether the service-account shell
// represents a supported server environment. Desktop sessions are deliberately
// excluded because the Agent does not control the signed-in user's session.
func EnvironmentSupport() SupportStatus {
	supportOnce.Do(func() {
		support = detectEnvironmentSupport()
	})
	return support
}

func detectEnvironmentSupport() SupportStatus {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("DATRIXOPS_TERMINAL_MODE"))) {
	case "server", "enabled":
		if runtime.GOOS == "linux" {
			return SupportStatus{Supported: true}
		}
	case "disabled", "off":
		return SupportStatus{
			Reason: "Web Terminal was disabled by DATRIXOPS_TERMINAL_MODE.",
		}
	}

	switch runtime.GOOS {
	case "windows":
		return SupportStatus{
			Reason: "Web Terminal is not supported on Windows agents because the service runs outside the signed-in desktop session.",
		}
	case "darwin":
		return SupportStatus{
			Reason: "Web Terminal is not supported on macOS agents because the launchd service runs outside the signed-in desktop session.",
		}
	case "linux":
		if linuxDesktopEnvironment() {
			return SupportStatus{
				Reason: "Web Terminal is not supported on Linux desktop or personal-workstation agents.",
			}
		}
		return SupportStatus{Supported: true}
	default:
		return SupportStatus{
			Reason: "Web Terminal is supported only on Linux server agents.",
		}
	}
}

func linuxDesktopEnvironment() bool {
	// A default graphical.target is not enough: headless servers can retain it
	// after image provisioning or package installation. Only classify the host
	// as desktop when a display manager or active graphical login actually
	// exists.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := exec.CommandContext(
		ctx,
		"systemctl",
		"is-active",
		"--quiet",
		"display-manager.service",
	).Run(); err == nil {
		return true
	}

	sessions, err := exec.CommandContext(
		ctx,
		"loginctl",
		"list-sessions",
		"--no-legend",
		"--no-pager",
	).Output()
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(sessions), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		sessionContext, sessionCancel := context.WithTimeout(context.Background(), time.Second)
		properties, propertyErr := exec.CommandContext(
			sessionContext,
			"loginctl",
			"show-session",
			fields[0],
			"--property=Type",
			"--property=Active",
			"--no-pager",
		).Output()
		sessionCancel()
		if propertyErr != nil {
			continue
		}
		values := strings.ToLower(string(properties))
		active := strings.Contains(values, "active=yes")
		graphical := strings.Contains(values, "type=x11") || strings.Contains(values, "type=wayland")
		if active && graphical {
			return true
		}
	}
	return false
}
