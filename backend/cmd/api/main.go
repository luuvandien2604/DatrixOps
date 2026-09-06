package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/core/admin"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/agent_api"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/alert"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/apikey"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/audit"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/auth"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/server"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/setup"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/systeminfo"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/terminal"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/webhook"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/website"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/logger"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
	"github.com/luuvandien2604/DatrixOps/backend/internal/scheduler"
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

	if envBool("DATRIXOPS_AUTO_MIGRATE") {
		log.Warn("DATRIXOPS_AUTO_MIGRATE is enabled; production deployments should run the migrate service instead")
		if err := db.AutoMigrate(context.Background(), log); err != nil {
			log.Error("failed to auto-migrate database", "error", err)
			os.Exit(1)
		}
	} else if err := db.VerifySchema(context.Background()); err != nil {
		log.Error("database schema verification failed", "error", err)
		os.Exit(1)
	}

	// --- Container ---
	c := &Container{
		DB:     db,
		Logger: log,
		Config: cfg,
	}

	// Ensure Host VPS Self-Monitoring credentials are synchronized with the database
	if err := server.SyncSelfHost(context.Background(), c.DB, log); err != nil {
		log.Warn("self-host startup synchronization skipped or pending setup", "error", err)
	}

	// --- Router ---
	mux := http.NewServeMux()

	// System endpoints (no auth required)
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /ready", handleReady(c))
	mux.HandleFunc("GET /health/live", handleHealth)
	mux.HandleFunc("GET /health/ready", handleReady(c))
	mux.HandleFunc("GET /api/v1/version", handleVersion)

	// --- Register Modules ---
	auth.RegisterRoutes(mux, c.DB, c.Config)
	setup.RegisterRoutes(mux, c.DB, c.Config)
	systeminfo.RegisterRoutes(mux, c.DB, c.Config, Version, Commit)
	server.RegisterRoutes(mux, c.DB, c.Config)
	agent_api.RegisterRoutes(mux, c.DB, c.Config)
	terminal.RegisterRoutes(mux, c.DB, c.Config)
	alert.RegisterRoutes(mux, c.DB, c.Config)
	website.RegisterRoutes(mux, c.DB, c.Config.JWTSecret)

	adminRepo := admin.NewRepository(c.DB)
	adminHandler := admin.NewHandler(adminRepo)
	admin.RegisterRoutes(mux, adminHandler, c.DB, []byte(c.Config.JWTSecret))

	auditRepo := audit.NewRepository(c.DB)
	auditHandler := audit.NewHandler(auditRepo)
	audit.RegisterRoutes(mux, auditHandler, c.DB, []byte(c.Config.JWTSecret))

	apiKeyRepo := apikey.NewRepository(c.DB)
	apiKeyHandler := apikey.NewHandler(apiKeyRepo)
	apikey.RegisterRoutes(mux, apiKeyHandler, c.DB, []byte(c.Config.JWTSecret))

	webhookRepo := webhook.NewRepository(c.DB)
	webhookHandler := webhook.NewHandler(webhookRepo)
	webhook.RegisterRoutes(mux, webhookHandler, c.DB, []byte(c.Config.JWTSecret))

	// --- Scheduler ---
	if envBool("DATRIXOPS_RUN_SCHEDULERS") {
		websiteRepo := website.NewRepository(c.DB)
		websiteJob := scheduler.NewWebsiteJob(websiteRepo, c.DB, log)
		websiteJob.Start()
		defer websiteJob.Stop()

		alertJob := scheduler.NewAlertJob(c.DB, log)
		alertJob.Start()
		defer alertJob.Stop()

		webhookRetryJob := scheduler.NewWebhookRetryJob(c.DB, log)
		webhookRetryJob.Start()
		defer webhookRetryJob.Stop()

		retentionJob := scheduler.NewRetentionJob(c.DB, log, cfg.MetricsRetentionDays, cfg.OperationalRetentionDays)
		retentionJob.Start()
		defer retentionJob.Stop()

	} else {
		log.Info("background schedulers disabled for this API process")
	}

	updateJob := scheduler.NewUpdateJob(cfg, log)
	updateJob.Start()
	defer updateJob.Stop()

	// --- Middleware ---
	var handler http.Handler = mux
	handler = middleware.BodyLimit(4 << 20)(handler)
	handler = middleware.CORS(cfg.AllowedOrigins)(handler)
	handler = middleware.Logger(log)(handler)

	// --- HTTP Server ---
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    64 << 10,
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

func envBool(key string) bool {
	switch os.Getenv(key) {
	case "1", "true", "TRUE", "yes", "YES", "on", "ON":
		return true
	default:
		return false
	}
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
		"go_version": runtime.Version(),
	})
}
