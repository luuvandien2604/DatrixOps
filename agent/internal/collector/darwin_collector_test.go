//go:build darwin

package collector

import (
	"fmt"
	"runtime"
	"strings"
	"sync"
	"testing"
)

func TestParseDarwinTopProcessesOutput(t *testing.T) {
	sample := `
    1   8.8  0.1 root             launchd
   96   0.0  0.1 root             logd
  168  36.2  0.5 _windowserver    WindowServer
 7726   0.4  0.3 luuvandien       Keychain Circle Notification
  999   0.0  0.0 nobody           idle_ignored
  abc   5.0  1.0 root             malformed_pid
  500   2.5  0.8 _driverkit       IOUserBluetoothSerialDriver
`
	procs := parseDarwinTopProcessesOutput(sample)
	if len(procs) != 4 {
		t.Fatalf("expected 4 filtered processes, got %d (%+v)", len(procs), procs)
	}

	if procs[0].PID != 168 || procs[0].Name != "WindowServer" || procs[0].CPU != 36.2 || procs[0].User != "_windowserver" {
		t.Errorf("unexpected top process[0]: %+v", procs[0])
	}
	if procs[1].PID != 1 || procs[1].Name != "launchd" {
		t.Errorf("unexpected top process[1]: %+v", procs[1])
	}
	if procs[2].PID != 500 || procs[2].Name != "IOUserBluetoothSerialDriver" {
		t.Errorf("unexpected top process[2]: %+v", procs[2])
	}
	if procs[3].PID != 7726 || procs[3].Name != "Keychain Circle Notification" || procs[3].User != "luuvandien" {
		t.Errorf("unexpected top process[3] with spaces: %+v", procs[3])
	}

	// Verify top-20 cap when >20 active processes exist
	var bulk strings.Builder
	for i := 1; i <= 30; i++ {
		fmt.Fprintf(&bulk, "%5d %5.1f  0.2 user%d proc_%d\n", 100+i, float64(i), i, i)
	}
	capped := parseDarwinTopProcessesOutput(bulk.String())
	if len(capped) != 20 {
		t.Fatalf("expected cap at 20 processes, got %d", len(capped))
	}
	if capped[0].CPU != 30.0 || capped[19].CPU != 11.0 {
		t.Errorf("unexpected sort/cap bounds: first=%.1f last=%.1f", capped[0].CPU, capped[19].CPU)
	}
}

func TestParseDarwinDiskIOCountersOutput(t *testing.T) {
	sample := `
+-o IOBlockStorageDriver  <class IOBlockStorageDriver, id 0x10000071d>
    {
      "IOClass" = "IOBlockStorageDriver"
      "Statistics" = {"Operations (Write)"=14216766,"Bytes (Read)"=908856229888,"Bytes (Write)"=278146850816,"Operations (Read)"=57278165}
    }
+-o IOBlockStorageDriver  <class IOBlockStorageDriver, id 0x100000999>
    {
      "Statistics" = {"Bytes (Read)" = 1000, "Bytes (Write)" = 2000}
    }
`
	readBytes, writeBytes := parseDarwinDiskIOCountersOutput(sample)
	wantRead := uint64(908856229888 + 1000)
	wantWrite := uint64(278146850816 + 2000)
	if readBytes != wantRead || writeBytes != wantWrite {
		t.Fatalf("got read=%d write=%d, want read=%d write=%d", readBytes, writeBytes, wantRead, wantWrite)
	}

	emptyRead, emptyWrite := parseDarwinDiskIOCountersOutput("")
	if emptyRead != 0 || emptyWrite != 0 {
		t.Fatalf("expected zeros on empty ioreg output, got %d/%d", emptyRead, emptyWrite)
	}
}

