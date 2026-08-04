package agent_api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHashAgentCredential(t *testing.T) {
	token := "test-rollback-token-12345678901234567890"
	hash1 := hashAgentCredential(token)
	hash2 := hashAgentCredential(token)

	if hash1 == "" {
		t.Fatal("expected non-empty hash")
	}
	if hash1 != hash2 {
		t.Fatalf("expected deterministic hash, got %s and %s", hash1, hash2)
	}
	if hash1 == token {
		t.Fatal("hash should not equal raw token")
	}
}

func TestEnrollRollbackValidation(t *testing.T) {
	h := &Handler{}

	t.Run("empty token", func(t *testing.T) {
		body := bytes.NewBufferString(`{"rollback_token": ""}`)
		req := httptest.NewRequest("POST", "/api/v1/agent/enroll/rollback", body)
		w := httptest.NewRecorder()

		h.EnrollRollback(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d", w.Code)
		}
	})

	t.Run("token too long", func(t *testing.T) {
		longToken := make([]byte, 300)
		for i := range longToken {
			longToken[i] = 'a'
		}
		payload, _ := json.Marshal(EnrollmentRollbackRequest{RollbackToken: string(longToken)})
		req := httptest.NewRequest("POST", "/api/v1/agent/enroll/rollback", bytes.NewReader(payload))
		w := httptest.NewRecorder()

		h.EnrollRollback(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d", w.Code)
		}
	})

	t.Run("invalid json", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/v1/agent/enroll/rollback", bytes.NewBufferString(`{invalid}`))
		w := httptest.NewRecorder()

		h.EnrollRollback(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d", w.Code)
		}
	})
}
