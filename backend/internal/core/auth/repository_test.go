package auth

import "testing"

func TestRefreshTokenHashDoesNotStoreBearerValue(t *testing.T) {
	raw := "a-plaintext-refresh-token"
	digest := refreshTokenHash(raw)
	if digest == raw {
		t.Fatal("refresh token digest must differ from the bearer token")
	}
	if len(digest) != 64 {
		t.Fatalf("expected SHA-256 hex digest, got %d characters", len(digest))
	}
	if digest != refreshTokenHash(raw) {
		t.Fatal("refresh token digest must be deterministic")
	}
}
