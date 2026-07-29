package apikey

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/auditlog"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) ListKeys(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	keys, err := h.repo.ListKeys(r.Context(), userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list api keys")
		return
	}

	response.Success(w, http.StatusOK, keys)
}

type CreateKeyRequest struct {
	Name string `json:"name"`
}

func (h *Handler) CreateKey(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	var req CreateKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	// Generate a 32-byte secure random key
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to generate key")
		return
	}
	rawKey := "dtx_" + hex.EncodeToString(b)

	// Hash it
	hash := sha256.Sum256([]byte(rawKey))
	keyHash := hex.EncodeToString(hash[:])

	k, err := h.repo.CreateKey(r.Context(), userID, req.Name, keyHash)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create api key")
		return
	}

	k.RawKey = rawKey // Only return the raw key once

	auditlog.Record(r.Context(), h.repo.db, userID, "CREATE_API_KEY", "API_KEY", k.ID, map[string]any{
		"name": k.Name,
	})
	response.Success(w, http.StatusCreated, k)
}

func (h *Handler) DeleteKey(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}

	id := r.PathValue("id")
	if err := h.repo.DeleteKey(r.Context(), id, userID); err != nil {
		if errors.Is(err, ErrAPIKeyNotFound) {
			response.Error(w, http.StatusNotFound, "API_KEY_NOT_FOUND", "API key not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to delete api key")
		return
	}

	auditlog.Record(r.Context(), h.repo.db, userID, "DELETE_API_KEY", "API_KEY", id, nil)
	response.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}
