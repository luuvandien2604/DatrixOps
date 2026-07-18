package terminal

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/luuvandien2604/DatrixOps/agent/internal/config"
)

const (
	maxMessageBytes = 256 * 1024
	writeTimeout    = 10 * time.Second
)

type socket struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (s *socket) write(value any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = s.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	return s.conn.WriteJSON(value)
}

// Run maintains the outbound terminal control channel. It never opens a shell
// until an authenticated browser session is approved by the control plane.
func Run(ctx context.Context, cfg *config.Config) {
	backoff := time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		if err := connect(ctx, cfg); err != nil && ctx.Err() == nil {
			log.Printf("Terminal channel disconnected: %v", err)
		}
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func connect(ctx context.Context, cfg *config.Config) error {
	endpoint, err := terminalURL(cfg.ServerURL)
	if err != nil {
		return err
	}
	header := http.Header{}
	header.Set("Authorization", "Bearer "+cfg.AgentToken)
	conn, _, err := (&websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		Proxy:            http.ProxyFromEnvironment,
	}).DialContext(ctx, endpoint, header)
	if err != nil {
		return err
	}
	defer conn.Close()
	conn.SetReadLimit(maxMessageBytes)
	channel := &socket{conn: conn}
	manager := newSessionManager(channel)
	defer manager.close("Terminal channel disconnected")

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
			case <-ctx.Done():
				_ = conn.Close()
				return
			case <-done:
				return
			case <-ticker.C:
				channel.mu.Lock()
				_ = conn.SetWriteDeadline(time.Now().Add(writeTimeout))
				err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeTimeout))
				channel.mu.Unlock()
				if err != nil {
					_ = conn.Close()
					return
				}
			}
		}
	}()

	log.Printf("Terminal reverse channel connected")
	for {
		var incoming message
		if err := conn.ReadJSON(&incoming); err != nil {
			return err
		}
		manager.handle(ctx, incoming)
	}
}

func terminalURL(serverURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimRight(serverURL, "/"))
	if err != nil {
		return "", err
	}
	switch parsed.Scheme {
	case "https":
		parsed.Scheme = "wss"
	case "http":
		parsed.Scheme = "ws"
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/agent/terminal"
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}
