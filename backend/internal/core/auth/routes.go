package auth

import (
	"log/slog"
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"golang.org/x/time/rate"
)

// Container interface provides the required dependencies for the auth module.
// We use a small interface here instead of importing the main package to avoid circular dependencies.
type Container interface {
	GetDB() *database.DB
	GetConfig() *config.Config
	GetLogger() *slog.Logger
}

// RegisterRoutes sets up the HTTP routes for the auth module.
func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config) {
	repo := NewRepository(db)
	svc := NewService(repo, cfg.JWTSecret)
	h := NewHandler(svc)

	// Rate limit: 5 requests per second, burst 10
	rl := middleware.NewRateLimiter(rate.Limit(5), 10)

	mux.Handle("POST /api/v1/auth/register", rl(http.HandlerFunc(h.Register)))
	mux.Handle("POST /api/v1/auth/login", rl(http.HandlerFunc(h.Login)))
	mux.HandleFunc("POST /api/v1/auth/refresh", h.Refresh)
	mux.HandleFunc("POST /api/v1/auth/logout", h.Logout)
}
