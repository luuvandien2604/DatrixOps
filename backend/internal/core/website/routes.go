package website

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

func RegisterRoutes(mux *http.ServeMux, db *database.DB, jwtSecret string) {
	repo := NewRepository(db)
	svc := NewService(repo)
	h := NewHandler(svc)

	authMiddleware := middleware.RequireAuth([]byte(jwtSecret))

	mux.Handle("GET /api/v1/websites", authMiddleware(http.HandlerFunc(h.List)))
	mux.Handle("POST /api/v1/websites", authMiddleware(http.HandlerFunc(h.Create)))
	mux.Handle("DELETE /api/v1/websites/{id}", authMiddleware(http.HandlerFunc(h.Delete)))
}
