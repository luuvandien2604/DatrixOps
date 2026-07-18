package terminal

import (
	"context"
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const (
	ticketLifetime  = 30 * time.Second
	sessionLifetime = 30 * time.Minute
	writeTimeout    = 10 * time.Second
)

type peer struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (p *peer) write(value any) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	_ = p.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	return p.conn.WriteJSON(value)
}

func (p *peer) close(code int, reason string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	_ = p.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	_ = p.conn.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(code, reason), time.Now().Add(writeTimeout))
	_ = p.conn.Close()
}

type ticket struct {
	serverID string
	userID   string
	expires  time.Time
}

type session struct {
	id               string
	serverID         string
	userID           string
	browser          *peer
	agent            *peer
	startedAt        time.Time
	cancel           context.CancelFunc
	once             sync.Once
	bytesFromBrowser atomic.Int64
	bytesFromAgent   atomic.Int64
}

type Hub struct {
	repo     *repository
	mu       sync.Mutex
	agents   map[string]*peer
	tickets  map[string]ticket
	sessions map[string]*session
}

func NewHub(repo *repository) *Hub {
	return &Hub{
		repo:     repo,
		agents:   make(map[string]*peer),
		tickets:  make(map[string]ticket),
		sessions: make(map[string]*session),
	}
}

func (h *Hub) registerAgent(serverID string, agent *peer) {
	h.mu.Lock()
	old := h.agents[serverID]
	h.agents[serverID] = agent
	h.mu.Unlock()
	if old != nil && old != agent {
		old.close(websocket.CloseNormalClosure, "Agent connection replaced")
	}
}

func (h *Hub) unregisterAgent(serverID string, agent *peer) {
	h.mu.Lock()
	if h.agents[serverID] == agent {
		delete(h.agents, serverID)
	}
	affected := make([]*session, 0)
	for _, current := range h.sessions {
		if current.serverID == serverID && current.agent == agent {
			affected = append(affected, current)
		}
	}
	h.mu.Unlock()
	for _, current := range affected {
		h.endSession(current, "agent_disconnected", "Agent terminal channel disconnected", false)
	}
}

func (h *Hub) agentFor(serverID string) *peer {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.agents[serverID]
}

func (h *Hub) hasActiveSession(serverID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, current := range h.sessions {
		if current.serverID == serverID {
			return true
		}
	}
	return false
}

func (h *Hub) dispatchAgentMessage(agent *peer, incoming message) {
	if incoming.SessionID == "" {
		return
	}
	h.mu.Lock()
	current := h.sessions[incoming.SessionID]
	h.mu.Unlock()
	if current == nil || current.agent != agent {
		return
	}

	switch incoming.Type {
	case messageOutput:
		_ = current.browser.write(incoming)
		h.addBytes(current, false, decodedLength(incoming.Data))
	case messageError:
		_ = current.browser.write(incoming)
		h.endSession(current, "failed", incoming.Reason, false)
	case messageExit:
		_ = current.browser.write(incoming)
		h.endSession(current, "closed", incoming.Reason, false)
	}
}

func (h *Hub) endSession(current *session, status, reason string, notifyAgent bool) {
	current.once.Do(func() {
		current.cancel()
		h.mu.Lock()
		delete(h.sessions, current.id)
		h.mu.Unlock()

		if notifyAgent {
			_ = current.agent.write(message{Type: messageSessionClose, SessionID: current.id, Reason: reason})
		}
		current.browser.close(websocket.CloseNormalClosure, reason)
		bytesFromBrowser := current.bytesFromBrowser.Load()
		bytesFromAgent := current.bytesFromAgent.Load()
		_ = h.repo.closeSession(context.Background(), current.id, status, reason, bytesFromBrowser, bytesFromAgent)
		_ = h.repo.auditClose(context.Background(), current, status, reason, bytesFromBrowser, bytesFromAgent)
	})
}

func (h *Hub) addBytes(current *session, fromBrowser bool, length int) {
	if length <= 0 {
		return
	}
	if fromBrowser {
		current.bytesFromBrowser.Add(int64(length))
		return
	}
	current.bytesFromAgent.Add(int64(length))
}

func decodedLength(value string) int {
	decoded := len(value) * 3 / 4
	padding := 0
	if strings.HasSuffix(value, "==") {
		padding = 2
	} else if strings.HasSuffix(value, "=") {
		padding = 1
	}
	if decoded < padding {
		return 0
	}
	return decoded - padding
}

var errAgentUnavailable = errors.New("agent terminal channel is unavailable")
var errSessionActive = errors.New("a terminal session is already active for this server")
