package collector

import (
	"testing"
	"time"
)

func TestStatus_PacketLossFloatBoundary(t *testing.T) {
	tests := []struct {
		name       string
		packetLoss float64
		wantStatus string
	}{
		{"0% loss", 0.0, "healthy"},
		{"19.9% loss", 19.9, "healthy"},
		{"20% loss (1/5 lost)", 20.0, "warning"},
		{"39.9% loss", 39.9, "warning"},
		{"40% loss (2/5 lost)", 40.0, "critical"},
		{"60% loss (3/5 lost)", 60.0, "critical"},
		{"100% loss (5/5 lost)", 100.0, "critical"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			status, _ := calculateNetworkStatus(
				"eth0",
				true,
				true,
				20.0,
				15.0,
				tc.packetLoss,
				0,
				0,
				0,
			)
			if status != tc.wantStatus {
				t.Errorf("calculateNetworkStatus with loss %.1f%% = %s, want %s", tc.packetLoss, status, tc.wantStatus)
			}
		})
	}
}

func TestDelta_CounterReset(t *testing.T) {
	// Normal increment
	if delta := safeDelta(150, 100); delta != 50 {
		t.Errorf("safeDelta(150, 100) = %d, want 50", delta)
	}

	// Counter reset (e.g. current < last after interface driver reload)
	// Must NOT underflow to ~1.8e19
	if delta := safeDelta(5, 100); delta != 5 {
		t.Errorf("safeDelta(5, 100) = %d, want 5 (must not underflow uint64)", delta)
	}

	// Identical
	if delta := safeDelta(100, 100); delta != 0 {
		t.Errorf("safeDelta(100, 100) = %d, want 0", delta)
	}
}

func TestStatus_TransientVsPersistentError(t *testing.T) {
	// 0 consecutive errors -> healthy
	status, _ := calculateNetworkStatus("eth0", true, true, 20.0, 15.0, 0.0, 0, 0, 0)
	if status != "healthy" {
		t.Errorf("expected healthy with 0 errors, got %s", status)
	}

	// 1 consecutive error -> warning (transient error dampening)
	status, _ = calculateNetworkStatus("eth0", true, true, 20.0, 15.0, 0.0, 0, 0, 1)
	if status != "warning" {
		t.Errorf("expected warning with 1 transient error, got %s", status)
	}

	// 2 consecutive errors -> critical (persistent hardware/cable issue)
	status, _ = calculateNetworkStatus("eth0", true, true, 20.0, 15.0, 0.0, 0, 0, 2)
	if status != "critical" {
		t.Errorf("expected critical with 2 consecutive errors, got %s", status)
	}

	// 5 consecutive errors -> critical
	status, _ = calculateNetworkStatus("eth0", true, true, 20.0, 15.0, 0.0, 0, 0, 5)
	if status != "critical" {
		t.Errorf("expected critical with 5 consecutive errors, got %s", status)
	}
}

func TestStatus_FirstTickAfterRestart(t *testing.T) {
	// Reset state to simulate agent restart
	netStateMu.Lock()
	isAgentFirstTick = true
	lastIfaceCounters = make(map[string]ifaceCounterState)
	consecutiveErrors = make(map[string]int)
	netStateMu.Unlock()

	// Simulate first tick with non-zero boot cumulative counters
	now := time.Now()
	netStateMu.Lock()
	if isAgentFirstTick {
		lastIfaceCounters["eth0"] = ifaceCounterState{
			rxErrors:  50,
			txErrors:  20,
			rxDropped: 300,
			txDropped: 100,
			lastSeen:  now,
		}
	}
	isAgentFirstTick = false
	netStateMu.Unlock()

	// In the first tick, delta is 0, so calculateNetworkStatus should be healthy
	status, _ := calculateNetworkStatus("eth0", true, true, 25.0, 10.0, 0.0, 0, 0, 0)
	if status != "healthy" {
		t.Errorf("First tick after restart should be healthy (baseline set), got %s", status)
	}
}

