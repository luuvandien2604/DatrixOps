package setup

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	db  *database.DB
	cfg *config.Config
}

type completeRequest struct {
	Email      string `json:"email"`
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
	r.Body = http.MaxBytesReader(w, r.Body, 32<<10)
	var req completeRequest
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid setup request")
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.SystemName = strings.TrimSpace(req.SystemName)
	req.Timezone = strings.TrimSpace(req.Timezone)
	req.PublicURL = strings.TrimRight(strings.TrimSpace(req.PublicURL), "/")
	if message := validateCompleteRequest(req); message != "" {
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
	err = tx.QueryRow(r.Context(),
		`INSERT INTO users (email, password_hash, role)
		 VALUES ($1, $2, 'superadmin')
		 RETURNING id`,
		req.Email, string(passwordHash),
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

func (h *Handler) ensureSelfHostRegistration(ctx context.Context, userID, publicURL string) {
	var token string
	envContent, err := os.ReadFile("/etc/datrixops/agent.env")
	if err == nil {
		lines := strings.Split(string(envContent), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "DATRIXOPS_AGENT_TOKEN=") {
				token = strings.TrimSpace(strings.TrimPrefix(line, "DATRIXOPS_AGENT_TOKEN="))
				break
			}
		}
	}

	if token == "" {
		buffer := make([]byte, 32)
		if _, err := rand.Read(buffer); err == nil {
			token = base64.RawURLEncoding.EncodeToString(buffer)
			_ = os.MkdirAll("/etc/datrixops", 0700)
			pub := strings.TrimRight(strings.TrimSpace(publicURL), "/")
			if pub != "" {
				envBody := fmt.Sprintf("DATRIXOPS_SERVER_URL=%s/api/v1\nDATRIXOPS_AGENT_TOKEN=%s\n", pub, token)
				_ = os.WriteFile("/etc/datrixops/agent.env", []byte(envBody), 0600)
			}
		}
	}

	if token == "" {
		return
	}

	sum := sha256.Sum256([]byte(token))
	credentialHash := hex.EncodeToString(sum[:])

	var existingID string
	err = h.db.Pool.QueryRow(ctx,
		`SELECT id FROM servers WHERE tags @> '"self-host"'::jsonb OR name LIKE '%Control Plane%' LIMIT 1`,
	).Scan(&existingID)

	if err != nil {
		_, _ = h.db.Pool.Exec(ctx,
			`INSERT INTO servers (user_id, name, ip_address, status, agent_token_hash, enrolled_at, tags)
			 VALUES ($1, 'DatrixOps Control Plane (Self-Host)', '127.0.0.1', 'offline', $2, NOW(), '["self-host", "control-plane"]'::jsonb)`,
			userID, credentialHash,
		)
	} else {
		_, _ = h.db.Pool.Exec(ctx,
			`UPDATE servers
			 SET user_id = $1, agent_token_hash = $2, enrolled_at = COALESCE(enrolled_at, NOW()), updated_at = NOW()
			 WHERE id = $3`,
			userID, credentialHash, existingID,
		)
	}
}

func validateCompleteRequest(req completeRequest) string {
	address, err := mail.ParseAddress(req.Email)
	if err != nil || !strings.EqualFold(address.Address, req.Email) {
		return "A valid administrator email is required"
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
	parsed, err := url.Parse(req.PublicURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "Public URL must be an absolute HTTP or HTTPS URL"
	}
	if parsed.Scheme != "https" && parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1" {
		return "Public URL must use HTTPS outside localhost"
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "Public URL must not contain credentials, a query, or a fragment"
	}
	return ""
}
