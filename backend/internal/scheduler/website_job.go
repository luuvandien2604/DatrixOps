package scheduler

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/core/alert"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/website"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
)

type WebsiteJob struct {
	repo   website.Repository
	db     *database.DB
	logger *slog.Logger
	ticker *time.Ticker
	quit   chan struct{}
}

func NewWebsiteJob(repo website.Repository, db *database.DB, logger *slog.Logger) *WebsiteJob {
	return &WebsiteJob{
		repo:   repo,
		db:     db,
		logger: logger.With("component", "WebsiteJob"),
		quit:   make(chan struct{}),
	}
}

func (j *WebsiteJob) Start() {
	j.ticker = time.NewTicker(1 * time.Minute)
	j.logger.Info("Website scheduler started")

	go func() {
		// Run immediately on start
		j.run()

		for {
			select {
			case <-j.ticker.C:
				j.run()
			case <-j.quit:
				j.ticker.Stop()
				return
			}
		}
	}()
}

func (j *WebsiteJob) Stop() {
	close(j.quit)
}

func (j *WebsiteJob) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	websites, err := j.repo.ListAll(ctx)
	if err != nil {
		j.logger.Error("failed to list websites for check", "error", err)
		return
	}

	const maxConcurrentChecks = 10
	sem := make(chan struct{}, maxConcurrentChecks)
	var wg sync.WaitGroup

	for _, w := range websites {
		select {
		case <-ctx.Done():
			j.logger.Warn("website scheduler context expired before all checks were queued", "error", ctx.Err())
			wg.Wait()
			return
		case sem <- struct{}{}:
		}

		wg.Add(1)
		go func(w website.Website) {
			defer wg.Done()
			defer func() { <-sem }()
			j.checkWebsite(ctx, w)
		}(w)
	}

	wg.Wait()
}

func (j *WebsiteJob) checkWebsite(parent context.Context, w website.Website) {
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()

	previousStatus := strings.ToUpper(strings.TrimSpace(w.Status))
	previousDownStarted := w.DownStartedAt

	result := probeWebsite(ctx, w.URL, 10*time.Second, time.Now())
	w.LastCheck = &result.checkedAt
	w.Status = result.status
	w.SSLIssuer = result.sslIssuer
	w.SSLValidTo = result.sslValidTo
	w.SSLDaysRemaining = result.sslDaysRemaining

	if result.failureKind != "" {
		j.logger.Warn("website check failed", "id", w.ID, "failure_kind", result.failureKind)
	}

	// 1. Evaluate DOWN transition
	if result.status == "DOWN" {
		if previousStatus != "DOWN" {
			// Transition from UP (or unknown) to DOWN
			w.DownStartedAt = &result.checkedAt
			go j.notifyWebsiteDown(w, result)
		} else {
			// Already DOWN: keep original down_started_at
			w.DownStartedAt = previousDownStarted
			if w.DownStartedAt == nil {
				w.DownStartedAt = &result.checkedAt
			}
		}
	}

	// 2. Evaluate UP transition
	if result.status == "UP" {
		if previousStatus == "DOWN" {
			// Recovered from DOWN to UP
			var downtimeDuration time.Duration
			if previousDownStarted != nil {
				downtimeDuration = time.Since(*previousDownStarted)
			}
			w.DownStartedAt = nil
			go j.notifyWebsiteUp(w, result, downtimeDuration)
		}
	}

	// 3. Evaluate SSL Certificate Expiration
	if result.sslDaysRemaining != nil && *result.sslDaysRemaining <= 14 {
		if w.LastSSLAlertAt == nil || time.Since(*w.LastSSLAlertAt) >= 24*time.Hour {
			now := time.Now()
			w.LastSSLAlertAt = &now
			go j.notifyWebsiteSSL(w, result)
		}
	} else if result.sslDaysRemaining != nil && *result.sslDaysRemaining > 14 {
		w.LastSSLAlertAt = nil
	}

	if err := j.repo.UpdateStatus(context.Background(), &w); err != nil {
		j.logger.Error("failed to update website status", "id", w.ID, "error", err)
	}
	var failureKind *string
	if result.failureKind != "" {
		failureKind = &result.failureKind
	}
	if err := j.repo.RecordCheck(context.Background(), website.CheckResult{
		WebsiteID:        w.ID,
		Status:           result.status,
		StatusCode:       result.statusCode,
		ResponseTimeMS:   result.responseTimeMS,
		FailureKind:      failureKind,
		SSLDaysRemaining: result.sslDaysRemaining,
		CheckedAt:        result.checkedAt,
	}); err != nil {
		j.logger.Error("failed to record website check", "id", w.ID, "error", err)
	}
}

