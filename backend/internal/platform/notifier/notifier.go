package notifier

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}
var webhookClient = &http.Client{
	Timeout: 8 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	},
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
	payload, _ := json.Marshal(map[string]string{
		"content": message,
	})

	req, _ := http.NewRequest("POST", webhookURL, bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
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
	if config.Port == 0 {
		config.Port = 587
	}
	address := config.Host + ":" + strconv.Itoa(config.Port)
	body := strings.Join([]string{
		"From: " + config.From,
		"To: " + config.To,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		message,
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
