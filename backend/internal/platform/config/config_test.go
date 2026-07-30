package config

import (
	"strings"
	"testing"
)

func TestLoadRequiresDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("JWT_SECRET", strings.Repeat("a", 32))

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "DATABASE_URL is required") {
		t.Fatalf("expected DATABASE_URL validation error, got %v", err)
	}
}

func TestLoadRequiresStrongJWTSecret(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/datrixops?sslmode=disable")
	t.Setenv("JWT_SECRET", "dev-secret-change-in-production")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "at least 32 characters") {
		t.Fatalf("expected JWT strength validation error, got %v", err)
	}
}

func TestLoadRejectsUnsafeJWTPlaceholder(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/datrixops?sslmode=disable")
	t.Setenv("JWT_SECRET", "super-secret-key-change-in-production")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "unsafe placeholder") {
		t.Fatalf("expected JWT placeholder validation error, got %v", err)
	}
}

func TestLoadAcceptsRequiredProductionConfig(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/datrixops?sslmode=disable")
	t.Setenv("JWT_SECRET", strings.Repeat("z", 48))
	t.Setenv("AGENT_VERSION", "1.5.2")
	t.Setenv("ALLOWED_ORIGINS", "https://ops.example.com")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("expected config to load, got %v", err)
	}
	if cfg.AgentVersion != "1.5.2" {
		t.Fatalf("expected AGENT_VERSION to be preserved, got %q", cfg.AgentVersion)
	}
	if cfg.AllowedOrigins != "https://ops.example.com" {
		t.Fatalf("expected ALLOWED_ORIGINS to be preserved, got %q", cfg.AllowedOrigins)
	}
}
