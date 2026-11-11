package collector

import (
	"fmt"
	"runtime"
	"sync"
	"testing"
)

func TestCollect_BasicSanity(t *testing.T) {
	m, err := Collect()
	if err != nil {
		t.Fatalf("Collect() returned error: %v", err)
	}
	if m.OSFamily == "" {
		t.Error("expected non-empty OSFamily")
	}
	if m.OSName == "" {
		t.Error("expected non-empty OSName")
	}
	if m.CPUCores <= 0 {
		t.Errorf("expected CPUCores > 0, got %d", m.CPUCores)
	}
	if m.CPUUsage < 0 || m.CPUUsage > 100 {
		t.Errorf("expected CPUUsage in [0, 100], got %.2f", m.CPUUsage)
	}
	if m.MemoryTotal == 0 {
		t.Error("expected MemoryTotal > 0")
	}
	if m.DiskTotal == 0 {
		t.Error("expected DiskTotal > 0")
	}
}

func TestCollect_ConcurrentSafety(t *testing.T) {
	var wg sync.WaitGroup
	errs := make(chan error, 8*15)

	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range 15 {
				m, err := Collect()
				if err != nil {
					errs <- err
					return
				}
				if m.CPUUsage < 0 || m.CPUUsage > 100 {
					errs <- fmt.Errorf("CPUUsage out of range: %.2f", m.CPUUsage)
				}
			}
		}()
	}

	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent Collect() failed: %v", err)
		}
	}
}

func TestCollectPackageUpdate_NonLinux(t *testing.T) {
	if runtime.GOOS == "linux" {
		t.Skip("linux executes apt-get package check")
	}
	if got := collectPackageUpdate(); got != 0 {
		t.Errorf("expected package update count 0 on %s, got %d", runtime.GOOS, got)
	}
}
