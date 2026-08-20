package notifier

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/smtp"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}
var webhookClient = NewPublicHTTPClient(8*time.Second, 0)

// NewPublicHTTPClient creates an HTTP client that rejects private, loopback,
// link-local, and DNS-rebinding destinations on every new connection.
func NewPublicHTTPClient(timeout time.Duration, maxRedirects int) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	// Do not allow environment proxies to bypass destination validation.
	transport.Proxy = nil
	transport.DialContext = dialPublicAddress
	return &http.Client{
		Transport: transport,
		Timeout:   timeout,
		CheckRedirect: func(_ *http.Request, via []*http.Request) error {
			if maxRedirects <= 0 {
				return http.ErrUseLastResponse
			}
			if len(via) >= maxRedirects {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
}

func dialPublicAddress(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, fmt.Errorf("invalid webhook destination: %w", err)
	}
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, fmt.Errorf("resolve webhook destination: %w", err)
	}
	if len(addresses) == 0 {
		return nil, fmt.Errorf("webhook destination has no IP address")
	}
	for _, address := range addresses {
		if !isPublicIP(address.IP) {
			return nil, fmt.Errorf("webhook destination resolves to a non-public IP address")
		}
	}

	dialer := &net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}
	var lastErr error
	for _, resolved := range addresses {
		connection, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(resolved.IP.String(), port))
		if dialErr == nil {
			return connection, nil
		}
		lastErr = dialErr
	}
	return nil, fmt.Errorf("connect to webhook destination: %w", lastErr)
}

func isPublicIP(ip net.IP) bool {
	return ip != nil && ip.IsGlobalUnicast() &&
		!ip.IsPrivate() && !ip.IsLoopback() &&
		!ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast() &&
		!ip.IsUnspecified()
}

// ValidatePublicHTTPSURL rejects credentials and literal non-public addresses.
// DNS answers are validated again at connection time to prevent DNS rebinding.
func ValidatePublicHTTPSURL(rawURL string) error {
	return validatePublicURL(rawURL, true)
}

// ValidatePublicWebsiteURL allows public HTTP/HTTPS monitoring targets while
// excluding internal network and cloud metadata destinations.
func ValidatePublicWebsiteURL(rawURL string) error {
	return validatePublicURL(rawURL, false)
}

func validatePublicURL(rawURL string, requireHTTPS bool) error {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("URL must be absolute")
	}
	if requireHTTPS && !strings.EqualFold(parsed.Scheme, "https") {
		return fmt.Errorf("URL must use HTTPS")
	}
	if !requireHTTPS && !strings.EqualFold(parsed.Scheme, "https") && !strings.EqualFold(parsed.Scheme, "http") {
		return fmt.Errorf("URL must use HTTP or HTTPS")
	}
	if parsed.User != nil {
		return fmt.Errorf("URL must not contain embedded credentials")
	}
	host := strings.TrimSuffix(strings.ToLower(parsed.Hostname()), ".")
	if host == "" {
		return fmt.Errorf("URL host is required")
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return fmt.Errorf("URL must not target localhost")
	}
	if ip := net.ParseIP(host); ip != nil && !isPublicIP(ip) {
		return fmt.Errorf("URL must not target a private, loopback, link-local, or unspecified address")
	}
	return nil
}

// ValidateDiscordWebhookURL restricts Discord channels to Discord's webhook API.
func ValidateDiscordWebhookURL(rawURL string) error {
	if err := ValidatePublicHTTPSURL(rawURL); err != nil {
		return err
	}
	parsed, _ := url.Parse(strings.TrimSpace(rawURL))
	host := strings.TrimSuffix(strings.ToLower(parsed.Hostname()), ".")
	if host != "discord.com" && !strings.HasSuffix(host, ".discord.com") &&
		host != "discordapp.com" && !strings.HasSuffix(host, ".discordapp.com") {
		return fmt.Errorf("URL must use an official Discord host")
	}
	if !strings.HasPrefix(parsed.EscapedPath(), "/api/webhooks/") {
		return fmt.Errorf("URL must be a Discord webhook endpoint")
	}
	return nil
}

func SendTelegram(token, chatID, message string) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	payload, _ := json.Marshal(map[string]string{
		"chat_id":    chatID,
		"text":       message,
		"parse_mode": "HTML",
	})

	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("telegram api returned status: %d", resp.StatusCode)
	}
	return nil
}

func SendDiscord(webhookURL, message string) error {
	if err := ValidateDiscordWebhookURL(webhookURL); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]string{
		"content": message,
	})

	req, _ := http.NewRequest("POST", webhookURL, bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")

	resp, err := webhookClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("discord webhook returned status: %d", resp.StatusCode)
	}
	return nil
}

type DiscordEmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

type DiscordEmbedFooter struct {
	Text string `json:"text"`
}

type DiscordEmbed struct {
	Title       string              `json:"title"`
	Description string              `json:"description,omitempty"`
	Color       int                 `json:"color,omitempty"`
	Fields      []DiscordEmbedField `json:"fields,omitempty"`
	Footer      *DiscordEmbedFooter `json:"footer,omitempty"`
	Timestamp   string              `json:"timestamp,omitempty"`
}

func SendDiscordEmbed(webhookURL string, embed DiscordEmbed) error {
	if err := ValidateDiscordWebhookURL(webhookURL); err != nil {
		return err
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"embeds": []DiscordEmbed{embed},
	})

	req, _ := http.NewRequest("POST", webhookURL, bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")

	resp, err := webhookClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("discord webhook returned status: %d", resp.StatusCode)
	}
	return nil
}

type EmailConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	To       string
	UseTLS   bool
}

func SendEmail(config EmailConfig, subject, message string) error {
	return SendHTMLEmail(config, subject, "<pre style=\"font-family: monospace; font-size: 14px;\">"+message+"</pre>")
}

func SendHTMLEmail(config EmailConfig, subject, htmlBody string) error {
	if config.Port == 0 {
		config.Port = 587
	}
	address := config.Host + ":" + strconv.Itoa(config.Port)
	body := strings.Join([]string{
		"From: " + config.From,
		"To: " + config.To,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"",
		htmlBody,
	}, "\r\n")

	var auth smtp.Auth
	if config.Username != "" || config.Password != "" {
		auth = smtp.PlainAuth("", config.Username, config.Password, config.Host)
	}

	if config.UseTLS {
		tlsConfig := &tls.Config{
			ServerName: config.Host,
			MinVersion: tls.VersionTLS12,
		}
		conn, err := tls.Dial("tcp", address, tlsConfig)
		if err != nil {
			return err
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, config.Host)
		if err != nil {
			return err
		}
		defer client.Quit()
		return sendSMTPMessage(client, auth, config.From, config.To, []byte(body))
	}

	client, err := smtp.Dial(address)
	if err != nil {
		return err
	}
	defer client.Quit()
	if ok, _ := client.Extension("STARTTLS"); ok {
		tlsConfig := &tls.Config{
			ServerName: config.Host,
			MinVersion: tls.VersionTLS12,
		}
		if err := client.StartTLS(tlsConfig); err != nil {
			return err
		}
	}
	return sendSMTPMessage(client, auth, config.From, config.To, []byte(body))
}

func sendSMTPMessage(client *smtp.Client, auth smtp.Auth, from, to string, body []byte) error {
	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return err
		}
	}
	if err := client.Mail(from); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(body); err != nil {
		_ = writer.Close()
		return err
	}
	return writer.Close()
}

func SendWebhook(url string, payload map[string]interface{}) error {
	if err := ValidatePublicHTTPSURL(url); err != nil {
		return err
	}
	data, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := webhookClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status: %d", resp.StatusCode)
	}
	return nil
}

type WebhookDeliveryResult struct {
	StatusCode int
	LatencyMs  int
}

func SendSignedWebhook(url string, payload []byte, signingSecret, eventID, eventType string) (WebhookDeliveryResult, error) {
	started := time.Now()
	if err := ValidatePublicHTTPSURL(url); err != nil {
		return WebhookDeliveryResult{}, err
	}
	req, err := http.NewRequest("POST", url, bytes.NewReader(payload))
	if err != nil {
		return WebhookDeliveryResult{}, err
	}

	mac := hmac.New(sha256.New, []byte(signingSecret))
	_, _ = mac.Write(payload)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "DatrixOps-Webhooks/1.0")
	req.Header.Set("X-DatrixOps-Delivery", eventID)
	req.Header.Set("X-DatrixOps-Event", eventType)
	req.Header.Set("X-DatrixOps-Signature", signature)

	resp, err := webhookClient.Do(req)
	latencyMs := int(time.Since(started).Milliseconds())
	if err != nil {
		return WebhookDeliveryResult{LatencyMs: latencyMs}, err
	}
	defer resp.Body.Close()

	result := WebhookDeliveryResult{
		StatusCode: resp.StatusCode,
		LatencyMs:  latencyMs,
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return result, fmt.Errorf("webhook returned status: %d", resp.StatusCode)
	}
	return result, nil
}
