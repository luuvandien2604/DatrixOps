package config

import (
	"fmt"
	"os"
)

// Config holds all application configuration.
type Config struct {
	Port         string
	DatabaseURL  string
	JWTSecret    string
	AgentVersion string
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	cfg := &Config{
		Port:         getEnv("PORT", "8080"),
		DatabaseURL:  getEnv("DATABASE_URL", "postgres://datrixops:datrixops_secret@localhost:5432/datrixops?sslmode=disable"),
		JWTSecret:    getEnv("JWT_SECRET", ""),
		AgentVersion: getEnv("AGENT_VERSION", "1.2.0"),
	}

	if cfg.JWTSecret == "" {
		// Allow empty JWT secret in development only
		cfg.JWTSecret = "dev-secret-change-in-production"
		fmt.Fprintln(os.Stderr, "WARNING: JWT_SECRET not set, using default (development only)")
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
