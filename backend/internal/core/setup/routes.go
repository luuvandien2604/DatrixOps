package setup

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"golang.org/x/time/rate"
)

func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config) {
	if cfg.Edition != "community" || cfg.DeploymentMode != "self-hosted" {
		return
	}

	handler := NewHandler(db, cfg)
	completeLimiter := middleware.NewRateLimiter(rate.Limit(0.2), 3)

	mux.HandleFunc("GET /api/v1/setup/status", handler.Status)
	mux.Handle("POST /api/v1/setup/complete", completeLimiter(http.HandlerFunc(handler.Complete)))
}
