package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

type Service struct {
	repo                *Repository
	desiredAgentVersion string
}

func NewService(repo *Repository, desiredAgentVersion string) *Service {
	return &Service{repo: repo, desiredAgentVersion: strings.TrimSpace(desiredAgentVersion)}
}

// CreateServer generates an agent_token and creates the server.
func (s *Service) CreateServer(ctx context.Context, userID, name, ipAddress string) (*Server, error) {
	// Generate a secure random 32-byte (64 hex characters) token
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, fmt.Errorf("generate agent_token: %w", err)
	}
	agentToken := hex.EncodeToString(b)

	server, err := s.repo.Create(ctx, userID, name, ipAddress, agentToken)
	if err != nil {
		return nil, err
	}
	s.decorateAgentRelease(server)
	return server, nil
}

// ListServers returns all servers for the user.
func (s *Service) ListServers(ctx context.Context, userID string) ([]*Server, error) {
	servers, err := s.repo.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	for _, server := range servers {
		s.decorateAgentRelease(server)
	}
	return servers, nil
}

// DeleteServer deletes a server.
func (s *Service) DeleteServer(ctx context.Context, id, userID string) error {
	return s.repo.Delete(ctx, id, userID)
}

// GetServer returns a server.
func (s *Service) GetServer(ctx context.Context, id, userID string) (*Server, error) {
	server, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	s.decorateAgentRelease(server)
	return server, nil
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

func (s *Service) decorateAgentRelease(server *Server) {
	if server == nil || s.desiredAgentVersion == "" {
		return
	}
	server.LatestAgentVersion = s.desiredAgentVersion
	current := agentVersionFromOSInfo(server.OSInfo)
	server.UpdateAvailable = current != "" && compareVersions(current, s.desiredAgentVersion) < 0
}

func agentVersionFromOSInfo(raw *string) string {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return ""
	}
	var payload struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal([]byte(*raw), &payload); err != nil {
		return ""
	}
	return strings.TrimSpace(payload.Version)
}

func compareVersions(left, right string) int {
	leftParts := parseVersionParts(left)
	rightParts := parseVersionParts(right)
	length := len(leftParts)
	if len(rightParts) > length {
		length = len(rightParts)
	}
	for index := 0; index < length; index++ {
		var leftPart, rightPart int
		if index < len(leftParts) {
			leftPart = leftParts[index]
		}
		if index < len(rightParts) {
			rightPart = rightParts[index]
		}
		if leftPart > rightPart {
			return 1
		}
		if leftPart < rightPart {
			return -1
		}
	}
	return 0
}

func parseVersionParts(version string) []int {
	core := strings.Split(strings.TrimSpace(version), "-")[0]
	core = strings.Split(core, "+")[0]
	rawParts := strings.Split(core, ".")
	parts := make([]int, 0, len(rawParts))
	for _, rawPart := range rawParts {
		value, err := strconv.Atoi(rawPart)
		if err != nil {
			parts = append(parts, 0)
			continue
		}
		parts = append(parts, value)
	}
	return parts
}
