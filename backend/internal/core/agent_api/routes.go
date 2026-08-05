package agent_api

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"golang.org/x/time/rate"
)

// RegisterRoutes sets up the HTTP routes for the agent to communicate with the core API.
func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config) {
	h := NewHandler(db, cfg.AgentVersion, cfg.AgentReleaseURL)
	enrollmentLimiter := middleware.NewRateLimiter(rate.Limit(1), 5)

	mux.Handle("POST /api/v1/agent/enroll", enrollmentLimiter(http.HandlerFunc(h.Enroll)))
	mux.Handle("POST /api/v1/agent/enroll/rollback", enrollmentLimiter(http.HandlerFunc(h.EnrollRollback)))
	mux.HandleFunc("GET /api/v1/agent/bootstrap-status", h.GetBootstrapStatus)
	mux.HandleFunc("POST /api/v1/agent/heartbeat", h.Heartbeat)
	mux.HandleFunc("POST /api/v1/agent/cron/executions", h.ReportCronExecution)
	mux.HandleFunc("POST /api/v1/agent/tasks/result", h.ReportTaskResult)
	mux.HandleFunc("POST /api/v1/agent/uninstall/confirm", h.ConfirmUninstall)
}
