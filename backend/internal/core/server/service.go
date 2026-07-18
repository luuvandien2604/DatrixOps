package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// CreateServer generates an agent_token and creates the server.
func (s *Service) CreateServer(ctx context.Context, userID, name, ipAddress string) (*Server, error) {
	// Generate a secure random 32-byte (64 hex characters) token
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, fmt.Errorf("generate agent_token: %w", err)
	}
	agentToken := hex.EncodeToString(b)

	return s.repo.Create(ctx, userID, name, ipAddress, agentToken)
}

// ListServers returns all servers for the user.
func (s *Service) ListServers(ctx context.Context, userID string) ([]*Server, error) {
	return s.repo.ListByUser(ctx, userID)
}

// DeleteServer deletes a server.
func (s *Service) DeleteServer(ctx context.Context, id, userID string) error {
	return s.repo.Delete(ctx, id, userID)
}

// GetServer returns a server.
func (s *Service) GetServer(ctx context.Context, id, userID string) (*Server, error) {
	return s.repo.GetByID(ctx, id, userID)
}

func (s *Service) ListMetrics(ctx context.Context, serverID, userID, timeRange string) ([]*ServerMetric, error) {
	return s.repo.ListMetrics(ctx, serverID, userID, timeRange)
}

func (s *Service) ListCronJobs(ctx context.Context, serverID, userID string) ([]CronJob, error) {
	return s.repo.ListCronJobs(ctx, serverID, userID)
}

func (s *Service) GetDashboardOverview(ctx context.Context, userID, timeRange string) (*DashboardOverview, error) {
	return s.repo.GetDashboardOverview(ctx, userID, timeRange)
}

// UpdateServerMeta updates group name and tags
func (s *Service) UpdateServerMeta(ctx context.Context, id, userID, groupName string, tags []string, provider, region, environment string) error {
	return s.repo.UpdateServerMeta(ctx, id, userID, groupName, tags, provider, region, environment)
}
