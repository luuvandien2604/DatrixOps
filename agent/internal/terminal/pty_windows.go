//go:build windows

package terminal

import (
	"errors"
	"io"
	"os"
	"os/exec"

	"github.com/charmbracelet/x/xpty"
)

type windowsPTY struct {
	pty xpty.Pty
}

func startPTY(command *exec.Cmd, cols, rows int) (terminalPTY, error) {
	pseudoTerminal, err := xpty.NewPty(cols, rows)
	if err != nil {
		return nil, err
	}
	if err := pseudoTerminal.Start(command); err != nil {
		_ = pseudoTerminal.Close()
		return nil, err
	}
	return &windowsPTY{pty: pseudoTerminal}, nil
}

func (p *windowsPTY) Read(buffer []byte) (int, error) {
	return p.pty.Read(buffer)
}

func (p *windowsPTY) Write(buffer []byte) (int, error) {
	return p.pty.Write(buffer)
}

func (p *windowsPTY) Resize(cols, rows int) error {
	return p.pty.Resize(cols, rows)
}

func (p *windowsPTY) Close() error {
	return p.pty.Close()
}

func terminateProcess(command *exec.Cmd) error {
	if command == nil || command.Process == nil {
		return nil
	}
	err := command.Process.Kill()
	if errors.Is(err, os.ErrProcessDone) {
		return nil
	}
	return err
}

func isExpectedPTYReadError(err error) bool {
	return errors.Is(err, io.EOF) || errors.Is(err, os.ErrClosed)
}
