package alert

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config) {
	repo := NewRepository(db)
	h := NewHandler(repo)

	authMiddleware := middleware.RequireAuth([]byte(cfg.JWTSecret), db)

	withAuth := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(http.HandlerFunc(handlerFunc)).ServeHTTP(w, r)
		}
	}

	mux.HandleFunc("GET /api/v1/alerts/rules", withAuth(h.ListRules))
	mux.HandleFunc("POST /api/v1/alerts/rules", withAuth(h.CreateRule))
	mux.HandleFunc("DELETE /api/v1/alerts/rules/{id}", withAuth(h.DeleteRule))

	mux.HandleFunc("GET /api/v1/alerts/channels", withAuth(h.ListChannels))
	mux.HandleFunc("POST /api/v1/alerts/channels", withAuth(h.CreateChannel))
	mux.HandleFunc("DELETE /api/v1/alerts/channels/{id}", withAuth(h.DeleteChannel))
}
