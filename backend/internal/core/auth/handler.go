package auth

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	if req.Email == "" || len(req.Password) < 6 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Email is required and password must be at least 6 characters")
		return
	}

	user, err := h.svc.Register(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, ErrRegistrationClosed) {
			response.Error(w, http.StatusForbidden, "FORBIDDEN", "Registration is closed. A user already exists.")
			return
		}
		if errors.Is(err, ErrUserExists) {
			response.Error(w, http.StatusConflict, "CONFLICT", "User already exists")
			return
		}
		// Log the error internally here (if we had access to logger in handler, usually we do via middleware context, for now just return 500)
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Something went wrong")
		return
	}

	response.Success(w, http.StatusCreated, map[string]interface{}{
		"id":         user.ID,
		"email":      user.Email,
		"created_at": user.CreatedAt,
	})
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	res, err := h.svc.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid email or password")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Something went wrong")
		return
	}

	response.Success(w, http.StatusOK, res)
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	if req.RefreshToken == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Refresh token is required")
		return
	}

	res, err := h.svc.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		if errors.Is(err, ErrInvalidToken) {
			response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid or expired refresh token")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Something went wrong")
		return
	}

	response.Success(w, http.StatusOK, res)
}

type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	var req LogoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	if req.RefreshToken != "" {
		_ = h.svc.Logout(r.Context(), req.RefreshToken)
	}

	// Always return 200 OK for logout even if token was invalid/missing
	response.Success(w, http.StatusOK, nil)
}
