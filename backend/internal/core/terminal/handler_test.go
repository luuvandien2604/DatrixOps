package terminal

import (
	"net/http/httptest"
	"testing"
)

func TestSameOriginIgnoresForwardedHost(t *testing.T) {
	request := httptest.NewRequest("GET", "https://panel.example/api/v1/terminal/browser", nil)
	request.Host = "panel.example"
	request.Header.Set("Origin", "https://evil.example")
	request.Header.Set("X-Forwarded-Host", "evil.example")

	if sameOrigin(request) {
		t.Fatal("spoofed X-Forwarded-Host must not bypass the origin check")
	}

	request.Header.Set("Origin", "https://panel.example")
	if !sameOrigin(request) {
		t.Fatal("matching request Host and Origin should be accepted")
	}
}

func TestClientAddressUsesProxyAppendedAddress(t *testing.T) {
	request := httptest.NewRequest("GET", "https://panel.example/", nil)
	request.RemoteAddr = "172.18.0.2:42100"
	request.Header.Set("X-Forwarded-For", "198.51.100.40, 203.0.113.12")

	if got := clientAddress(request); got != "203.0.113.12" {
		t.Fatalf("clientAddress() = %q, want proxy-appended address", got)
	}
}
