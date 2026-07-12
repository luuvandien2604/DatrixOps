package auth

import (
	"log/slog"
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
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

	mux.HandleFunc("POST /api/v1/auth/register", h.Register)
	mux.HandleFunc("POST /api/v1/auth/login", h.Login)
	mux.HandleFunc("POST /api/v1/auth/refresh", h.Refresh)
	mux.HandleFunc("POST /api/v1/auth/logout", h.Logout)
}
