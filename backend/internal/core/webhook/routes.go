package webhook

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

	mux.HandleFunc("GET /api/v1/webhooks", withAuth(handler.ListEndpoints))
	mux.HandleFunc("POST /api/v1/webhooks", withAuth(handler.CreateEndpoint))
	mux.HandleFunc("PATCH /api/v1/webhooks/{id}", withAuth(handler.UpdateEndpoint))
	mux.HandleFunc("DELETE /api/v1/webhooks/{id}", withAuth(handler.DeleteEndpoint))
	mux.HandleFunc("POST /api/v1/webhooks/{id}/test", withAuth(handler.TestEndpoint))
	mux.HandleFunc("GET /api/v1/webhooks/deliveries", withAuth(handler.ListDeliveries))
}
