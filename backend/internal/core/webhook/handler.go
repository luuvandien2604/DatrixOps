package webhook

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/auditlog"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/notifier"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

var allowedEvents = map[string]bool{
	"server.offline":        true,
	"server.online":         true,
	"server.degraded":       true,
	"cron.failed":           true,
	"service.down":          true,
	"agent.update_failed":   true,
	"agent.update_resolved": true,
}

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) ListEndpoints(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	endpoints, err := h.repo.ListEndpoints(r.Context(), userID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list system webhooks")
		return
	}
	for i := range endpoints {
		sanitizeEndpoint(&endpoints[i])
	}
	response.Success(w, http.StatusOK, map[string]any{
		"items":          endpoints,
		"allowed_events": allowedEventList(),
	})
}

func (h *Handler) CreateEndpoint(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	var req CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request payload")
		return
	}

	endpoint := Endpoint{
		UserID:        userID,
		Name:          strings.TrimSpace(req.Name),
		URL:           strings.TrimSpace(req.URL),
		Events:        normalizeEvents(req.Events),
		SigningSecret: strings.TrimSpace(req.SigningSecret),
		Enabled:       true,
	}
	if req.Enabled != nil {
		endpoint.Enabled = *req.Enabled
	}
	if endpoint.SigningSecret == "" {
		generatedSecret, generateErr := randomSecret()
		if generateErr != nil {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to generate webhook signing secret")
			return
		}
		endpoint.SigningSecret = generatedSecret
	}

	if validationMessage := validateEndpoint(endpoint); validationMessage != "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", validationMessage)
		return
	}

	if err := h.repo.CreateEndpoint(r.Context(), &endpoint); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to create system webhook")
		return
	}

	auditlog.Record(r.Context(), h.repo.db, userID, "CREATE_SYSTEM_WEBHOOK", "SYSTEM_WEBHOOK", endpoint.ID, map[string]any{
		"name":     endpoint.Name,
		"url_host": endpointURLHost(endpoint.URL),
		"events":   endpoint.Events,
		"enabled":  endpoint.Enabled,
	})
	sanitizeEndpoint(&endpoint)
	response.Success(w, http.StatusCreated, endpoint)
}

func (h *Handler) UpdateEndpoint(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	endpoint, err := h.repo.GetEndpoint(r.Context(), r.PathValue("id"), userID)
	if err != nil {
		handleEndpointError(w, err, "Failed to load system webhook")
		return
	}

	var req UpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request payload")
		return
	}

	if req.Name != nil {
		endpoint.Name = strings.TrimSpace(*req.Name)
	}
	if req.URL != nil {
		endpoint.URL = strings.TrimSpace(*req.URL)
	}
	if req.Events != nil {
		endpoint.Events = normalizeEvents(*req.Events)
	}
	if req.Enabled != nil {
		endpoint.Enabled = *req.Enabled
	}
	rotatedSecret := ""
	if req.RotateSecret {
		rotatedSecret, err = randomSecret()
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to rotate webhook signing secret")
			return
		}
		endpoint.StoredSecret = rotatedSecret
	}

	if validationMessage := validateEndpoint(*endpoint); validationMessage != "" {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", validationMessage)
		return
	}

	if err := h.repo.UpdateEndpoint(r.Context(), endpoint); err != nil {
		handleEndpointError(w, err, "Failed to update system webhook")
		return
	}

	auditlog.Record(r.Context(), h.repo.db, userID, "UPDATE_SYSTEM_WEBHOOK", "SYSTEM_WEBHOOK", endpoint.ID, map[string]any{
		"name":           endpoint.Name,
		"url_host":       endpointURLHost(endpoint.URL),
		"events":         endpoint.Events,
		"enabled":        endpoint.Enabled,
		"secret_rotated": req.RotateSecret,
	})
	sanitizeEndpoint(endpoint)
	if rotatedSecret != "" {
		endpoint.SigningSecret = rotatedSecret
	}
	response.Success(w, http.StatusOK, endpoint)
}

