package terminal

import (
	"context"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/host"
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
	if info, err := host.Info(); err == nil {
		platform := strings.ToLower(strings.TrimSpace(info.Platform))
		for _, desktopPlatform := range []string{
			"linuxmint", "pop", "elementary", "zorin", "manjaro", "endeavouros",
		} {
			if strings.Contains(platform, desktopPlatform) {
				return true
			}
		}
	}

	// A graphical default target is a stronger signal than package presence:
	// server installations may contain GUI libraries without running a desktop.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if output, err := exec.CommandContext(ctx, "systemctl", "get-default").Output(); err == nil {
		return strings.TrimSpace(string(output)) == "graphical.target"
	}
	return false
}
