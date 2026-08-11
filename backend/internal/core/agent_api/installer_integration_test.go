package agent_api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
)

func TestHermeticInstallerIntegration(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("skipping bash installer test on Windows")
	}

	projectRoot, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatalf("failed to determine project root: %v", err)
	}
	installerScript := filepath.Join(projectRoot, "frontend/public/install.sh")
	if _, err := os.Stat(installerScript); err != nil {
		t.Fatalf("install.sh script not found: %v", err)
	}

	t.Run("pre-enrollment checksum mismatch makes zero enrollment calls", func(t *testing.T) {
		var enrollCalls int64
		var rollbackCalls int64

		handler := http.NewServeMux()
		handler.HandleFunc("GET /agent-release.version", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("1.5.5\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.sha256", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-linux-arm64.sha256", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-darwin-amd64.sha256", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-darwin-arm64.sha256", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.size", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("123\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-linux-arm64.size", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("123\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-darwin-amd64.size", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("123\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-darwin-arm64.size", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("123\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-linux-amd64", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("\x7fELFcorruptedcontent"))
		})
		handler.HandleFunc("GET /datrixops-agent-linux-arm64", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("\x7fELFcorruptedcontent"))
		})
		handler.HandleFunc("GET /datrixops-agent-darwin-amd64", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("\x7fELFcorruptedcontent"))
		})
		handler.HandleFunc("GET /datrixops-agent-darwin-arm64", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("\x7fELFcorruptedcontent"))
		})
		handler.HandleFunc("POST /api/v1/agent/enroll", func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt64(&enrollCalls, 1)
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"agent_token":              "test_agent_token_12345678901234567890",
				"bootstrap_rollback_token": "test_rollback_token_12345678901234567890",
			})
		})
		handler.HandleFunc("POST /api/v1/agent/enroll/rollback", func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt64(&rollbackCalls, 1)
			w.WriteHeader(http.StatusNoContent)
		})

		server := httptest.NewServer(handler)
		defer server.Close()

		cmd := exec.Command("bash", installerScript,
			"--server", server.URL,
			"--token", "test_enrollment_token_12345678901234567890",
			"--agent-version", "1.5.5",
			"--agent-artifact-base-url", server.URL,
			"--allow-insecure-http",
		)
		testRoot := filepath.Join(t.TempDir(), "install-root")
		cmd.Env = append(os.Environ(),
			"EUID=0",
			"DATRIXOPS_INSTALLER_TEST_MODE=1",
			"DATRIXOPS_INSTALLER_ROOT="+testRoot,
			"DATRIXOPS_SYSTEMCTL_BIN=true",
		)
		output, err := cmd.CombinedOutput()
		if err == nil {
			t.Fatalf("expected installer to fail on corrupted checksum, but succeeded: %s", string(output))
		}

		if got := atomic.LoadInt64(&enrollCalls); got != 0 {
			t.Fatalf("pre-enrollment verification failure must make 0 enrollment API calls, got %d", got)
		}
		if got := atomic.LoadInt64(&rollbackCalls); got != 0 {
			t.Fatalf("pre-enrollment verification failure must make 0 rollback API calls, got %d", got)
		}
	})

	t.Run("valid artifact proceeds to enrollment and tests rollback on status failure", func(t *testing.T) {
		var enrollCalls int64
		var rollbackCalls int64

		mockBinary := []byte("\x7fELFmockbinarycontentfor testingpurpose1234567890")
		sum := sha256.Sum256(mockBinary)
		shaHex := hex.EncodeToString(sum[:])
		sizeStr := fmt.Sprintf("%d", len(mockBinary))

		handler := http.NewServeMux()
		serveArtifacts := func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path
			switch {
			case strings.HasSuffix(path, ".sha256"):
				_, _ = w.Write([]byte(shaHex + "\n"))
			case strings.HasSuffix(path, ".size"):
				_, _ = w.Write([]byte(sizeStr + "\n"))
			default:
				_, _ = w.Write(mockBinary)
			}
		}

		handler.HandleFunc("GET /agent-release.version", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("1.5.5\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.sha256", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-linux-arm64.sha256", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-darwin-amd64.sha256", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-darwin-arm64.sha256", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.size", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-linux-arm64.size", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-darwin-amd64.size", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-darwin-arm64.size", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-linux-amd64", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-linux-arm64", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-darwin-amd64", serveArtifacts)
		handler.HandleFunc("GET /datrixops-agent-darwin-arm64", serveArtifacts)

		handler.HandleFunc("POST /api/v1/agent/enroll", func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt64(&enrollCalls, 1)
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":                   "created",
				"server_id":                "srv_test_12345",
				"agent_token":              "test_agent_token_12345678901234567890",
				"bootstrap_rollback_token": "test_rollback_token_12345678901234567890",
			})
		})

		handler.HandleFunc("POST /api/v1/agent/enroll/rollback", func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt64(&rollbackCalls, 1)
			w.WriteHeader(http.StatusNoContent)
		})

		handler.HandleFunc("GET /api/v1/agent/bootstrap-status", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status":              "pending",
				"bootstrap_completed": false,
			})
		})

		server := httptest.NewServer(handler)
		defer server.Close()

		cmd := exec.Command("bash", installerScript,
			"--server", server.URL,
			"--token", "test_enrollment_token_12345678901234567890",
			"--agent-version", "1.5.5",
			"--agent-artifact-base-url", server.URL,
			"--allow-insecure-http",
		)
		testRoot := filepath.Join(t.TempDir(), "install-root")
		cmd.Env = append(os.Environ(),
			"EUID=0",
			"DATRIXOPS_INSTALLER_TEST_MODE=1",
			"DATRIXOPS_INSTALLER_ROOT="+testRoot,
			"DATRIXOPS_SYSTEMCTL_BIN=true",
		)
		output, err := cmd.CombinedOutput()
		if got := atomic.LoadInt64(&enrollCalls); got != 1 {
			t.Fatalf("valid artifact must proceed to exactly 1 enrollment call, got %d. Command error: %v, Output:\n%s", got, err, string(output))
		}
		if got := atomic.LoadInt64(&rollbackCalls); got != 1 {
			t.Fatalf("failed bootstrap status wait must call rollback API exactly once, got %d. Output:\n%s", got, string(output))
		}
	})
}
