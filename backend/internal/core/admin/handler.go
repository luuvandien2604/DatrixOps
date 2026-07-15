package admin

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

type Handler struct {
	repo *Repository
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
