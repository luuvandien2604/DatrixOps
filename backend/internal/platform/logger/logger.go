package logger

import (
	"log/slog"
	"os"
)

// New creates a structured JSON logger using Go's standard slog.
func New() *slog.Logger {
	opts := &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}

	handler := slog.NewJSONHandler(os.Stdout, opts)
	return slog.New(handler)
}
