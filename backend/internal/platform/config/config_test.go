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
	if cfg.AgentReleaseURL != "https://github.com/luuvandien2604/DatrixOps/releases/download" {
		t.Fatalf("expected release URL to fall back to DatrixOps GitHub releases in CE, got %q", cfg.AgentReleaseURL)
	}
	if cfg.AgentReleaseLayout != "github" {
		t.Fatalf("expected github release layout by default in CE, got %q", cfg.AgentReleaseLayout)
	}
	if cfg.AgentArtifactBaseURL != "https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.2" {
		t.Fatalf("expected artifact base URL to be derived with v prefix from GitHub in CE, got %q", cfg.AgentArtifactBaseURL)
	}
	if cfg.DeploymentMode != "self-hosted" {
		t.Fatalf("expected self-hosted deployment mode by default, got %q", cfg.DeploymentMode)
	}
	if cfg.Edition != "community" {
		t.Fatalf("expected community edition by default, got %q", cfg.Edition)
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

func TestValidatePublicURLProfiles(t *testing.T) {
	tests := []struct {
		name           string
		rawURL         string
		edition        string
		deploymentMode string
		wantErr        bool
	}{
		{
			name:           "community allows public IP over HTTP",
			rawURL:         "http://203.0.113.10:7800",
			edition:        "community",
			deploymentMode: "self-hosted",
		},
		{
			name:           "community allows localhost over HTTP",
			rawURL:         "http://localhost:3000",
			edition:        "community",
			deploymentMode: "self-hosted",
		},
		{
			name:           "community allows domain over HTTPS",
			rawURL:         "https://monitor.example.com",
			edition:        "community",
			deploymentMode: "self-hosted",
		},
		{
			name:           "community rejects domain over HTTP",
			rawURL:         "http://monitor.example.com",
			edition:        "community",
			deploymentMode: "self-hosted",
			wantErr:        true,
		},
		{
			name:           "cloud allows domain over HTTPS",
			rawURL:         "https://cloud.datrixops.com",
			edition:        "cloud",
			deploymentMode: "managed",
		},
		{
			name:           "cloud rejects plain HTTP",
			rawURL:         "http://cloud.datrixops.com",
			edition:        "cloud",
			deploymentMode: "managed",
			wantErr:        true,
		},
		{
			name:           "cloud rejects localhost",
			rawURL:         "https://localhost",
			edition:        "cloud",
			deploymentMode: "managed",
			wantErr:        true,
		},
		{
			name:           "cloud rejects public IP",
			rawURL:         "https://203.0.113.10",
			edition:        "cloud",
			deploymentMode: "managed",
			wantErr:        true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePublicURL(tt.rawURL, tt.edition, tt.deploymentMode)
			if tt.wantErr && err == nil {
				t.Fatal("expected validation error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("expected URL to be valid, got %v", err)
			}
		})
	}
}

func TestLoadRejectsWildcardOriginsInCloudMode(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/datrixops?sslmode=disable")
	t.Setenv("JWT_SECRET", strings.Repeat("z", 48))
	t.Setenv("PUBLIC_URL", "https://cloud.datrixops.com")
	t.Setenv("ALLOWED_ORIGINS", "*")
	t.Setenv("DATRIXOPS_EDITION", "cloud")
	t.Setenv("DEPLOYMENT_MODE", "managed")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "ALLOWED_ORIGINS") {
		t.Fatalf("expected wildcard origin validation error, got %v", err)
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

func TestLoadRejectsUnknownEdition(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/datrixops?sslmode=disable")
	t.Setenv("JWT_SECRET", strings.Repeat("z", 48))
	t.Setenv("PUBLIC_URL", "https://ops.example.com")
	t.Setenv("DATRIXOPS_EDITION", "enterprise")

	_, err := Load()
	if err == nil || !strings.Contains(err.Error(), "DATRIXOPS_EDITION") {
		t.Fatalf("expected edition validation error, got %v", err)
	}
}

func TestAgentReleaseURLMatrix(t *testing.T) {
	tests := []struct {
		name                    string
		env                     map[string]string
		expectedReleaseURL      string
		expectedReleaseLayout   string
		expectedArtifactBaseURL string
	}{
		{
			name: "CE HTTP-IP control plane + GitHub HTTPS artifacts",
			env: map[string]string{
				"DATABASE_URL":  "postgres://user:pass@localhost:5432/datrixops?sslmode=disable",
				"JWT_SECRET":    strings.Repeat("z", 48),
				"AGENT_VERSION": "1.5.2",
				"PUBLIC_URL":    "http://192.168.1.10",
			},
			expectedReleaseURL:      "https://github.com/luuvandien2604/DatrixOps/releases/download",
			expectedReleaseLayout:   "github",
			expectedArtifactBaseURL: "https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.2",
		},
		{
			name: "CE custom HTTPS release with default layout",
			env: map[string]string{
				"DATABASE_URL":           "postgres://user:pass@localhost:5432/datrixops?sslmode=disable",
				"JWT_SECRET":             strings.Repeat("z", 48),
				"AGENT_VERSION":          "1.5.2",
				"PUBLIC_URL":             "https://ops.example.com",
				"AGENT_RELEASE_BASE_URL": "https://artifacts.example.com/releases",
				"AGENT_RELEASE_LAYOUT":   "default",
			},
			expectedReleaseURL:      "https://artifacts.example.com/releases",
			expectedReleaseLayout:   "default",
			expectedArtifactBaseURL: "https://artifacts.example.com/releases/1.5.2",
		},
		{
			name: "explicit AGENT_ARTIFACT_BASE_URL overrides derivation",
			env: map[string]string{
				"DATABASE_URL":            "postgres://user:pass@localhost:5432/datrixops?sslmode=disable",
				"JWT_SECRET":              strings.Repeat("z", 48),
				"AGENT_VERSION":           "1.5.2",
				"PUBLIC_URL":              "https://ops.example.com",
				"AGENT_ARTIFACT_BASE_URL": "https://custom-cdn.example.com/agents/1.5.2",
			},
			expectedReleaseURL:      "https://github.com/luuvandien2604/DatrixOps/releases/download", // Still derived, but unused
			expectedReleaseLayout:   "github",
			expectedArtifactBaseURL: "https://custom-cdn.example.com/agents/1.5.2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for k, v := range tt.env {
				t.Setenv(k, v)
			}
			cfg, err := Load()
			if err != nil {
				t.Fatalf("expected config to load, got %v", err)
			}
			if cfg.AgentReleaseURL != tt.expectedReleaseURL {
				t.Errorf("AgentReleaseURL: got %q, want %q", cfg.AgentReleaseURL, tt.expectedReleaseURL)
			}
			if cfg.AgentReleaseLayout != tt.expectedReleaseLayout {
				t.Errorf("AgentReleaseLayout: got %q, want %q", cfg.AgentReleaseLayout, tt.expectedReleaseLayout)
			}
			if cfg.AgentArtifactBaseURL != tt.expectedArtifactBaseURL {
				t.Errorf("AgentArtifactBaseURL: got %q, want %q", cfg.AgentArtifactBaseURL, tt.expectedArtifactBaseURL)
			}
		})
	}
}
