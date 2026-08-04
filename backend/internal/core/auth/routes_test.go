package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
)

func TestRegisterRouteIsDisabledForPublicCoreAuth(t *testing.T) {
	mux := http.NewServeMux()
	RegisterRoutes(mux, nil, &config.Config{
		JWTSecret:          "test-secret",
		Edition:            "community",
		DeploymentMode:     "self-hosted",
		PublicRegistration: true,
	})

	request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", nil)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected register route to be disabled with 403, got %d", recorder.Code)
	}
}
