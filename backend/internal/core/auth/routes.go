package auth

import (
	"log/slog"
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
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

	// Login is deliberately tighter because each bcrypt comparison is costly.
	loginLimiter := middleware.NewRateLimiter(rate.Limit(1), 5)
	tokenLimiter := middleware.NewRateLimiter(rate.Limit(10), 20)

	mux.HandleFunc("POST /api/v1/auth/register", func(w http.ResponseWriter, _ *http.Request) {
		response.Error(w, http.StatusForbidden, "REGISTRATION_DISABLED", "Public registration is disabled. Use the initial setup wizard or an administrator-managed account.")
	})
	mux.Handle("POST /api/v1/auth/login", loginLimiter(http.HandlerFunc(h.Login)))
	mux.Handle("POST /api/v1/auth/refresh", tokenLimiter(http.HandlerFunc(h.Refresh)))
	mux.Handle("POST /api/v1/auth/logout", tokenLimiter(http.HandlerFunc(h.Logout)))
	mux.Handle("GET /api/v1/auth/me", middleware.RequireAuth([]byte(cfg.JWTSecret), db)(http.HandlerFunc(h.Me)))
}
