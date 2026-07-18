package terminal

import (
	"context"
	"encoding/json"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

type repository struct {
	db *database.DB
}

func newRepository(db *database.DB) *repository {
	return &repository{db: db}
}

func (r *repository) ownsServer(ctx context.Context, serverID, userID string) (bool, error) {
	var exists bool
	err := r.db.Pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM servers WHERE id = $1 AND user_id = $2)`,
		serverID, userID,
	).Scan(&exists)
	return exists, err
}

func (r *repository) serverIDForAgentToken(ctx context.Context, token string) (string, error) {
	var serverID string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT id FROM servers WHERE agent_token = $1`,
		token,
	).Scan(&serverID)
	return serverID, err
}

func (r *repository) createSession(ctx context.Context, serverID, userID, remoteAddress string) (string, error) {
	var sessionID string
	err := r.db.Pool.QueryRow(ctx,
		`INSERT INTO terminal_sessions (server_id, user_id, remote_address)
		 VALUES ($1, $2, $3) RETURNING id`,
		serverID, userID, remoteAddress,
	).Scan(&sessionID)
	return sessionID, err
}

func (r *repository) updateSize(ctx context.Context, sessionID string, cols, rows int) error {
	_, err := r.db.Pool.Exec(ctx,
		`UPDATE terminal_sessions SET cols = $2, rows = $3 WHERE id = $1`,
		sessionID, cols, rows,
	)
	return err
}

func (r *repository) closeSession(ctx context.Context, sessionID, status, reason string, bytesFromBrowser, bytesFromAgent int64) error {
	_, err := r.db.Pool.Exec(ctx,
		`UPDATE terminal_sessions
		 SET status = $2,
		     ended_at = NOW(),
		     close_reason = $3,
		     bytes_from_browser = $4,
		     bytes_from_agent = $5
		 WHERE id = $1 AND status = 'active'`,
		sessionID, status, reason, bytesFromBrowser, bytesFromAgent,
	)
	return err
}

func (r *repository) auditOpen(ctx context.Context, current *session) error {
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, 'OPEN_WEB_TERMINAL', 'SERVER', $2, $3::jsonb)`,
		current.userID, current.serverID, jsonDetails(map[string]any{"session_id": current.id}),
	)
	return err
}

func (r *repository) auditClose(ctx context.Context, current *session, status, reason string, bytesFromBrowser, bytesFromAgent int64) error {
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, 'CLOSE_WEB_TERMINAL', 'SERVER', $2, $3::jsonb)`,
		current.userID, current.serverID, jsonDetails(map[string]any{
			"session_id":         current.id,
			"status":             status,
			"reason":             reason,
			"duration_seconds":   int(time.Since(current.startedAt).Seconds()),
			"bytes_from_browser": bytesFromBrowser,
			"bytes_from_agent":   bytesFromAgent,
		}),
	)
	return err
}

func jsonDetails(value map[string]any) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}
