package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds agent configuration.
type Config struct {
	ServerURL         string   // Core API URL (e.g. https://api.datrixops.app)
	AgentToken        string   // Token to authenticate with Core API
	IntervalSeconds   int      // Metric collection interval
	MonitoredServices []string // Optional OS-specific service list override
}

// Load reads agent configuration from environment variables.
func Load() (*Config, error) {
	cfg := &Config{
		ServerURL:         getEnv("DATRIXOPS_SERVER_URL", "http://localhost:8080"),
		AgentToken:        getEnv("DATRIXOPS_AGENT_TOKEN", ""),
		IntervalSeconds:   getEnvInt("DATRIXOPS_INTERVAL", 5),
		MonitoredServices: getEnvList("DATRIXOPS_SERVICES"),
	}

	if cfg.AgentToken == "" {
		return nil, fmt.Errorf("DATRIXOPS_AGENT_TOKEN is required")
	}

	return cfg, nil
}

func getEnvList(key string) []string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return nil
	}
	values := make([]string, 0)
	seen := make(map[string]struct{})
	for _, item := range strings.Split(raw, ",") {
		value := strings.TrimSpace(item)
		if value == "" || len(value) > 200 {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		values = append(values, value)
		if len(values) == 50 {
			break
		}
	}
	return values
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if value, ok := os.LookupEnv(key); ok {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return fallback
}
