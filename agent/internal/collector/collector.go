package collector

import (
	"sync"
	"time"
)

type Metrics struct {
	OSFamily                  string    `json:"os_family"`
	OSName                    string    `json:"os_name"`
	CPUCores                  int       `json:"cpu_cores"`
	CPUUsage                  float64   `json:"cpu_usage"`
	MemoryTotal               uint64    `json:"memory_total"`
	MemoryUsed                uint64    `json:"memory_used"`
	NetIn                     uint64    `json:"net_in"`     // bytes per sec
	NetOut                    uint64    `json:"net_out"`    // bytes per sec
	DiskRead                  uint64    `json:"disk_read"`  // bytes per sec
	DiskWrite                 uint64    `json:"disk_write"` // bytes per sec
	DiskTotal                 uint64    `json:"disk_total"`
	DiskUsed                  uint64    `json:"disk_used"`
	DiskUsage                 float64   `json:"disk_usage"`
	Snapshot                  *Snapshot `json:"snapshot,omitempty"`
	Version                   string    `json:"version"`
	TerminalChannelConnected  bool      `json:"terminal_channel_connected"`
	TerminalChannelError      string    `json:"terminal_channel_error,omitempty"`
	TerminalSupported         bool      `json:"terminal_supported"`
	TerminalUnsupportedReason string    `json:"terminal_unsupported_reason,omitempty"`
	RemoteUninstallSupported  bool      `json:"remote_uninstall_supported"`
}

var (
	metricsMu     sync.Mutex
	lastNetIn     uint64
	lastNetOut    uint64
	lastDiskRead  uint64
	lastDiskWrite uint64
	lastTime      time.Time
	isFirst       = true
)

func init() {
	initPlatformMetrics()
}

// Collect gathers the current system metrics.
func Collect() (*Metrics, error) {
	pm, err := collectPlatformMetrics()
	if err != nil {
		return nil, err
	}

	now := time.Now()
	var netInRate, netOutRate, diskReadRate, diskWriteRate uint64

	metricsMu.Lock()
	if !isFirst {
		duration := now.Sub(lastTime).Seconds()
		if duration > 0 {
			if pm.NetIn >= lastNetIn {
				netInRate = uint64(float64(pm.NetIn-lastNetIn) / duration)
			}
			if pm.NetOut >= lastNetOut {
				netOutRate = uint64(float64(pm.NetOut-lastNetOut) / duration)
			}
			if pm.DiskRead >= lastDiskRead {
				diskReadRate = uint64(float64(pm.DiskRead-lastDiskRead) / duration)
			}
			if pm.DiskWrite >= lastDiskWrite {
				diskWriteRate = uint64(float64(pm.DiskWrite-lastDiskWrite) / duration)
			}
		}
	} else {
		isFirst = false
	}

	lastNetIn = pm.NetIn
	lastNetOut = pm.NetOut
	lastDiskRead = pm.DiskRead
	lastDiskWrite = pm.DiskWrite
	lastTime = now
	metricsMu.Unlock()

	return &Metrics{
		OSFamily:    currentOSFamily(),
		OSName:      pm.OSName,
		CPUCores:    pm.CPUCores,
		CPUUsage:    pm.CPUUsage,
		MemoryTotal: pm.MemoryTotal,
		MemoryUsed:  pm.MemoryUsed,
		NetIn:       netInRate,
		NetOut:      netOutRate,
		DiskRead:    diskReadRate,
		DiskWrite:   diskWriteRate,
		DiskTotal:   pm.DiskTotal,
		DiskUsed:    pm.DiskUsed,
		DiskUsage:   pm.DiskUsage,
	}, nil
}
