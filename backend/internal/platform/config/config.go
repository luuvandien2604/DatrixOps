package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// Config holds all application configuration.
type Config struct {
	Port                     string
	DatabaseURL              string
	JWTSecret                string
	AgentVersion             string
	AllowedOrigins           string
	PublicURL                string
	AgentReleaseURL          string
	DeploymentMode           string
	PublicRegistration       bool
	EnableWebTerminal        bool
	EnableRemoteScripts      bool
	EnableServiceControls    bool
	EnableReadOnlyLogs       bool
	MetricsRetentionDays     int
	OperationalRetentionDays int
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
		Port:                     getEnv("PORT", "8080"),
		DatabaseURL:              strings.TrimSpace(os.Getenv("DATABASE_URL")),
		JWTSecret:                strings.TrimSpace(os.Getenv("JWT_SECRET")),
		AgentVersion:             strings.TrimSpace(getEnv("AGENT_VERSION", "dev")),
		AllowedOrigins:           strings.TrimSpace(getEnv("ALLOWED_ORIGINS", "")),
		PublicURL:                strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_URL")), "/"),
		AgentReleaseURL:          strings.TrimRight(strings.TrimSpace(os.Getenv("AGENT_RELEASE_BASE_URL")), "/"),
		DeploymentMode:           strings.ToLower(strings.TrimSpace(getEnv("DEPLOYMENT_MODE", "self-hosted"))),
		PublicRegistration:       envBool("ENABLE_PUBLIC_REGISTRATION"),
		EnableWebTerminal:        envBool("ENABLE_WEB_TERMINAL"),
		EnableRemoteScripts:      envBool("ENABLE_REMOTE_SCRIPTS"),
		EnableServiceControls:    envBool("ENABLE_SERVICE_CONTROLS"),
		EnableReadOnlyLogs:       envBool("ENABLE_READ_ONLY_LOGS"),
		MetricsRetentionDays:     envInt("METRICS_RETENTION_DAYS", 7, 1, 3650),
		OperationalRetentionDays: envInt("OPERATIONAL_RETENTION_DAYS", 90, 7, 3650),
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

	if cfg.PublicURL == "" {
		cfg.PublicURL = firstOrigin(cfg.AllowedOrigins)
	}
	if cfg.PublicURL == "" {
		return nil, fmt.Errorf("PUBLIC_URL is required")
	}
	if err := validatePublicURL(cfg.PublicURL); err != nil {
		return nil, err
	}
	if cfg.AgentReleaseURL == "" {
		cfg.AgentReleaseURL = cfg.PublicURL + "/releases"
	}
	if err := validatePublicURL(cfg.AgentReleaseURL); err != nil {
		return nil, fmt.Errorf("AGENT_RELEASE_BASE_URL: %w", err)
	}
	if cfg.DeploymentMode != "self-hosted" && cfg.DeploymentMode != "managed" {
		return nil, fmt.Errorf("DEPLOYMENT_MODE must be self-hosted or managed")
	}

	return cfg, nil
}

func firstOrigin(origins string) string {
	for _, raw := range strings.Split(origins, ",") {
		origin := strings.TrimRight(strings.TrimSpace(raw), "/")
		if origin != "" && origin != "*" {
			return origin
		}
	}
	return ""
}

func validatePublicURL(value string) error {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return fmt.Errorf("PUBLIC_URL must be an absolute HTTP or HTTPS URL")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("PUBLIC_URL must not contain credentials, a query, or a fragment")
	}
	if parsed.Scheme != "https" && parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1" {
		return fmt.Errorf("PUBLIC_URL must use HTTPS outside localhost")
	}
	return nil
}

func envBool(key string) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func envInt(key string, fallback, minimum, maximum int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil || value < minimum || value > maximum {
		return fallback
	}
	return value
}

// getEnv returns the value of an environment variable, or a default.
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
