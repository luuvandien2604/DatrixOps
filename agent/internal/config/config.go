package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds agent configuration.
type Config struct {
	ServerURL       string // Core API URL (e.g. https://api.datrixops.app)
	AgentToken      string // Token to authenticate with Core API
	IntervalSeconds int    // Metric collection interval
}

// Load reads agent configuration from environment variables.
func Load() (*Config, error) {
	cfg := &Config{
		ServerURL:       getEnv("DATRIXOPS_SERVER_URL", "http://localhost:8080"),
		AgentToken:      getEnv("DATRIXOPS_AGENT_TOKEN", ""),
		IntervalSeconds: getEnvInt("DATRIXOPS_INTERVAL", 5),
	}

	if cfg.AgentToken == "" {
		return nil, fmt.Errorf("DATRIXOPS_AGENT_TOKEN is required")
	}

	return cfg, nil
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
