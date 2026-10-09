package systeminfo

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config, version, commit string) {
	handler := NewHandler(db, cfg, version, commit)
	auth := middleware.RequireAuth([]byte(cfg.JWTSecret), db)
	adminRole := middleware.RequireRole("admin")

	mux.Handle("GET /api/v1/system/info", auth(http.HandlerFunc(handler.Info)))
	mux.Handle("GET /api/v1/system/settings", auth(adminRole(http.HandlerFunc(handler.GetSettings))))
	mux.Handle("PUT /api/v1/system/settings", auth(adminRole(http.HandlerFunc(handler.UpdateSettings))))
	mux.Handle("POST /api/v1/system/settings/test-smtp", auth(adminRole(http.HandlerFunc(handler.TestSMTP))))
}
