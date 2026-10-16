package scheduler

import (
	"context"
	"crypto/x509"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

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
			w.DownStartedAt = nil
		}
	}

	// 3. Evaluate SSL Certificate Expiration
	if result.sslDaysRemaining != nil && *result.sslDaysRemaining <= 14 {
		if w.LastSSLAlertAt == nil || time.Since(*w.LastSSLAlertAt) >= 24*time.Hour {
			now := time.Now()
			w.LastSSLAlertAt = &now
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
	res := probeWebsiteWithClient(ctx, rawURL, client, now)
	if res.status == "DOWN" {
		// Retry once after 3 seconds to avoid transient false alarms (e.g. 2s container restarts during deploy)
		select {
		case <-ctx.Done():
			return res
		case <-time.After(3 * time.Second):
		}
		retryRes := probeWebsiteWithClient(ctx, rawURL, client, time.Now())
		if retryRes.status == "UP" {
			return retryRes
		}
	}
	return res
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
