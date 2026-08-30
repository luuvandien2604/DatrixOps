package collector

import (
	"fmt"
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
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
	lastNetIn     uint64
	lastNetOut    uint64
	lastDiskRead  uint64
	lastDiskWrite uint64
	lastTime      time.Time
	isFirst       = true
)

func init() {
	// Initialize gopsutil CPU times snapshot so subsequent cpu.Percent(0, false) calls are non-blocking and instant
	_, _ = cpu.Percent(0, false)
}

// Collect gathers the current system metrics.
func Collect() (*Metrics, error) {
	// 1. Get Host Info (with fallback for restricted virtual environments)
	osName := runtime.GOOS
	if hostInfo, err := host.Info(); err == nil && hostInfo != nil {
		osName = fmt.Sprintf("%s %s", hostInfo.Platform, hostInfo.PlatformVersion)
	}

	// 2. Get CPU Cores
	cpuCores := runtime.NumCPU()
	if counts, err := cpu.Counts(true); err == nil && counts > 0 {
		cpuCores = counts
	}

	// 3. Get CPU Usage (non-blocking, calculates usage since previous heartbeat tick)
	cpuUsageStats, err := cpu.Percent(0, false)
	var cpuUsage float64
	if err == nil && len(cpuUsageStats) > 0 {
		cpuUsage = cpuUsageStats[0]
	}

	// 4. Get Memory Info
	var memTotal, memUsed uint64
	if vMem, err := mem.VirtualMemory(); err == nil && vMem != nil {
		memTotal = vMem.Total
		memUsed = vMem.Used
	}

	// 5. Get Network IO
	netIO, err := net.IOCounters(false) // false = all interfaces combined
	var currentNetIn, currentNetOut uint64
	if err == nil && len(netIO) > 0 {
		currentNetIn = netIO[0].BytesRecv
		currentNetOut = netIO[0].BytesSent
	}

	// 6. Get Disk IO
	diskIO, err := disk.IOCounters()
	var currentDiskRead, currentDiskWrite uint64
	if err == nil {
		for _, io := range diskIO {
			currentDiskRead += io.ReadBytes
			currentDiskWrite += io.WriteBytes
		}
	}
	systemVolume := "/"
	if runtime.GOOS == "windows" {
		systemVolume = `C:\`
	}
	var diskTotal, diskUsed uint64
	var diskUsage float64
	if usage, usageErr := disk.Usage(systemVolume); usageErr == nil {
		diskTotal = usage.Total
		diskUsed = usage.Used
		diskUsage = usage.UsedPercent
	}

	now := time.Now()
	var netInRate, netOutRate, diskReadRate, diskWriteRate uint64

	if !isFirst {
		duration := now.Sub(lastTime).Seconds()
		if duration > 0 {
			if currentNetIn >= lastNetIn {
				netInRate = uint64(float64(currentNetIn-lastNetIn) / duration)
			}
			if currentNetOut >= lastNetOut {
				netOutRate = uint64(float64(currentNetOut-lastNetOut) / duration)
			}
			if currentDiskRead >= lastDiskRead {
				diskReadRate = uint64(float64(currentDiskRead-lastDiskRead) / duration)
			}
			if currentDiskWrite >= lastDiskWrite {
				diskWriteRate = uint64(float64(currentDiskWrite-lastDiskWrite) / duration)
			}
		}
	} else {
		isFirst = false
	}

	lastNetIn = currentNetIn
	lastNetOut = currentNetOut
	lastDiskRead = currentDiskRead
	lastDiskWrite = currentDiskWrite
	lastTime = now

	return &Metrics{
		OSFamily:    currentOSFamily(),
		OSName:      osName,
		CPUCores:    cpuCores,
		CPUUsage:    cpuUsage,
		MemoryTotal: memTotal,
		MemoryUsed:  memUsed,
		NetIn:       netInRate,
		NetOut:      netOutRate,
		DiskRead:    diskReadRate,
		DiskWrite:   diskWriteRate,
		DiskTotal:   diskTotal,
		DiskUsed:    diskUsed,
		DiskUsage:   diskUsage,
	}, nil
}
