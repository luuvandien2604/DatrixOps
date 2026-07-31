package admin

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	repo *Repository
}

func (h *Handler) ListFleetServers(w http.ResponseWriter, r *http.Request) {
	servers, err := h.repo.ListFleetServers(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list fleet servers")
		return
	}
	response.Success(w, http.StatusOK, servers)
}

func (h *Handler) QueueFleetTask(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Type string `json:"type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}
	allowed := request.Type == "agent_update" || request.Type == "agent_restart" || request.Type == "vps_reboot"
	if !allowed {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Unsupported fleet task type")
		return
	}
	userID, _ := r.Context().Value(middleware.UserIDKey).(string)
	taskID, err := h.repo.QueueFleetTask(r.Context(), r.PathValue("id"), userID, request.Type)
	if err != nil {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		return
	}
	_, _ = h.repo.db.Pool.Exec(r.Context(),
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, 'QUEUE_FLEET_TASK', 'SERVER', $2, jsonb_build_object('task_id', $3, 'type', $4))`,
		userID, r.PathValue("id"), taskID, request.Type)
	response.Success(w, http.StatusCreated, map[string]string{"id": taskID, "status": "pending"})
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.repo.ListUsers(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list users")
		return
	}
	response.Success(w, http.StatusOK, users)
}

type CreateUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

func (h *Handler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Role = strings.TrimSpace(strings.ToLower(req.Role))

	if req.Email == "" || !strings.Contains(req.Email, "@") {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Valid email address is required")
		return
	}
	if len(req.Password) < 6 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Password must be at least 6 characters")
		return
	}
	if req.Role != "admin" && req.Role != "operator" && req.Role != "viewer" {
		req.Role = "operator"
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to hash password")
		return
	}

	user, err := h.repo.CreateUser(r.Context(), req.Email, string(hash), req.Role)
	if err != nil {
		response.Error(w, http.StatusConflict, "CONFLICT", "User with this email already exists")
		return
	}

	userID, _ := r.Context().Value(middleware.UserIDKey).(string)
	_, _ = h.repo.db.Pool.Exec(r.Context(),
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, 'CREATE_USER', 'USER', $2, jsonb_build_object('email', $3, 'role', $4))`,
		userID, user.ID, user.Email, user.Role)

	response.Success(w, http.StatusCreated, user)
}

type UpdateRoleRequest struct {
	Role string `json:"role"`
}

func (h *Handler) UpdateUserRole(w http.ResponseWriter, r *http.Request) {
	targetID := r.PathValue("id")
	if targetID == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "User ID is required")
		return
	}

	var req UpdateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	role := strings.TrimSpace(strings.ToLower(req.Role))
	if role != "admin" && role != "operator" && role != "viewer" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Role must be 'admin', 'operator', or 'viewer'")
		return
	}

	if err := h.repo.UpdateUserRole(r.Context(), targetID, role); err != nil {
		if errors.Is(err, ErrNotFound) {
			response.Error(w, http.StatusNotFound, "NOT_FOUND", "User not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update user role")
		return
	}

	userID, _ := r.Context().Value(middleware.UserIDKey).(string)
	_, _ = h.repo.db.Pool.Exec(r.Context(),
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, 'UPDATE_USER_ROLE', 'USER', $2, jsonb_build_object('new_role', $3))`,
		userID, targetID, role)

	response.Success(w, http.StatusOK, map[string]string{"message": "User role updated successfully"})
}

type UpdatePasswordRequest struct {
	Password string `json:"password"`
}

func (h *Handler) UpdateUserPassword(w http.ResponseWriter, r *http.Request) {
	targetID := r.PathValue("id")
	if targetID == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "User ID is required")
		return
	}

	var req UpdatePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	if len(req.Password) < 6 {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Password must be at least 6 characters")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to hash password")
		return
	}

	if err := h.repo.UpdateUserPassword(r.Context(), targetID, string(hash)); err != nil {
		if errors.Is(err, ErrNotFound) {
			response.Error(w, http.StatusNotFound, "NOT_FOUND", "User not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update password")
		return
	}

	userID, _ := r.Context().Value(middleware.UserIDKey).(string)
	_, _ = h.repo.db.Pool.Exec(r.Context(),
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, 'UPDATE_USER_PASSWORD', 'USER', $2, '{}'::jsonb)`,
		userID, targetID)

	response.Success(w, http.StatusOK, map[string]string{"message": "Password updated successfully"})
}

func (h *Handler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	targetID := r.PathValue("id")
	if targetID == "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "User ID is required")
		return
	}

	currentUserID, _ := r.Context().Value(middleware.UserIDKey).(string)
	if currentUserID == targetID {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "You cannot delete your own user account")
		return
	}

	if err := h.repo.DeleteUser(r.Context(), targetID); err != nil {
		if errors.Is(err, ErrNotFound) {
			response.Error(w, http.StatusNotFound, "NOT_FOUND", "User not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to delete user")
		return
	}

	_, _ = h.repo.db.Pool.Exec(r.Context(),
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
		 VALUES ($1, 'DELETE_USER', 'USER', $2, '{}'::jsonb)`,
		currentUserID, targetID)

	response.Success(w, http.StatusOK, map[string]string{"message": "User deleted successfully"})
}
