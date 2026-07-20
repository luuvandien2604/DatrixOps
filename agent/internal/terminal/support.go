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

// EnvironmentSupport quyết định Web Terminal có được phép chạy hay không.
//
// DATRIXOPS_TERMINAL_MODE có mức ưu tiên cao nhất:
//
//	server/enabled: ép bật trên Linux
//	disabled/off/desktop: tắt
//	auto hoặc để trống: tự phát hiện Linux headless
func EnvironmentSupport() SupportStatus {
	supportOnce.Do(func() {
		support = detectEnvironmentSupport()
	})

	return support
}

func detectEnvironmentSupport() SupportStatus {
	return detectEnvironmentSupportFor(
		runtime.GOOS,
		os.Getenv("DATRIXOPS_TERMINAL_MODE"),
		linuxHasActiveGraphicalSession,
	)
}

func detectEnvironmentSupportFor(
	goos string,
	rawMode string,
	hasActiveGraphicalSession func() bool,
) SupportStatus {
	mode := strings.ToLower(strings.TrimSpace(rawMode))

	switch mode {
	case "server", "enabled":
		if goos != "linux" {
			return SupportStatus{
				Reason: "DATRIXOPS_TERMINAL_MODE can force-enable Web Terminal only on Linux agents.",
			}
		}

		return SupportStatus{
			Supported: true,
		}

	case "disabled", "off", "desktop":
		return SupportStatus{
			Reason: "Web Terminal was disabled by DATRIXOPS_TERMINAL_MODE.",
		}

	case "", "auto":
		// Tiếp tục tự phát hiện môi trường.

	default:
		return SupportStatus{
			Reason: "Invalid DATRIXOPS_TERMINAL_MODE. Use auto, server, enabled, desktop, disabled, or off.",
		}
	}

	switch goos {
	case "linux":
		// Không coi máy là desktop chỉ vì display-manager.service tồn tại.
		//
		// VPS có thể còn display manager sau khi cài package hoặc tạo image.
		// Chỉ một phiên X11/Wayland của người dùng đang hoạt động mới được
		// xem là Linux desktop.
		if hasActiveGraphicalSession != nil &&
			hasActiveGraphicalSession() {

			return SupportStatus{
				Reason: "Web Terminal is disabled because an active Linux graphical user session was detected.",
			}
		}

		return SupportStatus{
			Supported: true,
		}

	case "windows":
		return SupportStatus{
			Reason: "Web Terminal is not supported on Windows agents yet.",
		}

	case "darwin":
		return SupportStatus{
			Reason: "Web Terminal is not supported on macOS agents yet.",
		}

	default:
		return SupportStatus{
			Reason: "Web Terminal is supported only on Linux server agents.",
		}
	}
}

// linuxHasActiveGraphicalSession chỉ trả về true khi có người dùng
// thực sự đăng nhập vào một phiên X11 hoặc Wayland đang hoạt động.
//
// display-manager.service hoặc màn hình đăng nhập greeter không đủ để
// kết luận máy là Linux desktop.
func linuxHasActiveGraphicalSession() bool {
	ctx, cancel := context.WithTimeout(
		context.Background(),
		3*time.Second,
	)
	defer cancel()

	sessions, err := exec.CommandContext(
		ctx,
		"loginctl",
		"list-sessions",
		"--no-legend",
		"--no-pager",
	).Output()
	if err != nil {
		// Một số Linux headless không dùng systemd hoặc không có loginctl.
		// Trường hợp này không được tự động coi là desktop.
		return false
	}

	for _, line := range strings.Split(string(sessions), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}

		sessionID := fields[0]

		sessionContext, sessionCancel := context.WithTimeout(
			ctx,
			time.Second,
		)

		properties, propertyErr := exec.CommandContext(
			sessionContext,
			"loginctl",
			"show-session",
			sessionID,
			"--property=Type",
			"--property=Active",
			"--property=Class",
			"--no-pager",
		).Output()

		sessionCancel()

		if propertyErr != nil {
			continue
		}

		if isActiveGraphicalUserSession(string(properties)) {
			return true
		}
	}

	return false
}

func isActiveGraphicalUserSession(properties string) bool {
	values := make(map[string]string)

	for _, line := range strings.Split(properties, "\n") {
		parts := strings.SplitN(
			strings.TrimSpace(line),
			"=",
			2,
		)

		if len(parts) != 2 {
			continue
		}

		key := strings.ToLower(parts[0])
		value := strings.ToLower(
			strings.TrimSpace(parts[1]),
		)

		values[key] = value
	}

	if values["active"] != "yes" {
		return false
	}

	sessionType := values["type"]

	if sessionType != "x11" &&
		sessionType != "wayland" {

		return false
	}

	// Màn hình đăng nhập của display manager thường có Class=greeter.
	// Đây không phải phiên desktop của người dùng.
	sessionClass := values["class"]

	return sessionClass == "" ||
		sessionClass == "user" ||
		sessionClass == "user-early"
}