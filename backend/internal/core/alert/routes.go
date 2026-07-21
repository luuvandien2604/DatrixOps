package alert

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

// RegisterRoutes đăng ký toàn bộ API quản lý alert rules và notification channels.
func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config) {
	repo := NewRepository(db)
	handler := NewHandler(repo)

	authMiddleware := middleware.RequireAuth([]byte(cfg.JWTSecret), db)
	withAuth := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(http.HandlerFunc(handlerFunc)).ServeHTTP(w, r)
		}
	}

	mux.HandleFunc("GET /api/v1/alerts/rules", withAuth(handler.ListRules))
	mux.HandleFunc("POST /api/v1/alerts/rules", withAuth(handler.CreateRule))
	mux.HandleFunc("DELETE /api/v1/alerts/rules/{id}", withAuth(handler.DeleteRule))

	mux.HandleFunc("GET /api/v1/alerts/channels", withAuth(handler.ListChannels))
	mux.HandleFunc("POST /api/v1/alerts/channels", withAuth(handler.CreateChannel))
	mux.HandleFunc("DELETE /api/v1/alerts/channels/{id}", withAuth(handler.DeleteChannel))
}
