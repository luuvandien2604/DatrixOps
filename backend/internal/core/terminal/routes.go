package terminal

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config) {
	authMiddleware := middleware.RequireAuth([]byte(cfg.JWTSecret), db)
	withAuth := func(handler http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(handler).ServeHTTP(w, r)
		}
	}
	withOperator := func(handler http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(middleware.RequireRole("admin", "operator")(handler)).ServeHTTP(w, r)
		}
	}

	if !cfg.EnableWebTerminal {
		disabled := func(w http.ResponseWriter, _ *http.Request) {
			response.Error(w, http.StatusForbidden, "FEATURE_DISABLED", "Web Terminal is disabled by the system administrator")
		}
		mux.HandleFunc("POST /api/v1/servers/{id}/terminal/tickets", withAuth(disabled))
		mux.HandleFunc("GET /api/v1/terminal/browser", disabled)
		mux.HandleFunc("GET /api/v1/agent/terminal", disabled)
		return
	}

	hub := NewHub(newRepository(db))
	mux.HandleFunc("POST /api/v1/servers/{id}/terminal/tickets", withOperator(hub.CreateTicket))
	mux.HandleFunc("GET /api/v1/terminal/browser", hub.BrowserSocket)
	mux.HandleFunc("GET /api/v1/agent/terminal", hub.AgentSocket)
}
