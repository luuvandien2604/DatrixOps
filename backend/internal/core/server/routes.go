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
	svc := NewService(repo, cfg.AgentVersion)
	h := NewHandler(svc)

	authMiddleware := middleware.RequireAuth([]byte(cfg.JWTSecret), db)

	// Helper to wrap handler with auth middleware
	withAuth := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(http.HandlerFunc(handlerFunc)).ServeHTTP(w, r)
		}
	}

	mux.HandleFunc("GET /api/v1/servers", withAuth(h.List))
	mux.HandleFunc("GET /api/v1/dashboard/overview", withAuth(h.DashboardOverview))
	mux.HandleFunc("GET /api/v1/servers/{id}", withAuth(h.Get))
	mux.HandleFunc("POST /api/v1/servers", withAuth(h.Create))
	mux.HandleFunc("GET /api/v1/servers/{id}/metrics", withAuth(h.ListMetrics))
	mux.HandleFunc("GET /api/v1/servers/{id}/cron-jobs", withAuth(h.ListCronJobs))
	mux.HandleFunc("POST /api/v1/servers/actions/update-agents", withAuth(h.UpdateAllAgents))
	mux.HandleFunc("POST /api/v1/servers/{id}/tasks", withAuth(h.CreateTask))
	mux.HandleFunc("GET /api/v1/servers/{id}/tasks/{taskId}", withAuth(h.GetTask))
	mux.HandleFunc("DELETE /api/v1/servers/{id}", withAuth(h.Delete))
	mux.HandleFunc("PUT /api/v1/servers/{id}/meta", withAuth(h.UpdateMeta))
}
