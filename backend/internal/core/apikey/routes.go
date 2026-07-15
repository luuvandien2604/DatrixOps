package apikey

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

func RegisterRoutes(mux *http.ServeMux, handler *Handler, db *database.DB, jwtSecret []byte) {
	authMiddleware := middleware.RequireAuth(jwtSecret, db)

	withAuth := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(http.HandlerFunc(handlerFunc)).ServeHTTP(w, r)
		}
	}

	mux.HandleFunc("GET /api/v1/apikeys", withAuth(handler.ListKeys))
	mux.HandleFunc("POST /api/v1/apikeys", withAuth(handler.CreateKey))
	mux.HandleFunc("DELETE /api/v1/apikeys/{id}", withAuth(handler.DeleteKey))
}
