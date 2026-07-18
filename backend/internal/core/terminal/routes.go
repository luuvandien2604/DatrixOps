package terminal

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config) {
	hub := NewHub(newRepository(db))
	authMiddleware := middleware.RequireAuth([]byte(cfg.JWTSecret), db)
	withAuth := func(handler http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(handler).ServeHTTP(w, r)
		}
	}

	mux.HandleFunc("POST /api/v1/servers/{id}/terminal/tickets", withAuth(hub.CreateTicket))
	mux.HandleFunc("GET /api/v1/terminal/browser", hub.BrowserSocket)
	mux.HandleFunc("GET /api/v1/agent/terminal", hub.AgentSocket)
}
