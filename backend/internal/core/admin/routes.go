package admin

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

func RegisterRoutes(mux *http.ServeMux, handler *Handler, db *database.DB, jwtSecret []byte) {
	withAdmin := func(h http.HandlerFunc) http.Handler {
		return middleware.RequireAuth(jwtSecret, db)(middleware.RequireRole("admin")(h))
	}

	mux.Handle("GET /api/v1/admin/users", withAdmin(handler.ListUsers))
	mux.Handle("POST /api/v1/admin/users", withAdmin(handler.CreateUser))
	mux.Handle("PUT /api/v1/admin/users/{id}/role", withAdmin(handler.UpdateUserRole))
	mux.Handle("PUT /api/v1/admin/users/{id}/password", withAdmin(handler.UpdateUserPassword))
	mux.Handle("DELETE /api/v1/admin/users/{id}", withAdmin(handler.DeleteUser))

	mux.Handle("GET /api/v1/admin/servers", withAdmin(handler.ListFleetServers))
	mux.Handle("POST /api/v1/admin/servers/{id}/tasks", withAdmin(handler.QueueFleetTask))
}
