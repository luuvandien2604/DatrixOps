//go:build !windows

package terminal

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"syscall"

	"github.com/creack/pty"
)

type unixPTY struct {
	file *os.File
}

func startPTY(command *exec.Cmd, cols, rows int) (terminalPTY, error) {
	file, err := pty.StartWithSize(
		command,
		&pty.Winsize{
			Rows: uint16(rows),
			Cols: uint16(cols),
		},
	)
	if err != nil {
		return nil, err
	}
	return &unixPTY{file: file}, nil
}

func (p *unixPTY) Read(buffer []byte) (int, error) {
	return p.file.Read(buffer)
}

func (p *unixPTY) Write(buffer []byte) (int, error) {
	return p.file.Write(buffer)
}

func (p *unixPTY) Resize(cols, rows int) error {
	return pty.Setsize(
		p.file,
		&pty.Winsize{
			Rows: uint16(rows),
			Cols: uint16(cols),
		},
	)
}

func (p *unixPTY) Close() error {
	return p.file.Close()
}

func terminateProcess(command *exec.Cmd) error {
	if command == nil || command.Process == nil {
		return nil
	}

	// pty.StartWithSize starts the shell as a new session leader. Killing the
	// negative PID therefore terminates the entire terminal process group,
	// including child commands started from the shell.
	err := syscall.Kill(-command.Process.Pid, syscall.SIGKILL)
	if errors.Is(err, syscall.ESRCH) {
		return nil
	}
	return err
}

func isExpectedPTYReadError(err error) bool {
	return errors.Is(err, io.EOF) ||
		errors.Is(err, os.ErrClosed) ||
		errors.Is(err, syscall.EIO)
}
