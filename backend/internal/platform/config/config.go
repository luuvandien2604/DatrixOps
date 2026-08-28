package config

import (
	"fmt"
	"net"
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
	SetupToken               string
	AgentVersion             string
	AllowedOrigins           string
	PublicURL                string
	AgentReleaseURL          string
	AgentReleaseLayout       string // "github" or "default"
	AgentArtifactBaseURL     string // exact version-specific artifact directory
	Edition                  string
	DeploymentMode           string
	DatrixopsVersion         string
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
		SetupToken:               strings.TrimSpace(os.Getenv("SETUP_TOKEN")),
		AgentVersion:             strings.TrimSpace(getEnv("AGENT_VERSION", "dev")),
		AllowedOrigins:           strings.TrimSpace(getEnv("ALLOWED_ORIGINS", "")),
		PublicURL:                strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_URL")), "/"),
		AgentReleaseURL:          strings.TrimRight(strings.TrimSpace(os.Getenv("AGENT_RELEASE_BASE_URL")), "/"),
		Edition:                  strings.ToLower(strings.TrimSpace(getEnv("DATRIXOPS_EDITION", "community"))),
		DeploymentMode:           strings.ToLower(strings.TrimSpace(getEnv("DEPLOYMENT_MODE", "self-hosted"))),
		DatrixopsVersion:         strings.TrimSpace(getEnv("DATRIXOPS_VERSION", "1.8.5")),
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
	if cfg.DeploymentMode != "self-hosted" && cfg.DeploymentMode != "managed" {
		return nil, fmt.Errorf("DEPLOYMENT_MODE must be self-hosted or managed")
	}
	if cfg.Edition != "community" && cfg.Edition != "cloud" {
		return nil, fmt.Errorf("DATRIXOPS_EDITION must be community or cloud")
	}
	if err := ValidatePublicURL(cfg.PublicURL, cfg.Edition, cfg.DeploymentMode); err != nil {
		return nil, err
	}
	if err := validateAllowedOrigins(cfg.AllowedOrigins, cfg.Edition, cfg.DeploymentMode); err != nil {
		return nil, err
	}
	if cfg.AgentReleaseURL == "" {
		cfg.AgentReleaseURL = "https://github.com/luuvandien2604/DatrixOps/releases/download"
	}
	if err := ValidatePublicURL(cfg.AgentReleaseURL, cfg.Edition, cfg.DeploymentMode); err != nil {
		return nil, fmt.Errorf("AGENT_RELEASE_BASE_URL: %w", err)
	}

	// Resolve release layout: explicit AGENT_RELEASE_LAYOUT takes precedence,
	// then legacy AGENT_RELEASE_BASE_URL_INCLUDES_VERSION compat mapping exclusively to legacy_direct.
	rawLayout := strings.TrimSpace(os.Getenv("AGENT_RELEASE_LAYOUT"))
	if rawLayout == "" {
		if envBool("AGENT_RELEASE_BASE_URL_INCLUDES_VERSION") {
			rawLayout = "legacy_direct"
		} else {
			rawLayout = "github"
		}
	}
	switch strings.ToLower(rawLayout) {
	case "github":
		cfg.AgentReleaseLayout = "github"
	case "default":
		cfg.AgentReleaseLayout = "default"
	case "legacy_direct":
		cfg.AgentReleaseLayout = "legacy_direct"
	default:
		return nil, fmt.Errorf("AGENT_RELEASE_LAYOUT must be 'github', 'default', or 'legacy_direct', got %q", rawLayout)
	}

	// Derive artifact base URL: explicit env var takes precedence.
	cfg.AgentArtifactBaseURL = strings.TrimRight(strings.TrimSpace(os.Getenv("AGENT_ARTIFACT_BASE_URL")), "/")
	if cfg.AgentArtifactBaseURL == "" && cfg.AgentVersion != "" && cfg.AgentVersion != "dev" {
		switch cfg.AgentReleaseLayout {
		case "github":
			cfg.AgentArtifactBaseURL = cfg.AgentReleaseURL + "/v" + cfg.AgentVersion
		case "default":
			cfg.AgentArtifactBaseURL = cfg.AgentReleaseURL + "/" + cfg.AgentVersion
		case "legacy_direct":
			cfg.AgentArtifactBaseURL = cfg.AgentReleaseURL
		}
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

// ValidatePublicURL applies the supported edition/deployment URL policy.
func ValidatePublicURL(rawURL string, edition string, deploymentMode string) error {
	value := strings.TrimRight(strings.TrimSpace(rawURL), "/")
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return fmt.Errorf("PUBLIC_URL must be an absolute HTTP or HTTPS URL")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("PUBLIC_URL must not contain credentials, a query, or a fragment")
	}

	edition = strings.ToLower(strings.TrimSpace(edition))
	deploymentMode = strings.ToLower(strings.TrimSpace(deploymentMode))
	host := parsed.Hostname()
	hostIsLocalOrIP := isLocalOrIPHost(host)

	if edition == "cloud" || deploymentMode == "managed" {
		if edition != "cloud" || deploymentMode != "managed" {
			return fmt.Errorf("cloud deployments must use DATRIXOPS_EDITION=cloud and DEPLOYMENT_MODE=managed together")
		}
		if parsed.Scheme != "https" {
			return fmt.Errorf("PUBLIC_URL must use HTTPS in Cloud managed mode")
		}
		if hostIsLocalOrIP {
			return fmt.Errorf("PUBLIC_URL must use a valid domain in Cloud managed mode")
		}
		return nil
	}

	if edition != "community" || deploymentMode != "self-hosted" {
		return fmt.Errorf("unsupported edition/deployment profile")
	}

	if parsed.Scheme != "https" && !hostIsLocalOrIP {
		return fmt.Errorf("PUBLIC_URL must use HTTPS when using a domain name")
	}
	return nil
}

func validateAllowedOrigins(origins string, edition string, deploymentMode string) error {
	if strings.TrimSpace(origins) == "" {
		return nil
	}
	for _, raw := range strings.Split(origins, ",") {
		origin := strings.TrimRight(strings.TrimSpace(raw), "/")
		if origin == "" {
			continue
		}
		if origin == "*" {
			if edition == "cloud" || deploymentMode == "managed" {
				return fmt.Errorf("ALLOWED_ORIGINS must not use wildcard in Cloud managed mode")
			}
			continue
		}
		if err := ValidatePublicURL(origin, edition, deploymentMode); err != nil {
			return fmt.Errorf("ALLOWED_ORIGINS contains invalid origin %q: %w", origin, err)
		}
	}
	return nil
}

func isLocalOrIPHost(host string) bool {
	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return true
	}
	return net.ParseIP(host) != nil
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