type websiteProbeResult struct {
	status           string
	failureKind      string
	sslIssuer        *string
	sslValidTo       *time.Time
	sslDaysRemaining *int
	checkedAt        time.Time
	statusCode       *int
	responseTimeMS   int
}

func probeWebsite(ctx context.Context, rawURL string, timeout time.Duration, now time.Time) websiteProbeResult {
	client := notifier.NewPublicHTTPClient(timeout, 10)
	return probeWebsiteWithClient(ctx, rawURL, client, now)
}

func probeWebsiteWithClient(ctx context.Context, rawURL string, client *http.Client, now time.Time) (result websiteProbeResult) {
	startedAt := time.Now()
	result = websiteProbeResult{
		status:    "UP",
		checkedAt: now,
	}
	defer func() {
		result.responseTimeMS = int(time.Since(startedAt).Milliseconds())
	}()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		result.status = "DOWN"
		result.failureKind = "invalid_url"
		return result
	}

	resp, err := client.Do(req)
	if err != nil {
		result.status = "DOWN"
		result.failureKind = classifyWebsiteCheckError(err)
		return result
	}
	defer resp.Body.Close()
	result.statusCode = &resp.StatusCode
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))

	if resp.StatusCode >= http.StatusBadRequest {
		result.status = "DOWN"
		result.failureKind = "http_status_error"
	}

	if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
		cert := resp.TLS.PeerCertificates[0]
		issuer := cert.Issuer.CommonName
		if len(cert.Issuer.Organization) > 0 {
			issuer = cert.Issuer.Organization[0]
		}
		result.sslIssuer = &issuer
		result.sslValidTo = &cert.NotAfter
		days := int(cert.NotAfter.Sub(now).Hours() / 24)
		result.sslDaysRemaining = &days
	}

	return result
}

func classifyWebsiteCheckError(err error) string {
	var hostnameErr x509.HostnameError
	if errors.As(err, &hostnameErr) {
		return "tls_hostname_mismatch"
	}

	var unknownAuthorityErr x509.UnknownAuthorityError
	if errors.As(err, &unknownAuthorityErr) {
		return "tls_untrusted_chain"
	}

	var certInvalidErr x509.CertificateInvalidError
	if errors.As(err, &certInvalidErr) {
		switch certInvalidErr.Reason {
		case x509.Expired:
			return "tls_certificate_expired_or_not_yet_valid"
		default:
			return "tls_certificate_invalid"
		}
	}

	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return "dns_failure"
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "timeout"
	}

	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "connection refused"):
		return "connection_refused"
	case strings.Contains(message, "redirect loop") || strings.Contains(message, "stopped after 10 redirects"):
		return "redirect_loop"
	case strings.Contains(message, "certificate has expired") || strings.Contains(message, "not yet valid"):
		return "tls_certificate_expired_or_not_yet_valid"
	case strings.Contains(message, "certificate is not trusted") || strings.Contains(message, "unknown authority"):
		return "tls_untrusted_chain"
	case strings.Contains(message, "certificate is valid for") || strings.Contains(message, "not "):
		return "tls_hostname_mismatch"
	case strings.Contains(message, "tls") || strings.Contains(message, "handshake"):
		return "tls_handshake_failure"
	default:
		return "network_error"
	}
}

