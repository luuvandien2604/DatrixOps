package terminal

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/middleware"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

const maxMessageBytes = 256 * 1024

var upgrader = websocket.Upgrader{
	HandshakeTimeout: 10 * time.Second,
	ReadBufferSize:   32 * 1024,
	WriteBufferSize:  32 * 1024,
	// Browser origin validation is handled explicitly in BrowserSocket.
	// The agent channel is non-browser traffic and legitimately has no Origin.
	CheckOrigin: func(*http.Request) bool { return true },
}

func sameOrigin(r *http.Request) bool {
	origin, err := url.Parse(r.Header.Get("Origin"))
	if err != nil || origin.Host == "" {
		return false
	}
	requestHost := r.Host
	if forwardedHost := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Host"), ",")[0]); forwardedHost != "" {
		requestHost = forwardedHost
	}
	return strings.EqualFold(origin.Host, requestHost)
}

func clientAddress(r *http.Request) string {
	if forwardedFor := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]); forwardedFor != "" {
		return forwardedFor
	}
	return r.RemoteAddr
}

func (h *Hub) CreateTicket(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(middleware.UserIDKey).(string)
	if !ok || userID == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "User not found in context")
		return
	}
	serverID := r.PathValue("id")
	exists, err := h.repo.ownsServer(r.Context(), serverID, userID)
	if err != nil || !exists {
		response.Error(w, http.StatusNotFound, "NOT_FOUND", "Server not found")
		return
	}
	if h.agentFor(serverID) == nil {
		response.Error(w, http.StatusConflict, "AGENT_UNAVAILABLE", errAgentUnavailable.Error())
		return
	}
	if h.hasActiveSession(serverID) {
		response.Error(w, http.StatusConflict, "TERMINAL_BUSY", errSessionActive.Error())
		return
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unable to create terminal ticket")
		return
	}
	value := base64.RawURLEncoding.EncodeToString(raw)
	expires := time.Now().Add(ticketLifetime)
	h.mu.Lock()
	for key, current := range h.tickets {
		if current.expires.Before(time.Now()) {
			delete(h.tickets, key)
		}
	}
	h.tickets[value] = ticket{serverID: serverID, userID: userID, expires: expires}
	h.mu.Unlock()

	response.Success(w, http.StatusCreated, map[string]any{
		"ticket":         value,
		"expires_in":     int(ticketLifetime.Seconds()),
		"websocket_path": "/api/v1/terminal/browser?ticket=" + value,
	})
}

func (h *Hub) BrowserSocket(w http.ResponseWriter, r *http.Request) {
	if !sameOrigin(r) {
		response.Error(w, http.StatusForbidden, "INVALID_ORIGIN", "Terminal connection origin is not allowed")
		return
	}
	value := r.URL.Query().Get("ticket")
	h.mu.Lock()
	currentTicket, ok := h.tickets[value]
	delete(h.tickets, value)
	h.mu.Unlock()
	if !ok || currentTicket.expires.Before(time.Now()) {
		response.Error(w, http.StatusUnauthorized, "INVALID_TICKET", "Terminal ticket is invalid or expired")
		return
	}

	agent := h.agentFor(currentTicket.serverID)
	if agent == nil || h.hasActiveSession(currentTicket.serverID) {
		response.Error(w, http.StatusConflict, "TERMINAL_UNAVAILABLE", "Terminal is unavailable")
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	browser := &peer{conn: conn}
	conn.SetReadLimit(maxMessageBytes)
	_ = conn.SetReadDeadline(time.Now().Add(sessionLifetime))

	sessionID, err := h.repo.createSession(
		r.Context(), currentTicket.serverID, currentTicket.userID, clientAddress(r),
	)
	if err != nil {
		browser.close(websocket.CloseInternalServerErr, "Unable to create terminal session")
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	current := &session{
		id: sessionID, serverID: currentTicket.serverID, userID: currentTicket.userID,
		browser: browser, agent: agent, startedAt: time.Now(), cancel: cancel,
	}
	h.mu.Lock()
	h.sessions[sessionID] = current
	h.mu.Unlock()

	_ = h.repo.auditOpen(context.Background(), current)
	if err := agent.write(message{Type: messageSessionStart, SessionID: sessionID, Cols: 120, Rows: 32}); err != nil {
		h.endSession(current, "agent_disconnected", "Unable to contact agent", false)
		return
	}
	_ = browser.write(message{Type: "ready", SessionID: sessionID})

	timer := time.AfterFunc(sessionLifetime, func() {
		h.endSession(current, "timed_out", "Maximum terminal duration reached", true)
	})
	defer timer.Stop()
	defer h.endSession(current, "closed", "Browser disconnected", true)

	pingTicker := time.NewTicker(30 * time.Second)
	pingDone := make(chan struct{})
	defer close(pingDone)
	defer pingTicker.Stop()
	go func() {
		for {
			select {
			case <-pingDone:
				return
			case <-pingTicker.C:
				browser.mu.Lock()
				_ = conn.SetWriteDeadline(time.Now().Add(writeTimeout))
				err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeTimeout))
				browser.mu.Unlock()
				if err != nil {
					_ = conn.Close()
					return
				}
			}
		}
	}()

	for {
		var incoming message
		if err := conn.ReadJSON(&incoming); err != nil {
			return
		}
		incoming.SessionID = sessionID
		switch incoming.Type {
		case messageInput:
			if len(incoming.Data) > maxMessageBytes {
				return
			}
			h.addBytes(current, true, decodedLength(incoming.Data))
		case messageResize:
			incoming.Cols = clamp(incoming.Cols, 20, 400)
			incoming.Rows = clamp(incoming.Rows, 5, 200)
			_ = h.repo.updateSize(context.Background(), sessionID, incoming.Cols, incoming.Rows)
		case messageSessionClose:
			return
		default:
			continue
		}
		if err := agent.write(incoming); err != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		default:
		}
	}
}

func (h *Hub) AgentSocket(w http.ResponseWriter, r *http.Request) {
	auth := strings.Fields(r.Header.Get("Authorization"))
	if len(auth) != 2 || !strings.EqualFold(auth[0], "Bearer") {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing agent authorization")
		return
	}
	serverID, err := h.repo.serverIDForAgentToken(r.Context(), auth[1])
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid agent token")
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	agent := &peer{conn: conn}
	conn.SetReadLimit(maxMessageBytes)
	h.registerAgent(serverID, agent)
	defer h.unregisterAgent(serverID, agent)
	defer conn.Close()

	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	})
	_ = conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	ticker := time.NewTicker(30 * time.Second)
	done := make(chan struct{})
	defer close(done)
	defer ticker.Stop()
	go func() {
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				agent.mu.Lock()
				_ = conn.SetWriteDeadline(time.Now().Add(writeTimeout))
				err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeTimeout))
				agent.mu.Unlock()
				if err != nil {
					_ = conn.Close()
					return
				}
			}
		}
	}()

	for {
		var incoming message
		if err := conn.ReadJSON(&incoming); err != nil {
			return
		}
		h.dispatchAgentMessage(agent, incoming)
	}
}

func clamp(value, minimum, maximum int) int {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}
