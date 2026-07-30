package setup

import (
	"strings"
	"testing"
)

func TestValidateCompleteRequestAcceptsSecureSetup(t *testing.T) {
	req := completeRequest{
		Email:      "admin@example.com",
		Password:   strings.Repeat("x", 16),
		SystemName: "DatrixOps",
		Timezone:   "Asia/Ho_Chi_Minh",
		PublicURL:  "https://ops.example.com",
	}
	if message := validateCompleteRequest(req); message != "" {
		t.Fatalf("expected request to be valid, got %q", message)
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
	if message := validateCompleteRequest(req); !strings.Contains(message, "HTTPS") {
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
	if message := validateCompleteRequest(req); !strings.Contains(message, "12 characters") {
		t.Fatalf("expected password validation error, got %q", message)
	}
}