func (j *WebsiteJob) getWebsiteChannels(ctx context.Context, websiteID, userID string) []alert.AlertChannel {
	if j.db == nil {
		return nil
	}
	// 1. Try explicit website_channels
	rows, err := j.db.Pool.Query(ctx, `
		SELECT c.id, c.user_id, c.name, c.type, c.config, c.enabled
		FROM website_channels wc
		JOIN alert_channels c ON c.id = wc.alert_channel_id
		WHERE wc.website_id = $1 AND c.enabled = true
	`, websiteID)
	if err == nil {
		defer rows.Close()
		channels := make([]alert.AlertChannel, 0)
		for rows.Next() {
			var ch alert.AlertChannel
			var configBytes []byte
			if err := rows.Scan(&ch.ID, &ch.UserID, &ch.Name, &ch.Type, &configBytes, &ch.Enabled); err == nil {
				ch.Config = make(map[string]interface{})
				_ = json.Unmarshal(configBytes, &ch.Config)
				channels = append(channels, ch)
			}
		}
		if len(channels) > 0 {
			return channels
		}
	}

	// 2. Fallback: all enabled channels of the user
	fallbackRows, err := j.db.Pool.Query(ctx, `
		SELECT id, user_id, name, type, config, enabled
		FROM alert_channels
		WHERE user_id = $1 AND enabled = true
	`, userID)
	if err != nil {
		return nil
	}
	defer fallbackRows.Close()

	channels := make([]alert.AlertChannel, 0)
	for fallbackRows.Next() {
		var ch alert.AlertChannel
		var configBytes []byte
		if err := fallbackRows.Scan(&ch.ID, &ch.UserID, &ch.Name, &ch.Type, &configBytes, &ch.Enabled); err == nil {
			ch.Config = make(map[string]interface{})
			_ = json.Unmarshal(configBytes, &ch.Config)
			channels = append(channels, ch)
		}
	}
	return channels
}

func (j *WebsiteJob) notifyWebsiteDown(w website.Website, res websiteProbeResult) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	channels := j.getWebsiteChannels(ctx, w.ID, w.UserID)
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		loc = time.FixedZone("ICT", 7*3600)
	}
	nowStr := time.Now().In(loc).Format("2006-01-02 15:04:05 (GMT+7)")

	statusText := "N/A"
	if res.statusCode != nil {
		statusText = fmt.Sprintf("%d", *res.statusCode)
	}
	reason := failureLabel(res.failureKind)

	title := fmt.Sprintf("Website down: %s", w.Name)
	dashMsg := fmt.Sprintf("Website %s (%s) is unreachable (%s, HTTP %s).", w.Name, w.URL, reason, statusText)

	// Save dashboard notification
	if j.db != nil {
		metadata, _ := json.Marshal(map[string]any{
			"url":              w.URL,
			"status_code":      res.statusCode,
			"failure_kind":     res.failureKind,
			"response_time_ms": res.responseTimeMS,
		})
		_, _ = j.db.Pool.Exec(ctx, `
			INSERT INTO dashboard_notifications (user_id, kind, severity, title, message, metadata)
			VALUES ($1, 'website_down', 'critical', $2, $3, $4)
		`, w.UserID, title, dashMsg, metadata)
	}

	// Telegram
	teleMsg := fmt.Sprintf(
		"<b>[DATRIXOPS ALERT] WEBSITE DOWN</b>\n─────────────────────────────\n<b>Website:</b> <b>%s</b>\n<b>URL:</b> %s\n<b>Status Code:</b> <code>%s</code>\n<b>Error:</b> %s\n<b>Latency:</b> %dms\n<b>Time:</b> %s",
		w.Name, w.URL, statusText, reason, res.responseTimeMS, nowStr,
	)

	// Discord
	discord := notifier.DiscordEmbed{
		Title:       "[DATRIXOPS ALERT] WEBSITE DOWN: " + w.Name,
		Description: fmt.Sprintf("Website **%s** (%s) is unreachable or returned an error.", w.Name, w.URL),
		Color:       0xEF4444,
		Fields: []notifier.DiscordEmbedField{
			{Name: "Website", Value: w.Name, Inline: true},
			{Name: "URL", Value: w.URL, Inline: true},
			{Name: "Status Code", Value: statusText, Inline: true},
			{Name: "Error", Value: reason, Inline: true},
			{Name: "Latency", Value: fmt.Sprintf("%dms", res.responseTimeMS), Inline: true},
			{Name: "Triggered At", Value: nowStr, Inline: true},
		},
		Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Website Uptime Monitoring"},
	}

	// Email
	emailSubj := "[DATRIXOPS ALERT] Website Down: " + w.Name
	emailHTML := renderWebsiteEmail(w.Name, w.URL, "DOWN", "#EF4444", reason, statusText, res.responseTimeMS, nowStr, "")

	j.sendWebsiteNotifications(channels, teleMsg, discord, emailSubj, emailHTML)
}

