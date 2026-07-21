package alert

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

// RegisterRoutes đăng ký API quản lý alert rules, channels và dashboard notifications.
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

	mux.HandleFunc("GET /api/v1/alerts/notifications", withAuth(handler.ListNotifications))
	mux.HandleFunc("PATCH /api/v1/alerts/notifications/{id}/read", withAuth(handler.MarkNotificationRead))
	mux.HandleFunc("POST /api/v1/alerts/notifications/read-all", withAuth(handler.MarkAllNotificationsRead))
}
