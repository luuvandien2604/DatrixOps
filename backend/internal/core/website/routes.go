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

	authMiddleware := middleware.RequireAuth([]byte(jwtSecret), db)

	withAuth := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(http.HandlerFunc(handlerFunc)).ServeHTTP(w, r)
		}
	}

	mux.Handle("GET /api/v1/websites", withAuth(h.List))
	mux.Handle("POST /api/v1/websites", withAuth(h.Create))
	mux.Handle("DELETE /api/v1/websites/{id}", withAuth(h.Delete))
}