func (j *WebsiteJob) notifyWebsiteUp(w website.Website, res websiteProbeResult, downtime time.Duration) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	channels := j.getWebsiteChannels(ctx, w.ID, w.UserID)
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		loc = time.FixedZone("ICT", 7*3600)
	}
	nowStr := time.Now().In(loc).Format("2006-01-02 15:04:05 (GMT+7)")
	downtimeStr := formatDuration(downtime)

	statusText := "200 OK"
	if res.statusCode != nil {
		statusText = fmt.Sprintf("%d", *res.statusCode)
	}

	title := fmt.Sprintf("Website online: %s", w.Name)
	dashMsg := fmt.Sprintf("Website %s (%s) is back online. (Downtime: %s)", w.Name, w.URL, downtimeStr)

	// Save dashboard notification
	if j.db != nil {
		metadata, _ := json.Marshal(map[string]any{
			"url":               w.URL,
			"status_code":       res.statusCode,
			"downtime_duration": downtimeStr,
			"response_time_ms":  res.responseTimeMS,
		})
		_, _ = j.db.Pool.Exec(ctx, `
			INSERT INTO dashboard_notifications (user_id, kind, severity, title, message, metadata)
			VALUES ($1, 'website_up', 'resolved', $2, $3, $4)
		`, w.UserID, title, dashMsg, metadata)
	}

	// Telegram
	teleMsg := fmt.Sprintf(
		"<b>[DATRIXOPS RESOLVED] WEBSITE BACK ONLINE</b>\n─────────────────────────────\n<b>Website:</b> <b>%s</b>\n<b>URL:</b> %s\n<b>Status:</b> <b>UP / Healthy</b>\n<b>Downtime Duration:</b> <code>%s</code>\n<b>Latency:</b> %dms\n<b>Recovered At:</b> %s",
		w.Name, w.URL, downtimeStr, res.responseTimeMS, nowStr,
	)

	// Discord
	discord := notifier.DiscordEmbed{
		Title:       "[DATRIXOPS RESOLVED] WEBSITE BACK ONLINE: " + w.Name,
		Description: fmt.Sprintf("Website **%s** has recovered and is responding normally.", w.Name),
		Color:       0x10B981,
		Fields: []notifier.DiscordEmbedField{
			{Name: "Website", Value: w.Name, Inline: true},
			{Name: "URL", Value: w.URL, Inline: true},
			{Name: "Status", Value: "Online / Healthy", Inline: true},
			{Name: "Downtime Duration", Value: downtimeStr, Inline: true},
			{Name: "Latency", Value: fmt.Sprintf("%dms", res.responseTimeMS), Inline: true},
			{Name: "Recovered At", Value: nowStr, Inline: true},
		},
		Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps Website Uptime Monitoring"},
	}

	// Email
	emailSubj := fmt.Sprintf("[DATRIXOPS RESOLVED] Website Back Online (%s): %s", downtimeStr, w.Name)
	emailHTML := renderWebsiteEmail(w.Name, w.URL, "UP", "#10B981", "Normal Operation", statusText, res.responseTimeMS, nowStr, downtimeStr)

	j.sendWebsiteNotifications(channels, teleMsg, discord, emailSubj, emailHTML)
}

