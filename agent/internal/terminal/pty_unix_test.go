//go:build !windows

package terminal

import "testing"

func TestPTYDimensionBoundsConversion(t *testing.T) {
	if got := ptyDimension(-1); got != 1 {
		t.Fatalf("negative dimension = %d", got)
	}
	if got := ptyDimension(120); got != 120 {
		t.Fatalf("normal dimension = %d", got)
	}
	if got := ptyDimension(1 << 20); got != ^uint16(0) {
		t.Fatalf("large dimension = %d", got)
	}
}
