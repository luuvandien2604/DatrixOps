package terminal

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"sync"
	"time"

	"github.com/charmbracelet/x/xpty"
)

const maxSessionDuration = 30 * time.Minute

type terminalSession struct {
	id      string
	pty     xpty.Pty
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
	pseudoTerminal, err := xpty.NewPty(cols, rows)
	if err != nil {
		m.mu.Unlock()
		_ = m.socket.write(message{Type: messageError, SessionID: incoming.SessionID, Reason: "Unable to create terminal: " + err.Error()})
		return
	}
	command, err := shellCommand()
	if err != nil {
		m.mu.Unlock()
		_ = pseudoTerminal.Close()
		_ = m.socket.write(message{Type: messageError, SessionID: incoming.SessionID, Reason: err.Error()})
		return
	}
	command.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"COLUMNS="+strconv.Itoa(cols),
		"LINES="+strconv.Itoa(rows),
	)
	if err := pseudoTerminal.Start(command); err != nil {
		m.mu.Unlock()
		_ = pseudoTerminal.Close()
		_ = m.socket.write(message{Type: messageError, SessionID: incoming.SessionID, Reason: "Unable to start shell: " + err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(parent, maxSessionDuration)
	current := &terminalSession{id: incoming.SessionID, pty: pseudoTerminal, command: command, cancel: cancel}
	m.current = current
	m.mu.Unlock()

	go m.streamOutput(current)
	go func() {
		err := xpty.WaitProcess(ctx, command)
		reason := "Shell exited"
		if ctx.Err() == context.DeadlineExceeded {
			reason = "Maximum terminal duration reached"
		} else if err != nil {
			reason = "Shell exited: " + err.Error()
		}
		_ = m.socket.write(message{Type: messageExit, SessionID: current.id, Reason: reason})
		m.finish(current)
	}()
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
			if err != io.EOF {
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
		if current.command.Process != nil {
			_ = current.command.Process.Kill()
		}
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
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/sh"
	}
	path, err := exec.LookPath(shell)
	if err != nil {
		return nil, fmt.Errorf("resolve shell: %w", err)
	}
	return exec.Command(path, "-l"), nil
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