func (h *Handler) DeleteEndpoint(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	id := r.PathValue("id")
	if err := h.repo.DeleteEndpoint(r.Context(), id, userID); err != nil {
		handleEndpointError(w, err, "Failed to delete system webhook")
		return
	}
	auditlog.Record(r.Context(), h.repo.db, userID, "DELETE_SYSTEM_WEBHOOK", "SYSTEM_WEBHOOK", id, nil)
	response.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) TestEndpoint(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	endpoint, err := h.repo.GetEndpoint(r.Context(), r.PathValue("id"), userID)
	if err != nil {
		handleEndpointError(w, err, "Failed to load system webhook")
		return
	}

	randomID, err := randomHex(16)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to generate webhook event ID")
		return
	}
	eventID := "evt_" + randomID
	payload := TestPayload{
		EventID: eventID,
		Event:   "webhook.test",
		Source:  "datrixops.control_plane",
		SentAt:  time.Now().UTC(),
		Test:    true,
		Metadata: map[string]any{
			"webhook_id": endpoint.ID,
			"name":       endpoint.Name,
		},
	}
	payloadBytes, _ := json.Marshal(payload)

	delivery := RetryDelivery(Delivery{
		UserID:         userID,
		WebhookID:      endpoint.ID,
		WebhookName:    endpoint.Name,
		EndpointURL:    endpoint.URL,
		EndpointSecret: endpoint.StoredSecret,
		EventType:      payload.Event,
		EventID:        eventID,
		Payload:        payloadBytes,
		MaxAttempts:    3,
	})
	if err := h.repo.RecordDelivery(r.Context(), delivery); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to record webhook delivery")
		return
	}

	auditlog.Record(r.Context(), h.repo.db, userID, "TEST_SYSTEM_WEBHOOK", "SYSTEM_WEBHOOK", endpoint.ID, map[string]any{
		"name":       endpoint.Name,
		"url_host":   endpointURLHost(endpoint.URL),
		"status":     delivery.Status,
		"event_type": payload.Event,
	})

	if delivery.ErrorMessage != nil {
		response.Error(w, http.StatusBadGateway, "WEBHOOK_DELIVERY_FAILED", *delivery.ErrorMessage)
		return
	}
	response.Success(w, http.StatusOK, map[string]any{
		"status":      delivery.Status,
		"event_id":    eventID,
		"status_code": delivery.StatusCode,
		"latency_ms":  delivery.LatencyMs,
	})
}

func (h *Handler) ListDeliveries(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(w, r)
	if !ok {
		return
	}

	limit := 50
	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err != nil || parsedLimit < 1 || parsedLimit > 100 {
			response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Limit must be between 1 and 100")
			return
		}
		limit = parsedLimit
	}

	deliveries, err := h.repo.ListDeliveries(r.Context(), userID, limit)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to list webhook deliveries")
		return
	}
	response.Success(w, http.StatusOK, deliveries)
}

func validateEndpoint(endpoint Endpoint) string {
	if endpoint.Name == "" {
		return "Webhook name is required"
	}
	if len(endpoint.Name) > 120 {
		return "Webhook name must be 120 characters or fewer"
	}
	if len(endpoint.Events) == 0 {
		return "Select at least one webhook event"
	}
	for _, event := range endpoint.Events {
		if !allowedEvents[event] {
			return "Unsupported webhook event: " + event
		}
	}
	if endpoint.SigningSecret == "" && endpoint.StoredSecret == "" {
		return "Signing secret is required"
	}
	return validateEndpointURL(endpoint.URL)
}

func validateEndpointURL(rawURL string) string {
	if err := notifier.ValidatePublicHTTPSURL(rawURL); err != nil {
		return "Webhook " + err.Error()
	}
	return ""
}

func normalizeEvents(events []string) []string {
	seen := make(map[string]bool)
	normalized := make([]string, 0, len(events))
	for _, event := range events {
		event = strings.ToLower(strings.TrimSpace(event))
		if event == "" || seen[event] {
			continue
		}
		seen[event] = true
		normalized = append(normalized, event)
	}
	return normalized
}

func allowedEventList() []string {
	return []string{
		"server.offline",
		"server.online",
		"server.degraded",
		"cron.failed",
		"service.down",
		"agent.update_failed",
		"agent.update_resolved",
	}
}

func sanitizeEndpoint(endpoint *Endpoint) {
	endpoint.URLDisplay = maskURL(endpoint.URL)
	endpoint.URL = ""
	endpoint.StoredSecret = ""
}

func maskURL(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		return "redacted"
	}
	path := strings.Trim(parsed.EscapedPath(), "/")
	if path == "" {
		return parsed.Scheme + "://" + parsed.Host + "/…"
	}
	firstSegment := strings.Split(path, "/")[0]
	return parsed.Scheme + "://" + parsed.Host + "/" + firstSegment + "/…"
}

func endpointURLHost(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return parsed.Hostname()
}

func randomSecret() (string, error) {
	value, err := randomHex(32)
	if err != nil {
		return "", err
	}
	return "whsec_" + value, nil
}

func randomHex(size int) (string, error) {
	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func userIDFromRequest(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return "", false
	}
	return userID, true
}

func handleEndpointError(w http.ResponseWriter, err error, fallback string) {
	if errors.Is(err, ErrEndpointNotFound) {
		response.Error(w, http.StatusNotFound, "WEBHOOK_NOT_FOUND", "System webhook not found")
		return
	}
	response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", fallback)
}
