package apikey

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

func RegisterRoutes(mux *http.ServeMux, handler *Handler, db *database.DB, jwtSecret []byte) {
	authMiddleware := middleware.RequireAuth(jwtSecret, db)

	withAdmin := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(middleware.RequireRole("admin")(http.HandlerFunc(handlerFunc))).ServeHTTP(w, r)
		}
	}

	mux.HandleFunc("GET /api/v1/apikeys", withAdmin(handler.ListKeys))
	mux.HandleFunc("POST /api/v1/apikeys", withAdmin(handler.CreateKey))
	mux.HandleFunc("DELETE /api/v1/apikeys/{id}", withAdmin(handler.DeleteKey))
}
