package terminal

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
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

var connected atomic.Bool
var lastError atomic.Value

func Connected() bool {
	return connected.Load()
}

// LastError returns a short, credential-free diagnostic suitable for the
// authenticated dashboard. Agent tokens are never included in this value.
func LastError() string {
	value, _ := lastError.Load().(string)
	return value
}

func setLastError(err error) {
	if err == nil {
		lastError.Store("")
		return
	}
	value := strings.Join(strings.Fields(err.Error()), " ")
	if len(value) > 500 {
		value = value[:500]
	}
	lastError.Store(value)
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
	if current := EnvironmentSupport(); !current.Supported {
		setLastError(nil)
		log.Printf("Terminal reverse channel disabled: %s", current.Reason)
		return
	}

	backoff := time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		attemptStarted := time.Now()
		if err := connect(ctx, cfg); err != nil && ctx.Err() == nil {
			setLastError(err)
			log.Printf("Terminal channel disconnected: %v", err)
		}
		if time.Since(attemptStarted) >= time.Minute {
			backoff = time.Second
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
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
		}
	}
}

func connect(ctx context.Context, cfg *config.Config) error {
	endpoint, err := terminalURL(cfg.ServerURL)
	if err != nil {
		return err
	}
	log.Printf("Connecting terminal reverse channel to %s", endpoint)
	header := http.Header{}
	header.Set("Authorization", "Bearer "+cfg.AgentToken)
	header.Set("User-Agent", "DatrixOps-Agent-Terminal")
	conn, response, err := (&websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		Proxy:            http.ProxyFromEnvironment,
	}).DialContext(ctx, endpoint, header)
	if err != nil {
		return websocketHandshakeError(err, response)
	}
	defer conn.Close()
	connected.Store(true)
	setLastError(nil)
	defer connected.Store(false)
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

func websocketHandshakeError(dialErr error, response *http.Response) error {
	if response == nil {
		return fmt.Errorf("connect terminal WebSocket: %w", dialErr)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
	detail := strings.Join(strings.Fields(string(body)), " ")
	if detail == "" {
		detail = http.StatusText(response.StatusCode)
	}
	gateway := strings.TrimSpace(response.Header.Get("X-DatrixOps-Gateway"))
	if gateway == "" {
		gateway = "not-reported"
	}
	return fmt.Errorf("terminal WebSocket handshake returned HTTP %d (gateway=%s): %s", response.StatusCode, gateway, detail)
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
	default:
		return "", fmt.Errorf("terminal server URL must use HTTP or HTTPS")
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("terminal server URL is missing a host")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/agent/terminal"
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}
