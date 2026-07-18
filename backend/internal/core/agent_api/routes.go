package agent_api

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

// RegisterRoutes sets up the HTTP routes for the agent to communicate with the core API.
func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config) {
	h := NewHandler(db, cfg.AgentVersion)

	mux.HandleFunc("POST /api/v1/agent/heartbeat", h.Heartbeat)
	mux.HandleFunc("POST /api/v1/agent/tasks/result", h.ReportTaskResult)
}
