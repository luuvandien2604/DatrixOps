package setup

import (
	"strings"
	"testing"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
)

func TestValidateCompleteRequestAcceptsSecureSetup(t *testing.T) {
	req := completeRequest{
		Email:      "admin@example.com",
		Password:   strings.Repeat("x", 16),
		SystemName: "DatrixOps",
		Timezone:   "Asia/Ho_Chi_Minh",
		PublicURL:  "https://ops.example.com",
	}
	cfg := &config.Config{Edition: "community", DeploymentMode: "self-hosted"}
	if message := validateCompleteRequest(req, cfg); message != "" {
		t.Fatalf("expected request to be valid, got %q", message)
	}
}

func TestValidateCompleteRequestAcceptsCommunityIPPanel(t *testing.T) {
	req := completeRequest{
		Email:      "admin@datrixops.local",
		Password:   strings.Repeat("x", 32),
		SystemName: "DatrixOps",
		Timezone:   "Asia/Ho_Chi_Minh",
		PublicURL:  "http://203.0.113.10:7800",
	}
	cfg := &config.Config{Edition: "community", DeploymentMode: "self-hosted"}
	if message := validateCompleteRequest(req, cfg); message != "" {
		t.Fatalf("expected IP panel setup to be valid, got %q", message)
	}
}

func TestValidateCompleteRequestRejectsInsecureRemoteURL(t *testing.T) {
	req := completeRequest{
		Email:      "admin@example.com",
		Password:   strings.Repeat("x", 16),
		SystemName: "DatrixOps",
		Timezone:   "UTC",
		PublicURL:  "http://ops.example.com",
	}
	cfg := &config.Config{Edition: "community", DeploymentMode: "self-hosted"}
	if message := validateCompleteRequest(req, cfg); !strings.Contains(message, "HTTPS") {
		t.Fatalf("expected HTTPS validation error, got %q", message)
	}
}

func TestValidateCompleteRequestRejectsWeakPassword(t *testing.T) {
	req := completeRequest{
		Email:      "admin@example.com",
		Password:   "short",
		SystemName: "DatrixOps",
		Timezone:   "UTC",
		PublicURL:  "https://ops.example.com",
	}
	cfg := &config.Config{Edition: "community", DeploymentMode: "self-hosted"}
	if message := validateCompleteRequest(req, cfg); !strings.Contains(message, "12 characters") {
		t.Fatalf("expected password validation error, got %q", message)
	}
}

func TestValidateCompleteRequestRejectsCloudLocalhost(t *testing.T) {
	req := completeRequest{
		Email:      "admin@example.com",
		Password:   strings.Repeat("x", 16),
		SystemName: "DatrixOps Cloud",
		Timezone:   "UTC",
		PublicURL:  "https://localhost",
	}
	cfg := &config.Config{Edition: "cloud", DeploymentMode: "managed"}
	if message := validateCompleteRequest(req, cfg); !strings.Contains(message, "valid domain") {
		t.Fatalf("expected Cloud domain validation error, got %q", message)
	}
}
