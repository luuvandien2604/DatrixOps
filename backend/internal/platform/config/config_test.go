package config

import (
	"strings"
	"testing"
)

func TestLoadRequiresDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("JWT_SECRET", strings.Repeat("a", 32))
	t.Setenv("PUBLIC_URL", "https://ops.example.com")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "DATABASE_URL is required") {
		t.Fatalf("expected DATABASE_URL validation error, got %v", err)
	}
}

func TestLoadRequiresStrongJWTSecret(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/datrixops?sslmode=disable")
	t.Setenv("JWT_SECRET", "dev-secret-change-in-production")
	t.Setenv("PUBLIC_URL", "https://ops.example.com")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "at least 32 characters") {
		t.Fatalf("expected JWT strength validation error, got %v", err)
	}
}

func TestLoadRejectsUnsafeJWTPlaceholder(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/datrixops?sslmode=disable")
	t.Setenv("JWT_SECRET", "super-secret-key-change-in-production")
	t.Setenv("PUBLIC_URL", "https://ops.example.com")

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
	t.Setenv("PUBLIC_URL", "")

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
	if cfg.PublicURL != "https://ops.example.com" {
		t.Fatalf("expected PUBLIC_URL to fall back to the first allowed origin, got %q", cfg.PublicURL)
	}
	if cfg.AgentReleaseURL != "https://ops.example.com/releases" {
		t.Fatalf("expected release URL to be derived from PUBLIC_URL, got %q", cfg.AgentReleaseURL)
	}
	if cfg.DeploymentMode != "self-hosted" {
		t.Fatalf("expected self-hosted deployment mode by default, got %q", cfg.DeploymentMode)
	}
}

func TestLoadRejectsInsecurePublicURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/datrixops?sslmode=disable")
	t.Setenv("JWT_SECRET", strings.Repeat("z", 48))
	t.Setenv("PUBLIC_URL", "http://ops.example.com")
	t.Setenv("ALLOWED_ORIGINS", "")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "must use HTTPS") {
		t.Fatalf("expected HTTPS validation error, got %v", err)
	}
}

func TestLoadFeatureFlagsDefaultOffAndRetentionBounded(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/datrixops?sslmode=disable")
	t.Setenv("JWT_SECRET", strings.Repeat("z", 48))
	t.Setenv("PUBLIC_URL", "https://ops.example.com")
	t.Setenv("ENABLE_WEB_TERMINAL", "")
	t.Setenv("ENABLE_REMOTE_SCRIPTS", "")
	t.Setenv("ENABLE_SERVICE_CONTROLS", "")
	t.Setenv("ENABLE_READ_ONLY_LOGS", "")
	t.Setenv("METRICS_RETENTION_DAYS", "0")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("expected config to load, got %v", err)
	}
	if cfg.EnableWebTerminal || cfg.EnableRemoteScripts || cfg.EnableServiceControls || cfg.EnableReadOnlyLogs {
		t.Fatal("expected advanced Agent features to be disabled by default")
	}
	if cfg.MetricsRetentionDays != 7 {
		t.Fatalf("expected invalid retention to fall back to 7 days, got %d", cfg.MetricsRetentionDays)
	}
}

func TestLoadRejectsUnknownDeploymentMode(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/datrixops?sslmode=disable")
	t.Setenv("JWT_SECRET", strings.Repeat("z", 48))
	t.Setenv("PUBLIC_URL", "https://ops.example.com")
	t.Setenv("DEPLOYMENT_MODE", "desktop")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "DEPLOYMENT_MODE") {
		t.Fatalf("expected deployment mode validation error, got %v", err)
	}
}
