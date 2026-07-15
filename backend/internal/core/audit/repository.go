package audit

import (
	"context"
	"encoding/json"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

type Repository struct {
	db *database.DB
}

func NewRepository(db *database.DB) *Repository {
	return &Repository{db: db}
}

type AuditLog struct {
	ID           string                 `json:"id"`
	UserID       string                 `json:"user_id"`
	Action       string                 `json:"action"`
	ResourceType string                 `json:"resource_type"`
	ResourceID   string                 `json:"resource_id"`
	Details      map[string]interface{} `json:"details"`
	CreatedAt    time.Time              `json:"created_at"`
}

func (r *Repository) Log(ctx context.Context, userID, action, resourceType, resourceID string, details map[string]interface{}) error {
	var detailsBytes []byte
	if details != nil {
		detailsBytes, _ = json.Marshal(details)
	}

	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details) VALUES ($1, $2, $3, $4, $5)`,
		userID, action, resourceType, resourceID, detailsBytes,
	)
	return err
}

func (r *Repository) ListLogs(ctx context.Context, userID string) ([]AuditLog, error) {
	rows, err := r.db.Pool.Query(ctx, 
		`SELECT id, user_id, action, resource_type, resource_id, details, created_at 
		 FROM audit_logs 
		 WHERE user_id = $1 
		 ORDER BY created_at DESC LIMIT 100`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []AuditLog
	for rows.Next() {
		var log AuditLog
		var detailsBytes []byte
		if err := rows.Scan(&log.ID, &log.UserID, &log.Action, &log.ResourceType, &log.ResourceID, &detailsBytes, &log.CreatedAt); err != nil {
			return nil, err
		}
		if len(detailsBytes) > 0 {
			_ = json.Unmarshal(detailsBytes, &log.Details)
		}
		logs = append(logs, log)
	}
	
	if logs == nil {
		logs = make([]AuditLog, 0)
	}
	
	return logs, nil
}
