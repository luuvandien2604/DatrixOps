package terminal

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const maxSessionDuration = 30 * time.Minute

type terminalPTY interface {
	io.Reader
	io.Writer
	Resize(cols, rows int) error
	Close() error
}

type terminalSession struct {
	id      string
	pty     terminalPTY
	command *exec.Cmd
	cancel  context.CancelFunc
	once    sync.Once
}

type sessionManager struct {
	socket  *socket
	mu      sync.Mutex
	current *terminalSession
}

func newSessionManager(channel *socket) *sessionManager {
	return &sessionManager{socket: channel}
}

func (m *sessionManager) handle(parent context.Context, incoming message) {
	switch incoming.Type {
	case messageSessionStart:
		m.start(parent, incoming)
	case messageInput:
		m.input(incoming)
	case messageResize:
		m.resize(incoming)
	case messageSessionClose:
		m.close(incoming.Reason)
	}
}

func (m *sessionManager) start(parent context.Context, incoming message) {
	m.mu.Lock()
	if m.current != nil {
		m.mu.Unlock()
		_ = m.socket.write(message{Type: messageError, SessionID: incoming.SessionID, Reason: "A terminal session is already active"})
		return
	}

	cols := clamp(incoming.Cols, 20, 400)
	rows := clamp(incoming.Rows, 5, 200)

	command, err := shellCommand()
	if err != nil {
		m.mu.Unlock()
		_ = m.socket.write(message{Type: messageError, SessionID: incoming.SessionID, Reason: err.Error()})
		return
	}
	command.Env = terminalEnvironment(cols, rows)

	pseudoTerminal, err := startPTY(command, cols, rows)
	if err != nil {
		m.mu.Unlock()
		_ = m.socket.write(message{Type: messageError, SessionID: incoming.SessionID, Reason: "Unable to start shell PTY: " + err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(parent, maxSessionDuration)
	current := &terminalSession{
		id:      incoming.SessionID,
		pty:     pseudoTerminal,
		command: command,
		cancel:  cancel,
	}
	m.current = current
	m.mu.Unlock()

	go m.streamOutput(current)
	go func() {
		err := waitProcess(ctx, command)
		reason := "Shell exited"
		if errors.Is(err, context.DeadlineExceeded) {
			reason = "Maximum terminal duration reached"
		} else if errors.Is(err, context.Canceled) {
			reason = "Terminal session closed"
		} else if err != nil {
			reason = "Shell exited: " + err.Error()
		}
		_ = m.socket.write(message{Type: messageExit, SessionID: current.id, Reason: reason})
		m.finish(current)
	}()
}

func terminalEnvironment(cols, rows int) []string {
	environment := append([]string{}, os.Environ()...)
	environment = setEnvironmentValue(environment, "TERM", "xterm-256color")
	environment = setEnvironmentValue(environment, "COLORTERM", "truecolor")
	environment = setEnvironmentValue(environment, "COLUMNS", strconv.Itoa(cols))
	environment = setEnvironmentValue(environment, "LINES", strconv.Itoa(rows))
	return environment
}

func setEnvironmentValue(environment []string, key, value string) []string {
	prefix := key + "="
	filtered := environment[:0]
	for _, entry := range environment {
		if !strings.HasPrefix(entry, prefix) {
			filtered = append(filtered, entry)
		}
	}
	return append(filtered, prefix+value)
}

func waitProcess(ctx context.Context, command *exec.Cmd) error {
	done := make(chan error, 1)
	go func() {
		done <- command.Wait()
	}()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		_ = terminateProcess(command)
		<-done
		return ctx.Err()
	}
}

func (m *sessionManager) streamOutput(current *terminalSession) {
	buffer := make([]byte, 32*1024)
	for {
		count, err := current.pty.Read(buffer)
		if count > 0 {
			_ = m.socket.write(message{
				Type: messageOutput, SessionID: current.id,
				Data: base64.StdEncoding.EncodeToString(buffer[:count]),
			})
		}
		if err != nil {
			if !isExpectedPTYReadError(err) {
				_ = m.socket.write(message{Type: messageError, SessionID: current.id, Reason: err.Error()})
			}
			return
		}
	}
}

func (m *sessionManager) input(incoming message) {
	data, err := base64.StdEncoding.DecodeString(incoming.Data)
	if err != nil || len(data) > maxMessageBytes {
		return
	}
	m.mu.Lock()
	current := m.current
	m.mu.Unlock()
	if current == nil || current.id != incoming.SessionID {
		return
	}
	if _, err := current.pty.Write(data); err != nil {
		_ = m.socket.write(message{Type: messageError, SessionID: current.id, Reason: err.Error()})
	}
}

func (m *sessionManager) resize(incoming message) {
	m.mu.Lock()
	current := m.current
	m.mu.Unlock()
	if current == nil || current.id != incoming.SessionID {
		return
	}
	_ = current.pty.Resize(clamp(incoming.Cols, 20, 400), clamp(incoming.Rows, 5, 200))
}

func (m *sessionManager) close(reason string) {
	m.mu.Lock()
	current := m.current
	m.mu.Unlock()
	if current == nil {
		return
	}
	current.once.Do(func() {
		current.cancel()
		_ = terminateProcess(current.command)
		_ = current.pty.Close()
	})
}

func (m *sessionManager) finish(current *terminalSession) {
	current.once.Do(func() {
		current.cancel()
		_ = current.pty.Close()
	})
	m.mu.Lock()
	if m.current == current {
		m.current = nil
	}
	m.mu.Unlock()
}

func shellCommand() (*exec.Cmd, error) {
	if runtime.GOOS == "windows" {
		if path, err := exec.LookPath("powershell.exe"); err == nil {
			return exec.Command(path, "-NoLogo", "-NoProfile"), nil
		}
		if path, err := exec.LookPath("cmd.exe"); err == nil {
			return exec.Command(path), nil
		}
		return nil, fmt.Errorf("no supported Windows shell was found")
	}

	candidates := []string{
		strings.TrimSpace(os.Getenv("SHELL")),
		"/bin/bash",
		"/bin/sh",
	}
	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if _, exists := seen[candidate]; exists {
			continue
		}
		seen[candidate] = struct{}{}

		path, err := exec.LookPath(candidate)
		if err == nil {
			return exec.Command(path, "-l"), nil
		}
	}

	return nil, fmt.Errorf("no supported Unix shell was found")
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
