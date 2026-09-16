package website

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
)

type Service interface {
	CreateWebsite(ctx context.Context, userID string, req CreateWebsiteRequest) (*Website, error)
	ListWebsites(ctx context.Context, userID string) ([]Website, error)
	DeleteWebsite(ctx context.Context, id string, userID string) error
	GetUptimeSummary(ctx context.Context, userID string, days int, endDateStr string) (*UptimeSummaryResponse, error)
}

type service struct {
	repo Repository
}

func NewService(repo Repository) Service {
	return &service{repo: repo}
}

func (s *service) CreateWebsite(ctx context.Context, userID string, req CreateWebsiteRequest) (*Website, error) {
	req.Name = strings.TrimSpace(req.Name)
	req.URL = strings.TrimSpace(req.URL)
	if req.Name == "" || req.URL == "" {
		return nil, errors.New("name and url are required")
	}
	if len(req.Name) > 120 {
		return nil, errors.New("name must not exceed 120 characters")
	}
	if err := notifier.ValidatePublicWebsiteURL(req.URL); err != nil {
		return nil, err
	}

	w := &Website{
		UserID:     userID,
		Name:       req.Name,
		URL:        req.URL,
		ChannelIDs: req.ChannelIDs,
	}

	if err := s.repo.Create(ctx, w); err != nil {
		return nil, err
	}

	return w, nil
}

func (s *service) ListWebsites(ctx context.Context, userID string) ([]Website, error) {
	return s.repo.ListByUserID(ctx, userID)
}

func (s *service) DeleteWebsite(ctx context.Context, id string, userID string) error {
	return s.repo.Delete(ctx, id, userID)
}

func (s *service) GetUptimeSummary(ctx context.Context, userID string, days int, endDateStr string) (*UptimeSummaryResponse, error) {
	if days <= 0 {
		days = 90
	} else if days > 365 {
		days = 365
	}

	var endDate time.Time
	if endDateStr != "" {
		if t, err := time.Parse("2006-01-02", endDateStr); err == nil {
			endDate = t.UTC()
		}
	}
	if endDate.IsZero() {
		endDate = time.Now().UTC()
	}
	endDate = time.Date(endDate.Year(), endDate.Month(), endDate.Day(), 0, 0, 0, 0, time.UTC)
	startDate := endDate.AddDate(0, 0, -(days - 1))

	websites, err := s.repo.ListByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}

	websiteIDs := make([]string, 0, len(websites))
	for _, w := range websites {
		websiteIDs = append(websiteIDs, w.ID)
	}

	rollupsByEntity, err := s.repo.GetUptimeRollups(ctx, "website", websiteIDs, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}

	items := make([]UptimeSummaryItem, 0, len(websites))
	for _, w := range websites {
		rollups := rollupsByEntity[w.ID]
		createdDate := time.Date(w.CreatedAt.Year(), w.CreatedAt.Month(), w.CreatedAt.Day(), 0, 0, 0, 0, time.UTC)

		dayBars := make([]UptimeDayBar, 0, days)
		var totalUptimeSum float64
		var scoredDays int

		for d := 0; d < days; d++ {
			curDate := startDate.AddDate(0, 0, d)
			dateKey := curDate.Format("2006-01-02")

			if r, found := rollups[dateKey]; found {
				incident := ""
				if r.IncidentTitle != nil {
					incident = *r.IncidentTitle
				}
				dayBars = append(dayBars, UptimeDayBar{
					Date:            dateKey,
					Status:          r.Status,
					UptimePct:       r.UptimePct,
					DowntimeSeconds: r.DowntimeSeconds,
					AvgLatencyMS:    r.AvgLatencyMS,
					IncidentTitle:   incident,
				})
				totalUptimeSum += r.UptimePct
				scoredDays++
			} else {
				if curDate.Before(createdDate) {
					dayBars = append(dayBars, UptimeDayBar{
						Date:            dateKey,
						Status:          "no_data",
						UptimePct:       100.0,
						DowntimeSeconds: 0,
						AvgLatencyMS:    0,
					})
				} else {
					dayBars = append(dayBars, UptimeDayBar{
						Date:            dateKey,
						Status:          "operational",
						UptimePct:       100.0,
						DowntimeSeconds: 0,
						AvgLatencyMS:    45.0,
					})
					totalUptimeSum += 100.0
					scoredDays++
				}
			}
		}

		overallPct := 100.0
		if scoredDays > 0 {
			overallPct = math.Round((totalUptimeSum/float64(scoredDays))*100) / 100
		}

		items = append(items, UptimeSummaryItem{
			ID:               w.ID,
			Name:             w.Name,
			URL:              w.URL,
			CurrentStatus:    w.Status,
			OverallUptimePct: overallPct,
			Days:             dayBars,
		})
	}

	return &UptimeSummaryResponse{
		StartDate: startDate.Format("2006-01-02"),
		EndDate:   endDate.Format("2006-01-02"),
		DaysCount: days,
		Items:     items,
	}, nil
}
