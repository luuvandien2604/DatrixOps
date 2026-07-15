package audit

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

func RegisterRoutes(mux *http.ServeMux, handler *Handler, db *database.DB, jwtSecret []byte) {
	mux.Handle("GET /api/v1/audit-logs", middleware.RequireAuth(jwtSecret, db)(
		http.HandlerFunc(handler.ListLogs),
	))
}
