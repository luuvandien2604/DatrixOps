package auditlog

import (
	"context"
	"encoding/json"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

// Record stores an operator-visible audit event. Details must never contain
// secrets such as API keys, webhook URLs, bot tokens, terminal output, or raw
// command output.
func Record(ctx context.Context, db *database.DB, userID, action, resourceType, resourceID string, details map[string]any) {
	detailsJSON, _ := json.Marshal(details)
	_, _ = db.Pool.Exec(ctx,
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, $2, $3, $4, $5)`,
		userID, action, resourceType, resourceID, detailsJSON,
	)
}
