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
	svc := NewService(repo)
	h := NewHandler(svc)

	authMiddleware := middleware.RequireAuth([]byte(cfg.JWTSecret))

	// Helper to wrap handler with auth middleware
	withAuth := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(http.HandlerFunc(handlerFunc)).ServeHTTP(w, r)
		}
	}

	mux.HandleFunc("GET /api/v1/servers", withAuth(h.List))
	mux.HandleFunc("GET /api/v1/servers/{id}", withAuth(h.Get))
	mux.HandleFunc("POST /api/v1/servers", withAuth(h.Create))
	mux.HandleFunc("GET /api/v1/servers/{id}/metrics", withAuth(h.ListMetrics))
	mux.HandleFunc("DELETE /api/v1/servers/{id}", withAuth(h.Delete))
}
