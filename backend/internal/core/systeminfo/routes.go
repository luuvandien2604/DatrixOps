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
	mux.Handle("GET /api/v1/system/info", auth(http.HandlerFunc(handler.Info)))
}