func TestStatus_DNSAndInternetOutages(t *testing.T) {
	// Internet down
	status, _ := calculateNetworkStatus("eth0", false, true, 20.0, 15.0, 0.0, 0, 0, 0)
	if status != "critical" {
		t.Errorf("expected critical when internet down, got %s", status)
	}

	// DNS down
	status, _ = calculateNetworkStatus("eth0", true, false, 20.0, 15.0, 0.0, 0, 0, 0)
	if status != "critical" {
		t.Errorf("expected critical when DNS down, got %s", status)
	}

	// Slow DNS (> 500ms) -> warning
	status, _ = calculateNetworkStatus("eth0", true, true, 650.0, 15.0, 0.0, 0, 0, 0)
	if status != "warning" {
		t.Errorf("expected warning when DNS is slow (>500ms), got %s", status)
	}
}

func TestParseHexIPv4(t *testing.T) {
	// 0101A8C0 -> 192.168.1.1
	if ip := parseHexIPv4("0101A8C0"); ip != "192.168.1.1" {
		t.Errorf("parseHexIPv4('0101A8C0') = %s, want 192.168.1.1", ip)
	}

	// 0100A8C0 -> 192.168.0.1
	if ip := parseHexIPv4("0100A8C0"); ip != "192.168.0.1" {
		t.Errorf("parseHexIPv4('0100A8C0') = %s, want 192.168.0.1", ip)
	}

	// 00000000 -> ""
	if ip := parseHexIPv4("00000000"); ip != "" {
		t.Errorf("parseHexIPv4('00000000') = %s, want empty string", ip)
	}

	// Invalid
	if ip := parseHexIPv4("xyz"); ip != "" {
		t.Errorf("parseHexIPv4('xyz') = %s, want empty string", ip)
	}
}

func TestParsePingOutput_CrossPlatform(t *testing.T) {
	// 1. Linux ping
	linuxPing := `PING 192.168.1.1 (192.168.1.1) 56(84) bytes of data.
64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=0.441 ms
--- 192.168.1.1 ping statistics ---
5 packets transmitted, 5 received, 0% packet loss, time 4004ms
rtt min/avg/max/mdev = 0.441/14.500/0.514/0.029 ms`

	lat, loss := parsePingOutput(linuxPing)
	if loss != 0.0 || lat != 14.5 {
		t.Errorf("Linux ping: got lat=%.1f, loss=%.1f; want lat=14.5, loss=0.0", lat, loss)
	}

	// 2. macOS ping (with 20% loss)
	macPing := `PING 192.168.1.1 (192.168.1.1): 56 data bytes
64 bytes from 192.168.1.1: icmp_seq=0 ttl=64 time=0.441 ms
--- 192.168.1.1 ping statistics ---
5 packets transmitted, 4 packets received, 20.0% packet loss
round-trip min/avg/max/stddev = 0.293/8.250/0.619/0.122 ms`

	lat, loss = parsePingOutput(macPing)
	if loss != 20.0 || lat != 8.25 {
		t.Errorf("macOS ping: got lat=%.2f, loss=%.1f; want lat=8.25, loss=20.0", lat, loss)
	}

	// 3. Windows ping (0% loss)
	winPing0 := `Pinging 192.168.1.1 with 32 bytes of data:
Reply from 192.168.1.1: bytes=32 time=2ms TTL=64

Ping statistics for 192.168.1.1:
    Packets: Sent = 5, Received = 5, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 1ms, Maximum = 3ms, Average = 2ms`

	lat, loss = parsePingOutput(winPing0)
	if loss != 0.0 || lat != 2.0 {
		t.Errorf("Windows ping (0%%): got lat=%.1f, loss=%.1f; want lat=2.0, loss=0.0", lat, loss)
	}

	// 4. Windows ping (40% loss)
	winPing40 := `Pinging 192.168.1.1 with 32 bytes of data:
Request timed out.

Ping statistics for 192.168.1.1:
    Packets: Sent = 5, Received = 3, Lost = 2 (40% loss),
Approximate round trip times in milli-seconds:
    Minimum = 1ms, Maximum = 9ms, Average = 5ms`

	lat, loss = parsePingOutput(winPing40)
	if loss != 40.0 || lat != 5.0 {
		t.Errorf("Windows ping (40%%): got lat=%.1f, loss=%.1f; want lat=5.0, loss=40.0", lat, loss)
	}
}
