package website

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

func RegisterRoutes(mux *http.ServeMux, db *database.DB, jwtSecret string) {
	repo := NewRepository(db)
	svc := NewService(repo)
	h := NewHandler(svc, db)

	authMiddleware := middleware.RequireAuth([]byte(jwtSecret), db)

	withAuth := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(http.HandlerFunc(handlerFunc)).ServeHTTP(w, r)
		}
	}
	withWrite := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(middleware.RequireRole("admin", "operator")(http.HandlerFunc(handlerFunc))).ServeHTTP(w, r)
		}
	}

	mux.Handle("GET /api/v1/websites", withAuth(h.List))
	mux.Handle("GET /api/v1/websites/uptime-summary", withAuth(h.GetUptimeSummary))
	mux.Handle("POST /api/v1/websites", withWrite(h.Create))
	mux.Handle("PUT /api/v1/websites/{id}", withWrite(h.Update))
	mux.Handle("DELETE /api/v1/websites/{id}", withWrite(h.Delete))
}
