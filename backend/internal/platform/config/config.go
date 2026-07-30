package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

// Config holds all application configuration.
type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      string
	AgentVersion   string
	AllowedOrigins string
}

var weakJWTSecrets = map[string]struct{}{
	"dev-secret":                            {},
	"dev-secret-change-in-production":       {},
	"super-secret-key":                      {},
	"super-secret-key-change-in-production": {},
	"change-me":                             {},
	"changeme":                              {},
	"secret":                                {},
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	cfg := &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    strings.TrimSpace(os.Getenv("DATABASE_URL")),
		JWTSecret:      strings.TrimSpace(os.Getenv("JWT_SECRET")),
		AgentVersion:   strings.TrimSpace(getEnv("AGENT_VERSION", "dev")),
		AllowedOrigins: strings.TrimSpace(getEnv("ALLOWED_ORIGINS", "")),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if parsed, err := url.Parse(cfg.DatabaseURL); err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("DATABASE_URL must be a valid PostgreSQL connection URL")
	}

	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}
	if _, weak := weakJWTSecrets[strings.ToLower(cfg.JWTSecret)]; weak {
		return nil, fmt.Errorf("JWT_SECRET uses an unsafe placeholder value")
	}

	return cfg, nil
}

// getEnv returns the value of an environment variable, or a default.
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
