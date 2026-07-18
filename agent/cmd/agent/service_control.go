package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/agent/internal/collector"
)

type serviceControlResult struct {
	Action  string                  `json:"action"`
	Message string                  `json:"message"`
	Service collector.ServiceStatus `json:"service"`
}

func executeServiceAction(ctx context.Context, action, serviceName, manager string) (string, error) {
	switch strings.ToLower(serviceName) {
	case "datrixops-agent", "datrixops-agent.service", "com.datrixops.agent", "datrixopsagent":
		return "", fmt.Errorf("the DatrixOps Agent cannot control its own service")
	}

	expectedManager := map[string]string{
		"linux":   "systemd",
		"darwin":  "launchd",
		"windows": "windows-scm",
	}[runtime.GOOS]
	if expectedManager == "" || manager != expectedManager {
		return "", fmt.Errorf("service manager %q is not valid on %s", manager, runtime.GOOS)
	}

	var output string
	var err error
	switch runtime.GOOS {
	case "darwin":
		output, err = controlLaunchdService(ctx, action, serviceName)
	case "windows":
		output, err = controlWindowsService(ctx, action, serviceName)
	default:
		output, err = runNativeServiceCommand(ctx, "systemctl", action, "--", serviceName)
	}
	if err != nil {
		if output == "" {
			return "", err
		}
		return "", fmt.Errorf("%w: %s", err, output)
	}

	status := collector.InspectService(serviceName)
	result, marshalErr := json.Marshal(serviceControlResult{
		Action:  action,
		Message: firstNonEmptyString(output, action+" completed"),
		Service: status,
	})
	if marshalErr != nil {
		return "", fmt.Errorf("encode service action result: %w", marshalErr)
	}
	return string(result), nil
}

func runNativeServiceCommand(ctx context.Context, name string, args ...string) (string, error) {
	output, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	return strings.TrimSpace(string(output)), err
}

func controlWindowsService(ctx context.Context, action, serviceName string) (string, error) {
	if action == "reload" {
		return "", fmt.Errorf("Windows Service Control Manager does not provide a generic reload action")
	}
	if action != "restart" {
		return runNativeServiceCommand(ctx, "sc.exe", action, serviceName)
	}

	current := collector.InspectService(serviceName)
	outputs := make([]string, 0, 2)
	if current.Status == "running" {
		output, err := runNativeServiceCommand(ctx, "sc.exe", "stop", serviceName)
		if output != "" {
			outputs = append(outputs, output)
		}
		if err != nil {
			return strings.Join(outputs, "\n"), fmt.Errorf("stop Windows service: %w", err)
		}
		if err := waitForServiceState(ctx, serviceName, "stopped", 30*time.Second); err != nil {
			return strings.Join(outputs, "\n"), err
		}
	}
	output, err := runNativeServiceCommand(ctx, "sc.exe", "start", serviceName)
	if output != "" {
		outputs = append(outputs, output)
	}
	if err != nil {
		return strings.Join(outputs, "\n"), fmt.Errorf("start Windows service: %w", err)
	}
	return strings.Join(outputs, "\n"), nil
}

func waitForServiceState(ctx context.Context, serviceName, desiredState string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		if collector.InspectService(serviceName).Status == desiredState {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out waiting for service %s to become %s", serviceName, desiredState)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
}

func controlLaunchdService(ctx context.Context, action, label string) (string, error) {
	target := loadedLaunchdTarget(ctx, label)
	plistPath, domain := launchdPlist(label)
	if target != "" && plistPath == "" {
		if output, err := runNativeServiceCommand(ctx, "launchctl", "print", target); err == nil {
			candidate := launchdValue(output, "path")
			if filepath.IsAbs(candidate) && strings.HasSuffix(candidate, ".plist") {
				if _, statErr := os.Stat(candidate); statErr == nil {
					plistPath = candidate
					domain = strings.TrimSuffix(target, "/"+label)
				}
			}
		}
	}

	switch action {
	case "start":
		if target != "" {
			return runNativeServiceCommand(ctx, "launchctl", "kickstart", target)
		}
		if plistPath == "" {
			return "", fmt.Errorf("launchd plist for %s was not found", label)
		}
		return runNativeServiceCommand(ctx, "launchctl", "bootstrap", domain, plistPath)
	case "stop":
		if target == "" {
			return "", fmt.Errorf("launchd service %s is not loaded", label)
		}
		return runNativeServiceCommand(ctx, "launchctl", "bootout", target)
	case "restart":
		if target != "" {
			return runNativeServiceCommand(ctx, "launchctl", "kickstart", "-k", target)
		}
		if plistPath == "" {
			return "", fmt.Errorf("launchd plist for %s was not found", label)
		}
		return runNativeServiceCommand(ctx, "launchctl", "bootstrap", domain, plistPath)
	case "reload":
		if plistPath == "" {
			return "", fmt.Errorf("launchd plist for %s was not found; reload is unavailable", label)
		}
		if target != "" {
			if output, err := runNativeServiceCommand(ctx, "launchctl", "bootout", target); err != nil {
				return output, err
			}
		}
		return runNativeServiceCommand(ctx, "launchctl", "bootstrap", domain, plistPath)
	default:
		return "", fmt.Errorf("unsupported launchd action %s", action)
	}
}

func loadedLaunchdTarget(ctx context.Context, label string) string {
	for _, domain := range launchdDomains() {
		target := domain + "/" + label
		if _, err := runNativeServiceCommand(ctx, "launchctl", "print", target); err == nil {
			return target
		}
	}
	return ""
}

func launchdDomains() []string {
	domains := []string{"system"}
	if output, err := exec.Command("stat", "-f", "%u", "/dev/console").Output(); err == nil {
		uid := strings.TrimSpace(string(output))
		if parsed, parseErr := strconv.Atoi(uid); parseErr == nil && parsed > 0 {
			domains = append(domains, "gui/"+uid)
		}
	}
	return domains
}

func launchdPlist(label string) (string, string) {
	systemPaths := []string{
		filepath.Join("/Library/LaunchDaemons", label+".plist"),
		filepath.Join("/System/Library/LaunchDaemons", label+".plist"),
	}
	for _, path := range systemPaths {
		if _, err := os.Stat(path); err == nil {
			return path, "system"
		}
	}

	guiDomain := "system"
	domains := launchdDomains()
	if len(domains) > 1 {
		guiDomain = domains[1]
	}
	userPaths := []string{
		filepath.Join("/Library/LaunchAgents", label+".plist"),
		filepath.Join("/System/Library/LaunchAgents", label+".plist"),
	}
	if home, err := os.UserHomeDir(); err == nil {
		userPaths = append(userPaths, filepath.Join(home, "Library/LaunchAgents", label+".plist"))
	}
	for _, path := range userPaths {
		if _, err := os.Stat(path); err == nil {
			return path, guiDomain
		}
	}
	for _, pattern := range []string{
		filepath.Join("/Users/*/Library/LaunchAgents", label+".plist"),
		filepath.Join("/opt/homebrew/opt/*", label+".plist"),
		filepath.Join("/usr/local/opt/*", label+".plist"),
	} {
		if matches, _ := filepath.Glob(pattern); len(matches) > 0 {
			return matches[0], guiDomain
		}
	}
	return "", ""
}

func launchdValue(output, key string) string {
	prefix := key + " ="
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(line, prefix))
		}
	}
	return ""
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