func TestParseDarwinNetstatOutput(t *testing.T) {
	sample := `
Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll Drop
lo0        16384 <Link#1>                       3459016     0 5234343806  3459016     0 5234343806     0   0
lo0        16384 127           127.0.0.1        3459016     - 5234343806  3459016     - 5234343806     -   -
gif0*      1280  <Link#2>                             0     -          0        0     0          0     0   -
en0        1500  <Link#6>    00:8a:76:e7:4f:1c 68587337    12 76399238968 18865870     0 12558746801     0 33983
en0        1500  192.168.1     192.168.1.153   68587337     - 76399238968 18865870     - 12558746801     -   -
en0        1500  <Link#6>    00:8a:76:e7:4f:1c        1     0          1        1     0          1     0   0
`
	stats := parseDarwinNetstatOutput(sample)
	if len(stats) != 3 {
		t.Fatalf("expected 3 unique interface counters (lo0, gif0, en0), got %d (%+v)", len(stats), stats)
	}
	if stats[0].Name != "lo0" || stats[0].BytesRecv != 5234343806 || stats[0].BytesSent != 5234343806 {
		t.Errorf("unexpected lo0 counter: %+v", stats[0])
	}
	if stats[1].Name != "gif0" || stats[1].Errin != 0 || stats[1].Dropin != 0 {
		t.Errorf("unexpected gif0* counter: %+v", stats[1])
	}
	if stats[2].Name != "en0" || stats[2].BytesRecv != 76399238968 || stats[2].BytesSent != 12558746801 || stats[2].Errin != 12 || stats[2].Dropin != 33983 {
		t.Errorf("unexpected en0 counter: %+v", stats[2])
	}
}

func TestDarwinLiveTelemetry(t *testing.T) {
	hostInfo, err := collectPlatformHostInfo()
	if err != nil {
		t.Fatalf("collectPlatformHostInfo() error: %v", err)
	}
	if hostInfo.Platform != "darwin" {
		t.Errorf("expected platform 'darwin', got %q", hostInfo.Platform)
	}
	if hostInfo.PlatformVersion == "" || hostInfo.KernelVersion == "" || hostInfo.BootTime == 0 {
		t.Errorf("incomplete darwin host info: %+v", hostInfo)
	}

	cpuDetails := collectPlatformCPUDetails()
	if cpuDetails.LogicalCores <= 0 || cpuDetails.PhysicalCores <= 0 {
		t.Errorf("expected positive CPU counts, got %+v", cpuDetails)
	}

	memTotal, memUsed, ok := readDarwinMemory()
	if !ok || memTotal == 0 || memUsed == 0 || memUsed > memTotal {
		t.Errorf("unexpected darwin memory values: ok=%v used=%d total=%d", ok, memUsed, memTotal)
	}

	disks := collectPlatformInventoryDisks()
	if len(disks) == 0 {
		t.Error("expected at least one mounted filesystem on macOS")
	}

	procs := collectPlatformTopProcesses()
	if len(procs) == 0 {
		t.Error("expected at least one active process on macOS")
	}

	m, err := Collect()
	if err != nil {
		t.Fatalf("Collect() failed: %v", err)
	}
	if m.OSFamily != "macos" || !strings.HasPrefix(m.OSName, "darwin ") {
		t.Errorf("unexpected OS metadata: family=%q name=%q", m.OSFamily, m.OSName)
	}
}

func TestDarwinConcurrentStressWithGC(t *testing.T) {
	// Stress-test stack copying + GC scanning concurrently across telemetry paths
	// on small goroutine stacks (no purego/uintptr stack corruption).
	var wg sync.WaitGroup
	for g := range 6 {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for i := range 40 {
				var recurse func(depth int)
				recurse = func(depth int) {
					if depth > 0 {
						recurse(depth - 1)
						return
					}
					if _, err := Collect(); err != nil {
						t.Errorf("goroutine %d iter %d Collect failed: %v", id, i, err)
					}
					_, _, ok := readDarwinMemory()
					if !ok {
						t.Errorf("goroutine %d iter %d readDarwinMemory failed", id, i)
					}
					_ = collectInventory("stress-test")
					if i%10 == 0 {
						_ = collectPlatformTopProcesses()
						runtime.GC()
					}
				}
				// Grow & shrink goroutine stack repeatedly across Mach & sysctl calls.
				recurse((i % 5) * 4)
			}
		}(g)
	}
	wg.Wait()
}
