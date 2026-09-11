package auditlog

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

// Record stores an operator-visible audit event. Details must never contain
// secrets such as API keys, webhook URLs, bot tokens, terminal output, or raw
// command output.
func Record(ctx context.Context, db *database.DB, userID, action, resourceType, resourceID string, details map[string]any) {
	if db == nil {
		return
	}
	detailsJSON, _ := json.Marshal(details)
	var uID *string
	if trimmed := strings.TrimSpace(userID); trimmed != "" {
		uID = &trimmed
	}
	_, _ = db.Pool.Exec(ctx,
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, $2, $3, $4, $5)`,
		uID, action, resourceType, resourceID, detailsJSON,
	)
}
