package collector

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

var defaultServicesByOS = map[string][]string{
	"linux": {
		"nginx", "apache2", "mysql", "mariadb", "postgresql",
		"redis-server", "docker", "containerd", "ssh", "sshd", "cron", "crond",
	},
	"darwin": {
		"com.openssh.sshd", "homebrew.mxcl.nginx", "homebrew.mxcl.mysql",
		"homebrew.mxcl.postgresql", "homebrew.mxcl.postgresql@16",
		"homebrew.mxcl.redis", "com.docker.helper",
	},
	"windows": {
		"EventLog", "Schedule", "W32Time", "WinRM", "sshd",
		"docker", "com.docker.service", "MSSQLSERVER", "postgresql-x64-16",
	},
}

var windowsStatePattern = regexp.MustCompile(`(?m)STATE\s*:\s*(\d+)`)
var launchdPIDPattern = regexp.MustCompile(`(?m)pid = ([0-9]+)`)

func collectServices(configured []string) []ServiceStatus {
	serviceNames := configured
	if len(serviceNames) == 0 {
		serviceNames = defaultServicesByOS[runtime.GOOS]
	}

	results := make([]ServiceStatus, len(serviceNames))
	var waitGroup sync.WaitGroup
	limit := make(chan struct{}, 4)
	for index, serviceName := range serviceNames {
		waitGroup.Add(1)
		go func(index int, name string) {
			defer waitGroup.Done()
			limit <- struct{}{}
			defer func() { <-limit }()

			results[index] = InspectService(name)
		}(index, serviceName)
	}
	waitGroup.Wait()
	return results
}

// InspectService returns the current state from the native service manager.
// Service-control tasks use the same inspector so their result and the next
// monitoring snapshot share one status model.
func InspectService(name string) ServiceStatus {
	switch runtime.GOOS {
	case "darwin":
		return inspectLaunchdService(name)
	case "windows":
		return inspectWindowsService(name)
	default:
		return inspectSystemdService(name)
	}
}

func inspectSystemdService(name string) ServiceStatus {
	service := newServiceStatus(name, "systemd")
	output, err := serviceCommand(
		"systemctl", "show",
		"--no-pager",
		"--property=Id",
		"--property=Description",
		"--property=LoadState",
		"--property=ActiveState",
		"--property=SubState",
		"--property=UnitFileState",
		"--",
		name,
	)
	properties := parseKeyValueOutput(output)
	service.DisplayName = firstNonEmpty(properties["Id"], name)
	service.Description = properties["Description"]
	service.SubStatus = properties["SubState"]
	service.StartupType = properties["UnitFileState"]

	if properties["LoadState"] == "not-found" {
		service.Status = "not_installed"
		return service
	}
	switch properties["ActiveState"] {
	case "active", "reloading", "activating":
		service.Status = "running"
	case "inactive", "failed", "deactivating":
		service.Status = "stopped"
	default:
		if err != nil {
			service.Status = "unknown"
		}
	}
	return service
}

func inspectLaunchdService(label string) ServiceStatus {
	service := newServiceStatus(label, "launchd")
	service.DisplayName = label
	service.StartupType = "launchd"

	domains := []string{"system"}
	if consoleUID, err := serviceCommand("stat", "-f", "%u", "/dev/console"); err == nil && consoleUID != "" && consoleUID != "0" {
		domains = append(domains, "gui/"+consoleUID)
	}
	for _, domain := range domains {
		output, err := serviceCommand("launchctl", "print", domain+"/"+label)
		if err == nil {
			service.Status = launchdStatus(output)
			service.SubStatus = extractLaunchdValue(output, "state")
			return service
		}
	}

	if launchdPlistExists(label) {
		service.Status = "stopped"
		service.SubStatus = "not loaded"
		return service
	}
	service.Status = "not_installed"
	return service
}

func inspectWindowsService(name string) ServiceStatus {
	service := newServiceStatus(name, "windows-scm")
	queryOutput, queryErr := serviceCommand("sc.exe", "query", name)
	if queryErr != nil {
		if strings.Contains(queryOutput, "1060") {
			service.Status = "not_installed"
		}
		return service
	}

	if matches := windowsStatePattern.FindStringSubmatch(queryOutput); len(matches) == 2 {
		state, _ := strconv.Atoi(matches[1])
		switch state {
		case 4:
			service.Status = "running"
		case 1:
			service.Status = "stopped"
		case 3, 7:
			service.Status = "stopped"
			service.SubStatus = windowsPendingState(state)
		default:
			service.Status = "running"
			service.SubStatus = windowsPendingState(state)
		}
	}

	if configOutput, err := serviceCommand("sc.exe", "qc", name); err == nil {
		properties := parseWindowsServiceOutput(configOutput)
		service.DisplayName = firstNonEmpty(properties["DISPLAY_NAME"], name)
		service.StartupType = properties["START_TYPE"]
	}
	return service
}

func newServiceStatus(name, source string) ServiceStatus {
	return ServiceStatus{
		Name:          name,
		DisplayName:   name,
		Status:        "unknown",
		Source:        source,
		LastCheckedAt: time.Now().UTC(),
	}
}

func serviceCommand(name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	return strings.TrimSpace(string(output)), err
}

func parseKeyValueOutput(output string) map[string]string {
	properties := make(map[string]string)
	for _, line := range strings.Split(output, "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), "=")
		if found {
			properties[key] = strings.TrimSpace(value)
		}
	}
	return properties
}

func parseWindowsServiceOutput(output string) map[string]string {
	properties := make(map[string]string)
	for _, line := range strings.Split(output, "\n") {
		key, value, found := strings.Cut(strings.TrimSpace(line), ":")
		if !found {
			continue
		}
		value = strings.TrimSpace(value)
		if key == "START_TYPE" {
			fields := strings.Fields(value)
			if len(fields) > 1 {
				value = strings.Join(fields[1:], " ")
			}
		}
		properties[key] = value
	}
	return properties
}

func launchdStatus(output string) string {
	state := extractLaunchdValue(output, "state")
	if state == "running" {
		return "running"
	}
	if matches := launchdPIDPattern.FindStringSubmatch(output); len(matches) == 2 {
		pid, _ := strconv.Atoi(matches[1])
		if pid > 0 {
			return "running"
		}
	}
	return "stopped"
}

func extractLaunchdValue(output, key string) string {
	prefix := key + " ="
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(line, prefix))
		}
	}
	return ""
}

func launchdPlistExists(label string) bool {
	paths := []string{
		filepath.Join("/Library/LaunchDaemons", label+".plist"),
		filepath.Join("/System/Library/LaunchDaemons", label+".plist"),
		filepath.Join("/Library/LaunchAgents", label+".plist"),
		filepath.Join("/System/Library/LaunchAgents", label+".plist"),
	}
	if home, err := os.UserHomeDir(); err == nil {
		paths = append(paths, filepath.Join(home, "Library/LaunchAgents", label+".plist"))
	}
	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	for _, pattern := range []string{
		filepath.Join("/opt/homebrew/opt/*", label+".plist"),
		filepath.Join("/usr/local/opt/*", label+".plist"),
	} {
		if matches, _ := filepath.Glob(pattern); len(matches) > 0 {
			return true
		}
	}
	return false
}

func windowsPendingState(state int) string {
	switch state {
	case 2:
		return "start pending"
	case 3:
		return "stop pending"
	case 5:
		return "continue pending"
	case 6:
		return "pause pending"
	case 7:
		return "paused"
	default:
		return "state " + strconv.Itoa(state)
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
