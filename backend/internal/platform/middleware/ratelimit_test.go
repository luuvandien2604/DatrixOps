package middleware

import (
	"net/http/httptest"
	"testing"
)

func TestGetIPUsesProxyAppendedAddressAndNormalizesIPv6(t *testing.T) {
	request := httptest.NewRequest("GET", "http://example.com", nil)
	request.RemoteAddr = "[2001:db8::10]:43210"
	if got := getIP(request); got != "2001:db8::10" {
		t.Fatalf("IPv6 address = %q", got)
	}

	request.Header.Set("X-Forwarded-For", "198.51.100.20, 203.0.113.9")
	if got := getIP(request); got != "203.0.113.9" {
		t.Fatalf("forwarded client address = %q", got)
	}
}
