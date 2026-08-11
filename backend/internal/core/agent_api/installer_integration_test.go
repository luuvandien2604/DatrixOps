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

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatalf("failed to get runtime caller information")
	}
	projectRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "../../../.."))
	installerScript := filepath.Join(projectRoot, "frontend/public/install.sh")
	if _, err := os.Stat(installerScript); err != nil {
		t.Fatalf("install.sh script not found: %v", err)
	}

	runInstaller := func(t *testing.T, serverURL string, extraEnv []string) (string, error) {
		testRoot := filepath.Join(t.TempDir(), "install-root")
		cmd := exec.Command("bash", installerScript,
			"--server", serverURL,
			"--token", "test_enrollment_token_12345678901234567890",
			"--agent-version", "1.5.5",
			"--agent-artifact-base-url", serverURL,
			"--allow-insecure-http",
		)
		env := append(os.Environ(),
			"DATRIXOPS_INSTALLER_TEST_MODE=1",
			"DATRIXOPS_INSTALLER_ROOT="+testRoot,
			"DATRIXOPS_SYSTEMCTL_BIN=true",
		)
		cmd.Env = append(env, extraEnv...)
		output, err := cmd.CombinedOutput()
		return string(output), err
	}

	t.Run("version mismatch causes failure before download", func(t *testing.T) {
		handler := http.NewServeMux()
		handler.HandleFunc("GET /agent-release.version", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("1.5.6\n"))
		})
		server := httptest.NewServer(handler)
		defer server.Close()

		output, err := runInstaller(t, server.URL, nil)
		if err == nil || !strings.Contains(output, "version mismatch") {
			t.Fatalf("expected version mismatch error, got err: %v, output: %s", err, output)
		}
	})

	t.Run("pre-enrollment checksum mismatch makes zero enrollment calls", func(t *testing.T) {
		var enrollCalls int64

		handler := http.NewServeMux()
		handler.HandleFunc("GET /agent-release.version", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("1.5.5\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.sha256", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.size", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("123\n"))
		})
		handler.HandleFunc("GET /datrixops-agent-linux-amd64", func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("\x7fELFcorruptedcontent"))
		})
		handler.HandleFunc("POST /api/v1/agent/enroll", func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt64(&enrollCalls, 1)
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]string{"agent_token": "a", "bootstrap_rollback_token": "b"})
		})
		server := httptest.NewServer(handler)
		defer server.Close()

		_, err := runInstaller(t, server.URL, nil)
		if err == nil {
			t.Fatal("expected installer to fail on corrupted checksum, but succeeded")
		}
		if atomic.LoadInt64(&enrollCalls) != 0 {
			t.Fatal("must make 0 enrollment API calls")
		}
	})

	t.Run("successful bootstrap completion", func(t *testing.T) {
		var enrollCalls, rollbackCalls int64
		mockBinary := []byte("\x7fELFmockbinarycontentfor testingpurpose1234567890")
		shaHex := hex.EncodeToString(func() []byte { s := sha256.Sum256(mockBinary); return s[:] }())

		handler := http.NewServeMux()
		handler.HandleFunc("GET /agent-release.version", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("1.5.5\n")) })
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.sha256", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(shaHex + "\n")) })
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.size", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(fmt.Sprintf("%d\n", len(mockBinary)))) })
		handler.HandleFunc("GET /datrixops-agent-linux-amd64", func(w http.ResponseWriter, r *http.Request) { w.Write(mockBinary) })
		handler.HandleFunc("GET /datrixops-agent-linux-arm64.sha256", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(shaHex + "\n")) })
		handler.HandleFunc("GET /datrixops-agent-linux-arm64.size", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(fmt.Sprintf("%d\n", len(mockBinary)))) })
		handler.HandleFunc("GET /datrixops-agent-linux-arm64", func(w http.ResponseWriter, r *http.Request) { w.Write(mockBinary) })

		handler.HandleFunc("POST /api/v1/agent/enroll", func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt64(&enrollCalls, 1)
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{
				"agent_token":              strings.Repeat("a", 32),
				"bootstrap_rollback_token": strings.Repeat("b", 32),
			})
		})
		handler.HandleFunc("POST /api/v1/agent/enroll/rollback", func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt64(&rollbackCalls, 1)
			w.WriteHeader(http.StatusNoContent)
		})
		handler.HandleFunc("GET /api/v1/agent/bootstrap-status", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]any{"bootstrap_completed": true})
		})
		server := httptest.NewServer(handler)
		defer server.Close()

		output, err := runInstaller(t, server.URL, nil)
		if err != nil {
			t.Fatalf("expected successful install, got err: %v, output: %s", err, output)
		}
		if atomic.LoadInt64(&enrollCalls) != 1 {
			t.Fatalf("expected 1 enrollment API call, output: %s", output)
		}
		if atomic.LoadInt64(&rollbackCalls) != 0 {
			t.Fatalf("expected 0 rollback API calls, output: %s", output)
		}
	})

	t.Run("wrong agent token rejected triggers rollback", func(t *testing.T) {
		var rollbackCalls int64
		mockBinary := []byte("\x7fELFmockbinarycontentfor testingpurpose1234567890")
		shaHex := hex.EncodeToString(func() []byte { s := sha256.Sum256(mockBinary); return s[:] }())

		handler := http.NewServeMux()
		handler.HandleFunc("GET /agent-release.version", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("1.5.5\n")) })
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.sha256", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(shaHex + "\n")) })
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.size", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(fmt.Sprintf("%d\n", len(mockBinary)))) })
		handler.HandleFunc("GET /datrixops-agent-linux-amd64", func(w http.ResponseWriter, r *http.Request) { w.Write(mockBinary) })
		handler.HandleFunc("GET /datrixops-agent-linux-arm64.sha256", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(shaHex + "\n")) })
		handler.HandleFunc("GET /datrixops-agent-linux-arm64.size", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(fmt.Sprintf("%d\n", len(mockBinary)))) })
		handler.HandleFunc("GET /datrixops-agent-linux-arm64", func(w http.ResponseWriter, r *http.Request) { w.Write(mockBinary) })

		handler.HandleFunc("POST /api/v1/agent/enroll", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{
				"agent_token":              strings.Repeat("a", 32),
				"bootstrap_rollback_token": strings.Repeat("b", 32),
			})
		})
		handler.HandleFunc("POST /api/v1/agent/enroll/rollback", func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt64(&rollbackCalls, 1)
			w.WriteHeader(http.StatusNoContent)
		})
		handler.HandleFunc("GET /api/v1/agent/bootstrap-status", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized) // fail
		})
		server := httptest.NewServer(handler)
		defer server.Close()

		output, err := runInstaller(t, server.URL, nil)
		if err == nil {
			t.Fatalf("expected failed install, got output: %s", output)
		}
		if atomic.LoadInt64(&rollbackCalls) != 1 {
			t.Fatalf("expected exactly 1 rollback API call, output: %s", output)
		}
	})

	t.Run("rollback failure generates recovery file", func(t *testing.T) {
		mockBinary := []byte("\x7fELFmockbinarycontentfor testingpurpose1234567890")
		shaHex := hex.EncodeToString(func() []byte { s := sha256.Sum256(mockBinary); return s[:] }())

		handler := http.NewServeMux()
		handler.HandleFunc("GET /agent-release.version", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("1.5.5\n")) })
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.sha256", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(shaHex + "\n")) })
		handler.HandleFunc("GET /datrixops-agent-linux-amd64.size", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(fmt.Sprintf("%d\n", len(mockBinary)))) })
		handler.HandleFunc("GET /datrixops-agent-linux-amd64", func(w http.ResponseWriter, r *http.Request) { w.Write(mockBinary) })
		handler.HandleFunc("GET /datrixops-agent-linux-arm64.sha256", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(shaHex + "\n")) })
		handler.HandleFunc("GET /datrixops-agent-linux-arm64.size", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(fmt.Sprintf("%d\n", len(mockBinary)))) })
		handler.HandleFunc("GET /datrixops-agent-linux-arm64", func(w http.ResponseWriter, r *http.Request) { w.Write(mockBinary) })

		handler.HandleFunc("POST /api/v1/agent/enroll", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(map[string]string{
				"agent_token":              strings.Repeat("a", 32),
				"bootstrap_rollback_token": strings.Repeat("b", 32),
			})
		})
		handler.HandleFunc("POST /api/v1/agent/enroll/rollback", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		})
		handler.HandleFunc("GET /api/v1/agent/bootstrap-status", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		})
		server := httptest.NewServer(handler)
		defer server.Close()

		testRoot := filepath.Join(t.TempDir(), "install-root")
		cmd := exec.Command("bash", installerScript,
			"--server", server.URL,
			"--token", "test_enrollment_token_12345678901234567890",
			"--agent-version", "1.5.5",
			"--agent-artifact-base-url", server.URL,
			"--allow-insecure-http",
		)
		cmd.Env = append(os.Environ(),
			"DATRIXOPS_INSTALLER_TEST_MODE=1",
			"DATRIXOPS_INSTALLER_ROOT="+testRoot,
			"DATRIXOPS_SYSTEMCTL_BIN=true",
		)
		output, err := cmd.CombinedOutput()
		if err == nil {
			t.Fatalf("expected failed install, got output: %s", output)
		}

		recoveryPath := filepath.Join(testRoot, "etc/datrixops/bootstrap-recovery.json")
		if _, err := os.Stat(recoveryPath); err != nil {
			t.Fatalf("expected recovery file to be created: %v", err)
		}
	})
}
