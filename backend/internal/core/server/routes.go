package server

import (
	"net/http"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
)

// RegisterRoutes sets up the HTTP routes for the server module.
func RegisterRoutes(mux *http.ServeMux, db *database.DB, cfg *config.Config) {
	isCloud := cfg.Edition == "cloud" || cfg.DeploymentMode == "managed"
	SetCloudDeployment(isCloud)

	repo := NewRepository(db)
	svc := NewService(repo, cfg.AgentVersion, cfg.PublicURL, cfg.AgentReleaseURL, cfg.AgentReleaseLayout)
	h := NewHandler(svc, isCloud, cfg.EnableRemoteScripts, cfg.EnableServiceControls, cfg.EnableReadOnlyLogs)

	authMiddleware := middleware.RequireAuth([]byte(cfg.JWTSecret), db)

	// Helper to wrap handler with auth middleware
	withAuth := func(handlerFunc http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(http.HandlerFunc(handlerFunc)).ServeHTTP(w, r)
		}
	}
	withRoles := func(handlerFunc http.HandlerFunc, roles ...string) http.HandlerFunc {
		roleMiddleware := middleware.RequireRole(roles...)
		return func(w http.ResponseWriter, r *http.Request) {
			authMiddleware(roleMiddleware(http.HandlerFunc(handlerFunc))).ServeHTTP(w, r)
		}
	}

	targetManageRoles := []string{"admin"}
	if !isCloud {
		targetManageRoles = []string{"admin", "operator"}
	}

	mux.HandleFunc("GET /api/v1/servers", withAuth(h.List))
	mux.HandleFunc("GET /api/v1/dashboard/overview", withAuth(h.DashboardOverview))
	mux.HandleFunc("GET /api/v1/servers/{id}", withAuth(h.Get))
	mux.HandleFunc("POST /api/v1/servers", withRoles(h.Create, "admin"))
	mux.HandleFunc("GET /api/v1/servers/{id}/metrics", withAuth(h.ListMetrics))
	mux.HandleFunc("POST /api/v1/servers/actions/update-agents", withRoles(h.UpdateAllAgents, "admin"))
	mux.HandleFunc("POST /api/v1/servers/{id}/tasks", withRoles(h.CreateTask, "admin", "operator"))
	mux.HandleFunc("GET /api/v1/servers/{id}/tasks/{taskId}", withAuth(h.GetTask))
	mux.HandleFunc("DELETE /api/v1/servers/{id}/tasks/{taskId}", withRoles(h.CancelTask, "admin", "operator"))
	mux.HandleFunc("POST /api/v1/servers/{id}/tasks/cancel-update", withRoles(h.CancelTask, "admin", "operator"))
	mux.HandleFunc("DELETE /api/v1/servers/{id}", withRoles(h.Delete, "admin"))
	mux.HandleFunc("PUT /api/v1/servers/{id}/meta", withRoles(h.UpdateMeta, "admin"))
	mux.HandleFunc("PUT /api/v1/servers/{id}/agent-update-policy", withRoles(h.UpdateAgentUpdatePolicy, "admin"))
	mux.HandleFunc("POST /api/v1/servers/{id}/diagnose-network", withRoles(h.DiagnoseNetwork, targetManageRoles...))
	mux.HandleFunc("GET /api/v1/servers/{id}/diagnose-network", withAuth(h.GetNetworkDiagnostics))

	// Network Targets Endpoints
	mux.HandleFunc("GET /api/v1/network-targets", withAuth(h.ListNetworkTargets))
	mux.HandleFunc("POST /api/v1/network-targets", withRoles(h.CreateNetworkTarget, targetManageRoles...))
	mux.HandleFunc("GET /api/v1/network-targets/presets", withAuth(h.GetNetworkTargetPresets))
	mux.HandleFunc("GET /api/v1/network-targets/overview", withAuth(h.GetNetworkQualityOverview))
	mux.HandleFunc("GET /api/v1/network-targets/{id}", withAuth(h.GetNetworkTarget))
	mux.HandleFunc("PUT /api/v1/network-targets/{id}", withRoles(h.UpdateNetworkTarget, targetManageRoles...))
	mux.HandleFunc("DELETE /api/v1/network-targets/{id}", withRoles(h.DeleteNetworkTarget, targetManageRoles...))
	mux.HandleFunc("GET /api/v1/network-targets/{id}/history", withAuth(h.GetNetworkTargetHistory))
	mux.HandleFunc("POST /api/v1/network-targets/{id}/test-now", withRoles(h.TestNetworkTargetNow, targetManageRoles...))
}

