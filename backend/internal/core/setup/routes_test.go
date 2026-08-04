package setup

import (
	"net/http"
	"testing"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/config"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

func TestRegisterRoutesOnlyForCommunitySelfHosted(t *testing.T) {
	tests := []struct {
		name           string
		edition        string
		deploymentMode string
		wantRegistered bool
	}{
		{name: "community self-hosted", edition: "community", deploymentMode: "self-hosted", wantRegistered: true},
		{name: "cloud managed", edition: "cloud", deploymentMode: "managed", wantRegistered: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mux := http.NewServeMux()
			RegisterRoutes(mux, &database.DB{}, &config.Config{
				Edition:        tt.edition,
				DeploymentMode: tt.deploymentMode,
			})

			request, err := http.NewRequest(http.MethodGet, "/api/v1/setup/status", nil)
			if err != nil {
				t.Fatal(err)
			}

			_, pattern := mux.Handler(request)
			registered := pattern != ""
			if registered != tt.wantRegistered {
				t.Fatalf("registered=%v, want %v", registered, tt.wantRegistered)
			}
		})
	}
}