func (j *WebsiteJob) notifyWebsiteSSL(w website.Website, res websiteProbeResult) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	channels := j.getWebsiteChannels(ctx, w.ID, w.UserID)
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		loc = time.FixedZone("ICT", 7*3600)
	}
	nowStr := time.Now().In(loc).Format("2006-01-02 15:04:05 (GMT+7)")

	days := 0
	if res.sslDaysRemaining != nil {
		days = *res.sslDaysRemaining
	}
	issuer := "Unknown"
	if res.sslIssuer != nil {
		issuer = *res.sslIssuer
	}
	validTo := "Unknown"
	if res.sslValidTo != nil {
		validTo = res.sslValidTo.In(loc).Format("2006-01-02")
	}

	title := fmt.Sprintf("SSL certificate expiring: %s (%d days)", w.Name, days)
	dashMsg := fmt.Sprintf("SSL certificate for %s will expire in %d days (%s).", w.Name, days, validTo)

	if j.db != nil {
		metadata, _ := json.Marshal(map[string]any{
			"url":                w.URL,
			"ssl_days_remaining": days,
			"ssl_issuer":         issuer,
			"ssl_valid_to":       validTo,
		})
		_, _ = j.db.Pool.Exec(ctx, `
			INSERT INTO dashboard_notifications (user_id, kind, severity, title, message, metadata)
			VALUES ($1, 'website_ssl_warning', 'warning', $2, $3, $4)
		`, w.UserID, title, dashMsg, metadata)
	}

	// Telegram
	teleMsg := fmt.Sprintf(
		"<b>[DATRIXOPS WARNING] SSL CERTIFICATE EXPIRING</b>\n─────────────────────────────\n<b>Website:</b> <b>%s</b>\n<b>URL:</b> %s\n<b>Days Remaining:</b> <b>%d days</b>\n<b>Issuer:</b> %s\n<b>Valid Until:</b> %s\n<b>Time:</b> %s",
		w.Name, w.URL, days, issuer, validTo, nowStr,
	)

	// Discord
	discord := notifier.DiscordEmbed{
		Title:       fmt.Sprintf("[DATRIXOPS WARNING] SSL CERTIFICATE EXPIRING: %s", w.Name),
		Description: fmt.Sprintf("The SSL certificate for **%s** will expire in **%d days**.", w.Name, days),
		Color:       0xF59E0B,
		Fields: []notifier.DiscordEmbedField{
			{Name: "Website", Value: w.Name, Inline: true},
			{Name: "URL", Value: w.URL, Inline: true},
			{Name: "Days Remaining", Value: fmt.Sprintf("%d days", days), Inline: true},
			{Name: "Issuer", Value: issuer, Inline: true},
			{Name: "Valid Until", Value: validTo, Inline: true},
			{Name: "Timestamp", Value: nowStr, Inline: true},
		},
		Footer: &notifier.DiscordEmbedFooter{Text: "DatrixOps SSL Certificate Monitoring"},
	}

	emailSubj := fmt.Sprintf("[DATRIXOPS WARNING] SSL Expiring in %d Days: %s", days, w.Name)
	emailHTML := renderWebsiteEmail(w.Name, w.URL, "SSL WARNING", "#F59E0B", fmt.Sprintf("Expires in %d days", days), issuer, 0, nowStr, "")

	j.sendWebsiteNotifications(channels, teleMsg, discord, emailSubj, emailHTML)
}

func (j *WebsiteJob) sendWebsiteNotifications(channels []alert.AlertChannel, teleMsg string, discord notifier.DiscordEmbed, emailSubj, emailHTML string) {
	for _, channel := range channels {
		var err error
		switch channel.Type {
		case "telegram":
			token, _ := channel.Config["bot_token"].(string)
			chatID, _ := channel.Config["chat_id"].(string)
			if token != "" && chatID != "" {
				err = notifier.SendTelegram(token, chatID, teleMsg)
			}
		case "discord":
			webhookURL, _ := channel.Config["webhook_url"].(string)
			if webhookURL != "" {
				err = notifier.SendDiscordEmbed(webhookURL, discord)
			}
		case "email":
			err = notifier.SendHTMLEmail(emailConfigFromChannel(channel), emailSubj, emailHTML)
		}
		if err != nil {
			j.logger.Warn("failed to send website notification", "channel_id", channel.ID, "type", channel.Type, "error", err)
		}
	}
}

