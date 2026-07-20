//go:build !linux

package uninstall

import (
	"context"
	"fmt"
)

// platformSupported returns false until a safe detached helper exists for the
// current non-Linux platform.
func platformSupported() bool {
	return false
}

// preparePlatform rejects remote uninstall on OSes that have not yet received
// a safe detached-helper implementation.
func preparePlatform(req Request) (*Prepared, error) {
	return nil, fmt.Errorf("remote Agent uninstall is currently supported only on Linux")
}

// activatePlatform is unreachable on unsupported platforms but exists so the
// shared package compiles for every Agent build target.
func activatePlatform(prepared *Prepared) error {
	return fmt.Errorf("remote Agent uninstall is currently supported only on Linux")
}

// runPlatformHelper rejects helper mode on unsupported platforms.
func runPlatformHelper(requestPath string) error {
	return fmt.Errorf("remote Agent uninstall helper is unsupported on this platform")
}

// confirmWithRetry is not used on unsupported platforms. It is defined to keep
// the shared Confirm API buildable across all release targets.
func confirmWithRetry(ctx context.Context, req Request, status, errorMessage string) error {
	return fmt.Errorf("remote Agent uninstall confirmation is unsupported on this platform")
}
