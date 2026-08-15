package notifier

import "testing"

func TestValidatePublicHTTPSURL(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{name: "public hostname", url: "https://hooks.example.com/events"},
		{name: "public literal", url: "https://1.1.1.1/events"},
		{name: "plain HTTP", url: "http://hooks.example.com/events", wantErr: true},
		{name: "loopback IPv4", url: "https://127.0.0.1/events", wantErr: true},
		{name: "loopback IPv6", url: "https://[::1]/events", wantErr: true},
		{name: "private IPv4", url: "https://10.0.0.1/events", wantErr: true},
		{name: "link local metadata", url: "https://169.254.169.254/latest", wantErr: true},
		{name: "localhost name", url: "https://api.localhost/events", wantErr: true},
		{name: "embedded credentials", url: "https://user:pass@hooks.example.com/events", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePublicHTTPSURL(tt.url)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidatePublicHTTPSURL(%q) error=%v, wantErr=%v", tt.url, err, tt.wantErr)
			}
		})
	}
}

func TestValidateDiscordWebhookURL(t *testing.T) {
	if err := ValidateDiscordWebhookURL("https://discord.com/api/webhooks/123/token"); err != nil {
		t.Fatalf("expected official Discord webhook to pass: %v", err)
	}
	for _, rawURL := range []string{
		"https://example.com/api/webhooks/123/token",
		"https://discord.com/channels/123",
		"https://discord.com.evil.example/api/webhooks/123/token",
	} {
		if err := ValidateDiscordWebhookURL(rawURL); err == nil {
			t.Fatalf("expected %q to be rejected", rawURL)
		}
	}
}

func TestValidatePublicWebsiteURL(t *testing.T) {
	if err := ValidatePublicWebsiteURL("http://example.com/health"); err != nil {
		t.Fatalf("expected public HTTP website to pass: %v", err)
	}
	for _, rawURL := range []string{
		"http://127.0.0.1/admin",
		"http://169.254.169.254/latest/meta-data",
		"file:///etc/passwd",
	} {
		if err := ValidatePublicWebsiteURL(rawURL); err == nil {
			t.Fatalf("expected %q to be rejected", rawURL)
		}
	}
}
