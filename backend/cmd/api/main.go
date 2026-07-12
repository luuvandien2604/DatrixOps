package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/logger"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

// Build-time variables (injected via -ldflags)
var (
	Version   = "dev"
	Commit    = "none"
	BuildTime = "unknown"
)

// Container holds all shared dependencies.
// Passed to modules during route registration.
type Container struct {
	DB     *database.DB
	Logger *slog.Logger
	Config *config.Config
}

func main() {
	// --- Logger ---
	log := logger.New()

	// --- Config ---
	cfg, err := config.Load()
	if err != nil {
		log.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	// --- Database ---
	db, err := database.Connect(context.Background(), cfg.DatabaseURL, log)
	if err != nil {
		log.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	// --- Container ---
	c := &Container{
		DB:     db,
		Logger: log,
		Config: cfg,
	}

	// --- Router ---
	mux := http.NewServeMux()

	// System endpoints (no auth required)
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /ready", handleReady(c))
	mux.HandleFunc("GET /api/v1/version", handleVersion)

	// TODO: Register module routes here
	// auth.RegisterRoutes(mux, c)
	// server.RegisterRoutes(mux, c)

	// --- Middleware ---
	var handler http.Handler = mux
	handler = middleware.CORS(handler)
	handler = middleware.Logger(log)(handler)

	// --- HTTP Server ---
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// --- Graceful Shutdown ---
	go func() {
		log.Info("server starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info("server shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Error("server forced to shutdown", "error", err)
	}

	log.Info("server stopped")
}

// --- System Handlers ---

func handleHealth(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleReady(c *Container) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := c.DB.Ping(r.Context()); err != nil {
			response.JSON(w, http.StatusServiceUnavailable, map[string]string{
				"status":   "not ready",
				"database": "disconnected",
			})
			return
		}
		response.JSON(w, http.StatusOK, map[string]string{
			"status":   "ready",
			"database": "connected",
		})
	}
}

func handleVersion(w http.ResponseWriter, r *http.Request) {
	response.Success(w, http.StatusOK, map[string]string{
		"version":    Version,
		"commit":     Commit,
		"build_time": BuildTime,
		"go_version": "go1.22",
	})
}