func failureLabel(kind string) string {
	switch kind {
	case "connection_refused":
		return "Connection Refused"
	case "timeout":
		return "Connection Timeout"
	case "dns_failure":
		return "DNS Lookup Failed"
	case "http_status_error":
		return "HTTP Status Error (4xx/5xx)"
	case "tls_certificate_expired_or_not_yet_valid":
		return "SSL Certificate Expired"
	case "tls_untrusted_chain":
		return "SSL Untrusted Authority"
	case "tls_hostname_mismatch":
		return "SSL Hostname Mismatch"
	case "tls_handshake_failure":
		return "TLS Handshake Failed"
	case "redirect_loop":
		return "Too Many Redirects"
	default:
		if kind != "" {
			return kind
		}
		return "Service Unreachable"
	}
}

func renderWebsiteEmail(name, url, statusText, statusBg, reason, httpStatus string, latency int, timestamp, downtime string) string {
	downtimeRow := ""
	if downtime != "" {
		downtimeRow = fmt.Sprintf(`<tr><td class="label">Downtime Duration</td><td class="val">%s</td></tr>`, downtime)
	}

	latencyRow := ""
	if latency > 0 {
		latencyRow = fmt.Sprintf(`<tr><td class="label">Response Latency</td><td class="val">%dms</td></tr>`, latency)
	}

	tmpl := `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 24px; }
.card { max-width: 560px; margin: 0 auto; background: #131b2e; border: 1px solid #232f48; border-radius: 12px; overflow: hidden; }
.header { padding: 20px 24px; background: #1a243b; border-bottom: 1px solid #232f48; display: flex; align-items: center; justify-content: space-between; }
.brand { font-size: 14px; font-weight: 700; letter-spacing: 1px; color: #ffffff; }
.badge { background: {{STATUS_BG}}; color: #ffffff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; }
.content { padding: 24px; }
.title { font-size: 18px; font-weight: 700; color: #ffffff; margin: 0 0 16px 0; }
.table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
.table td { padding: 10px 0; border-bottom: 1px solid #1e293b; font-size: 13px; }
.label { color: #94a3b8; width: 35%; }
.val { color: #f1f5f9; font-weight: 600; font-family: monospace; }
.footer { padding: 16px 24px; background: #0e1526; border-top: 1px solid #1e293b; text-align: center; font-size: 11px; color: #64748b; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <span class="brand">DATRIXOPS UPTIME</span>
    <span class="badge">{{STATUS_TEXT}}</span>
  </div>
  <div class="content">
    <div class="title">{{NAME}}</div>
    <table class="table">
      <tr><td class="label">Website</td><td class="val">{{NAME}}</td></tr>
      <tr><td class="label">URL</td><td class="val">{{URL}}</td></tr>
      <tr><td class="label">Status</td><td class="val">{{REASON}}</td></tr>
      <tr><td class="label">HTTP Code</td><td class="val">{{HTTP_STATUS}}</td></tr>
      {{LATENCY_ROW}}
      {{DOWNTIME_ROW}}
      <tr><td class="label">Timestamp</td><td class="val">{{TIMESTAMP}}</td></tr>
    </table>
  </div>
  <div class="footer">
    Automated notification sent by DatrixOps Uptime Monitor.
  </div>
</div>
</body>
</html>`

	r := strings.NewReplacer(
		"{{STATUS_BG}}", statusBg,
		"{{STATUS_TEXT}}", statusText,
		"{{NAME}}", name,
		"{{URL}}", url,
		"{{REASON}}", reason,
		"{{HTTP_STATUS}}", httpStatus,
		"{{LATENCY_ROW}}", latencyRow,
		"{{DOWNTIME_ROW}}", downtimeRow,
		"{{TIMESTAMP}}", timestamp,
	)
	return r.Replace(tmpl)
}
