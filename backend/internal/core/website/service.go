package website

import (
	"context"
	"errors"
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
	if req.Name == "" || req.URL == "" {
		return nil, errors.New("name and url are required")
	}

	w := &Website{
		UserID: userID,
		Name:   req.Name,
		URL:    req.URL,
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
