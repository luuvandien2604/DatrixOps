package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

var (
	// ErrServerNotFound means the server does not exist or is not owned by the
	// authenticated user.
	ErrServerNotFound = errors.New("server not found")

	// ErrAgentOffline means remote uninstall cannot be delivered safely because
	// the Agent has not sent a recent heartbeat.
	ErrAgentOffline = errors.New("agent is offline")

	// ErrUnsupportedAgentOS means the current release supports detached remote
	// uninstall only for Linux Agents.
	ErrUnsupportedAgentOS = errors.New("remote uninstall is supported only for Linux agents")

	// ErrAgentUninstallUnsupported means the Agent is Linux but is too old or
	// lacks the systemd capability required for detached uninstall.
	ErrAgentUninstallUnsupported = errors.New("agent does not support remote uninstall")

	// ErrDeletionInProgress prevents duplicate destructive tasks for one server.
	ErrDeletionInProgress = errors.New("server deletion is already in progress")
)

type Service struct {
	repo                *Repository
	desiredAgentVersion string
}

// AgentUninstallRequestResult is returned after a remote uninstall task has
// been queued successfully.
type AgentUninstallRequestResult struct {
	ServerID      string `json:"id"`
	TaskID        string `json:"task_id"`
	DeletionState string `json:"deletion_status"`
	Message       string `json:"message"`
}

// NewService constructs the server domain service.
func NewService(repo *Repository, desiredAgentVersion string) *Service {
	return &Service{repo: repo, desiredAgentVersion: strings.TrimSpace(desiredAgentVersion)}
}

// CreateServer generates a cryptographically secure Agent token and creates a
// user-owned server record.
func (s *Service) CreateServer(ctx context.Context, userID, name, ipAddress string) (*Server, error) {
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

// ListServers returns all servers for a user and decorates each record with the
// currently published Agent version.
func (s *Service) ListServers(ctx context.Context, userID string) ([]*Server, error) {
	if err := s.repo.ExpireStaleAgentUninstalls(ctx, userID); err != nil {
		return nil, err
	}
	servers, err := s.repo.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	for _, server := range servers {
		s.decorateAgentRelease(server)
	}
	return servers, nil
}

// RequestAgentUninstall creates a one-time confirmation token and queues the
// destructive agent_uninstall task. The server record remains in the database
// until the detached helper confirms that cleanup finished.
func (s *Service) RequestAgentUninstall(
	ctx context.Context,
	id string,
	userID string,
	confirmURL string,
) (*AgentUninstallRequestResult, error) {
	rawToken, tokenHash, err := generateOneTimeToken()
	if err != nil {
		return nil, err
	}

	payloadBytes, err := json.Marshal(map[string]string{
		"server_id":     id,
		"confirm_url":   confirmURL,
		"confirm_token": rawToken,
	})
	if err != nil {
		return nil, fmt.Errorf("encode uninstall task payload: %w", err)
	}

	taskID, err := s.repo.RequestAgentUninstall(
		ctx,
		id,
		userID,
		string(payloadBytes),
		tokenHash,
	)
	if err != nil {
		return nil, err
	}

	return &AgentUninstallRequestResult{
		ServerID:      id,
		TaskID:        taskID,
		DeletionState: "pending",
		Message:       "Agent uninstall queued; the server will be deleted after confirmation.",
	}, nil
}

// ForceDeleteServer permanently removes the database record without contacting
// the Agent. This is the recovery path for destroyed/offline machines.
func (s *Service) ForceDeleteServer(ctx context.Context, id, userID string) error {
	return s.repo.Delete(ctx, id, userID)
}

// GetServer returns one user-owned server and decorates its Agent version state.
func (s *Service) GetServer(ctx context.Context, id, userID string) (*Server, error) {
	if err := s.repo.ExpireStaleAgentUninstalls(ctx, userID); err != nil {
		return nil, err
	}
	server, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	s.decorateAgentRelease(server)
	return server, nil
}

// ListMetrics returns historical metrics for one user-owned server.
func (s *Service) ListMetrics(ctx context.Context, serverID, userID, timeRange string) ([]*ServerMetric, error) {
	return s.repo.ListMetrics(ctx, serverID, userID, timeRange)
}

// ListCronJobs returns Agent-discovered cron jobs for one server.
func (s *Service) ListCronJobs(ctx context.Context, serverID, userID string) ([]CronJob, error) {
	return s.repo.ListCronJobs(ctx, serverID, userID)
}

// GetDashboardOverview returns the aggregated dashboard payload.
func (s *Service) GetDashboardOverview(ctx context.Context, userID, timeRange string) (*DashboardOverview, error) {
	return s.repo.GetDashboardOverview(ctx, userID, timeRange)
}

// UpdateServerMeta changes grouping and inventory metadata maintained by the
// user rather than the Agent heartbeat.
func (s *Service) UpdateServerMeta(ctx context.Context, id, userID, groupName string, tags []string, provider, region, environment string) error {
	return s.repo.UpdateServerMeta(ctx, id, userID, groupName, tags, provider, region, environment)
}

// SetAgentAutoUpdate enables or disables automatic signed Agent updates.
func (s *Service) SetAgentAutoUpdate(ctx context.Context, id, userID string, enabled bool) error {
	return s.repo.SetAgentAutoUpdate(ctx, id, userID, enabled)
}

// decorateAgentRelease adds latest_agent_version and update_available without
// persisting derived release information in the database.
func (s *Service) decorateAgentRelease(server *Server) {
	if server == nil || s.desiredAgentVersion == "" {
		return
	}
	server.LatestAgentVersion = s.desiredAgentVersion
	current := agentVersionFromOSInfo(server.OSInfo)
	server.UpdateAvailable = current != "" && compareVersions(current, s.desiredAgentVersion) < 0
}

// generateOneTimeToken returns a URL-safe raw token and its SHA-256 hash. Only
// the hash is stored in PostgreSQL; the raw token is delivered once to Agent.
func generateOneTimeToken() (rawToken string, tokenHash string, err error) {
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		return "", "", fmt.Errorf("generate uninstall confirmation token: %w", err)
	}
	rawToken = base64.RawURLEncoding.EncodeToString(buffer)
	sum := sha256.Sum256([]byte(rawToken))
	return rawToken, hex.EncodeToString(sum[:]), nil
}

// agentVersionFromOSInfo extracts the running Agent version from heartbeat JSON.
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

// compareVersions compares numeric semantic-version components and ignores
// prerelease/build metadata for the existing update UI behavior.
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

// parseVersionParts converts a semantic-version core into integer components.
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
