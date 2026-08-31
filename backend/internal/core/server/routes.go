package server

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

// RegisterRoutes sets up the HTTP routes for the server module.
func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config) {
	repo := NewRepository(db)
	svc := NewService(repo, cfg.AgentVersion, cfg.PublicURL, cfg.AgentReleaseURL, cfg.AgentReleaseLayout)
	h := NewHandler(svc, cfg.EnableRemoteScripts, cfg.EnableServiceControls, cfg.EnableReadOnlyLogs)

	authMiddleware := middleware.RequireAuth([]byte(cfg.JWTSecret), db)

	// Helper to wrap handler with auth middleware
	withAuth := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(http.HandlerFunc(handlerFunc)).ServeHTTP(w, r)
		}
	}
	withRoles := func(handlerFunc http.HandlerFunc, roles ...string) http.HandlerFunc {
		roleMiddleware := middleware.RequireRole(roles...)
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(roleMiddleware(http.HandlerFunc(handlerFunc))).ServeHTTP(w, r)
		}
	}

	mux.HandleFunc("GET /api/v1/servers", withAuth(h.List))
	mux.HandleFunc("GET /api/v1/dashboard/overview", withAuth(h.DashboardOverview))
	mux.HandleFunc("GET /api/v1/servers/{id}", withAuth(h.Get))
	mux.HandleFunc("POST /api/v1/servers", withRoles(h.Create, "admin"))
	mux.HandleFunc("GET /api/v1/servers/{id}/metrics", withAuth(h.ListMetrics))
	mux.HandleFunc("GET /api/v1/servers/{id}/cron-jobs", withAuth(h.ListCronJobs))
	mux.HandleFunc("GET /api/v1/servers/{id}/scripts", withRoles(h.ListScripts, "admin", "operator"))
	mux.HandleFunc("POST /api/v1/servers/actions/update-agents", withRoles(h.UpdateAllAgents, "admin"))
	mux.HandleFunc("POST /api/v1/servers/{id}/tasks", withRoles(h.CreateTask, "admin", "operator"))
	mux.HandleFunc("GET /api/v1/servers/{id}/tasks/{taskId}", withAuth(h.GetTask))
	mux.HandleFunc("DELETE /api/v1/servers/{id}/tasks/{taskId}", withRoles(h.CancelTask, "admin", "operator"))
	mux.HandleFunc("POST /api/v1/servers/{id}/tasks/cancel-update", withRoles(h.CancelTask, "admin", "operator"))
	mux.HandleFunc("DELETE /api/v1/servers/{id}", withRoles(h.Delete, "admin"))
	mux.HandleFunc("PUT /api/v1/servers/{id}/meta", withRoles(h.UpdateMeta, "admin"))
	mux.HandleFunc("PUT /api/v1/servers/{id}/agent-update-policy", withRoles(h.UpdateAgentUpdatePolicy, "admin"))
}
