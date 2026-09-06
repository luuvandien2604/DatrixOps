package website

import (
	"context"
	"errors"
	"strings"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
)

type Service interface {
	CreateWebsite(ctx context.Context, userID string, req CreateWebsiteRequest) (*Website, error)
	ListWebsites(ctx context.Context, userID string) ([]Website, error)
	DeleteWebsite(ctx context.Context, id string, userID string) error
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
