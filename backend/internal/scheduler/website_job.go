package scheduler

import (
	"context"
	"crypto/tls"
	"log/slog"
	"net/http"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/core/website"
)

type WebsiteJob struct {
	repo   website.Repository
	logger *slog.Logger
	ticker *time.Ticker
	quit   chan struct{}
}

func NewWebsiteJob(repo website.Repository, logger *slog.Logger) *WebsiteJob {
	return &WebsiteJob{
		repo:   repo,
		logger: logger,
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

	for _, w := range websites {
		go j.checkWebsite(w)
	}
}

func (j *WebsiteJob) checkWebsite(w website.Website) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	now := time.Now()
	w.LastCheck = &now
	w.Status = "UP"

	// HTTP Check
	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
	}
	
	req, err := http.NewRequestWithContext(ctx, "GET", w.URL, nil)
	if err != nil {
		w.Status = "DOWN"
	} else {
		resp, err := client.Do(req)
		if err != nil || resp.StatusCode >= 400 {
			w.Status = "DOWN"
		}
		if resp != nil {
			resp.Body.Close()
			
			// SSL Check if HTTPS
			if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
				cert := resp.TLS.PeerCertificates[0]
				issuer := cert.Issuer.Organization
				if len(issuer) > 0 {
					w.SSLIssuer = &issuer[0]
				} else {
					issuerCN := cert.Issuer.CommonName
					w.SSLIssuer = &issuerCN
				}
				w.SSLValidTo = &cert.NotAfter
				
				days := int(cert.NotAfter.Sub(now).Hours() / 24)
				w.SSLDaysRemaining = &days
			}
		}
	}

	if err := j.repo.UpdateStatus(context.Background(), &w); err != nil {
		j.logger.Error("failed to update website status", "id", w.ID, "error", err)
	}
}
