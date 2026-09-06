package setup

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/luuvandien2604/DatrixOps/backend/internal/core/server"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	db  *database.DB
	cfg *config.Config
}

var administratorUsernamePattern = regexp.MustCompile(`^[a-z][a-z0-9_.-]{2,31}$`)

type completeRequest struct {
	Username   string `json:"username"`
	Email      string `json:"email,omitempty"`
	Password   string `json:"password"`
	SystemName string `json:"system_name"`
	Timezone   string `json:"timezone"`
	PublicURL  string `json:"public_url"`
}

func NewHandler(db *database.DB, cfg *config.Config) *Handler {
	return &Handler{db: db, cfg: cfg}
}

func (h *Handler) Status(w http.ResponseWriter, r *http.Request) {
	var (
		userCount        int
		systemName       string
		timezone         string
		publicURL        string
		setupCompletedAt *time.Time
	)
	err := h.db.Pool.QueryRow(r.Context(),
		`SELECT
		    (SELECT COUNT(*) FROM users),
		    system_name,
		    timezone,
		    public_url,
		    setup_completed_at
		 FROM system_settings
		 WHERE id = 1`,
	).Scan(&userCount, &systemName, &timezone, &publicURL, &setupCompletedAt)
	if err != nil {
		response.Error(w, http.StatusServiceUnavailable, "SETUP_STATUS_UNAVAILABLE", "Unable to read setup status")
		return
	}

	configured := userCount > 0 || setupCompletedAt != nil
	if publicURL == "" {
		publicURL = h.cfg.PublicURL
	}
	w.Header().Set("Cache-Control", "no-store")
	response.Success(w, http.StatusOK, map[string]any{
		"configured":  configured,
		"database":    "connected",
		"system_name": systemName,
		"timezone":    timezone,
		"public_url":  publicURL,
	})
}

func (h *Handler) Complete(w http.ResponseWriter, r *http.Request) {
	providedToken := r.Header.Get("X-DatrixOps-Setup-Token")
	if !validSetupToken(h.cfg.SetupToken, providedToken) {
		response.Error(w, http.StatusUnauthorized, "INVALID_SETUP_TOKEN", "A valid local setup token is required")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	var req completeRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid setup request")
		return
	}

	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Username == "" && req.Email != "" {
		req.Username = strings.SplitN(req.Email, "@", 2)[0]
	}
	req.SystemName = strings.TrimSpace(req.SystemName)
	req.Timezone = strings.TrimSpace(req.Timezone)
	req.PublicURL = strings.TrimRight(strings.TrimSpace(req.PublicURL), "/")
	if message := validateCompleteRequest(req, h.cfg); message != "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", message)
		return
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to secure administrator password")
		return
	}

	tx, err := h.db.Pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to start setup")
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(48293017)`); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to lock setup")
		return
	}

	var userCount int
	if err := tx.QueryRow(r.Context(), `SELECT COUNT(*) FROM users`).Scan(&userCount); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to verify setup state")
		return
	}
	if userCount != 0 {
		response.Error(w, http.StatusConflict, "SETUP_ALREADY_COMPLETED", "Initial setup has already been completed")
		return
	}

	var userID string
	internalEmail := req.Email
	if internalEmail == "" {
		internalEmail = req.Username + "@datrixops.local"
	}
	err = tx.QueryRow(r.Context(),
		`INSERT INTO users (username, email, password_hash, role)
		 VALUES ($1, $2, $3, 'superadmin')
		 RETURNING id`,
		req.Username, internalEmail, string(passwordHash),
	).Scan(&userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to create administrator")
		return
	}

	_, err = tx.Exec(r.Context(),
		`UPDATE system_settings
		 SET system_name = $1,
		     timezone = $2,
		     public_url = $3,
		     registration_enabled = FALSE,
		     setup_completed_at = NOW(),
		     updated_at = NOW()
		 WHERE id = 1`,
		req.SystemName, req.Timezone, req.PublicURL,
	)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to save system settings")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		response.Error(w, http.StatusConflict, "SETUP_CONFLICT", "Setup was completed by another request")
		return
	}

	// Auto-claim and register host self-monitoring agent for superadmin
	h.ensureSelfHostRegistration(r.Context(), userID, req.PublicURL)

	w.Header().Set("Cache-Control", "no-store")
	response.Success(w, http.StatusCreated, map[string]string{
		"status":  "configured",
		"user_id": userID,
	})
}

func validSetupToken(expected, provided string) bool {
	return len(expected) >= 32 && subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}

func (h *Handler) ensureSelfHostRegistration(ctx context.Context, userID, publicURL string) {
	// 1. Synchronize host VPS credential from /etc/datrixops/self-monitor.env into DB
	if err := server.SyncSelfHost(ctx, h.db, nil); err == nil {
		return
	}

	// 2. Fallback: bind the administrative user ID to existing self-host records without
	// modifying agent_token_hash so credential drift never occurs.
	_, _ = h.db.Pool.Exec(ctx,
		`UPDATE servers 
		 SET user_id = $1, updated_at = NOW() 
		 WHERE (tags ? 'self-host' OR tags ? 'control-plane' OR name ILIKE '%Control Plane%')
		   AND (user_id IS NULL OR user_id != $1)`,
		userID,
	)
}

func validateCompleteRequest(req completeRequest, cfg *config.Config) string {
	if !administratorUsernamePattern.MatchString(req.Username) {
		return "Administrator username must contain 3 to 32 lowercase letters, numbers, dots, underscores or hyphens"
	}
	if len(req.Password) < 12 {
		return "Administrator password must be at least 12 characters"
	}
	if len(req.Password) > 128 {
		return "Administrator password must not exceed 128 characters"
	}
	if req.SystemName == "" || len(req.SystemName) > 120 {
		return "System name is required and must not exceed 120 characters"
	}
	if req.Timezone == "" {
		return "Timezone is required"
	}
	if _, err := time.LoadLocation(req.Timezone); err != nil {
		return "Timezone must be a valid IANA timezone"
	}
	edition := "community"
	deploymentMode := "self-hosted"
	if cfg != nil {
		edition = cfg.Edition
		deploymentMode = cfg.DeploymentMode
	}
	if err := config.ValidatePublicURL(req.PublicURL, edition, deploymentMode); err != nil {
		return strings.Replace(err.Error(), "PUBLIC_URL", "Public URL", 1)
	}
	return ""
}
