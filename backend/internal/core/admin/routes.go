package admin

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

func RegisterRoutes(mux *http.ServeMux, handler *Handler, db *database.DB, jwtSecret []byte) {
	mux.Handle("GET /api/v1/admin/users", middleware.RequireAuth(jwtSecret, db)(
		middleware.RequireRole("superadmin")(
			http.HandlerFunc(handler.ListUsers),
		),
	))
	mux.Handle("GET /api/v1/admin/servers", middleware.RequireAuth(jwtSecret, db)(
		middleware.RequireRole("superadmin")(http.HandlerFunc(handler.ListFleetServers)),
	))
	mux.Handle("POST /api/v1/admin/servers/{id}/tasks", middleware.RequireAuth(jwtSecret, db)(
		middleware.RequireRole("superadmin")(http.HandlerFunc(handler.QueueFleetTask)),
	))
}
