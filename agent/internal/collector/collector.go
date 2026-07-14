package collector

import (
	"fmt"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
)

type Metrics struct {
	OSName      string  `json:"os_name"`
	CPUCores    int     `json:"cpu_cores"`
	CPUUsage    float64 `json:"cpu_usage"`
	MemoryTotal uint64  `json:"memory_total"`
	MemoryUsed  uint64  `json:"memory_used"`
	NetIn       uint64  `json:"net_in"`      // bytes per sec
	NetOut      uint64  `json:"net_out"`     // bytes per sec
	DiskRead    uint64    `json:"disk_read"`   // bytes per sec
	DiskWrite   uint64    `json:"disk_write"`  // bytes per sec
	Snapshot    *Snapshot `json:"snapshot,omitempty"`
}

var (
	lastNetIn     uint64
	lastNetOut    uint64
	lastDiskRead  uint64
	lastDiskWrite uint64
	lastTime      time.Time
	isFirst       = true
)

// Collect gathers the current system metrics.
func Collect() (*Metrics, error) {
	// 1. Get Host Info
	hostInfo, err := host.Info()
	if err != nil {
		return nil, fmt.Errorf("get host info: %w", err)
	}
	osName := fmt.Sprintf("%s %s", hostInfo.Platform, hostInfo.PlatformVersion)

	// 2. Get CPU Cores
	cpuCores, err := cpu.Counts(true)
	if err != nil {
		return nil, fmt.Errorf("get cpu cores: %w", err)
	}

	// 3. Get CPU Usage
	cpuUsageStats, err := cpu.Percent(time.Second, false)
	var cpuUsage float64
	if err == nil && len(cpuUsageStats) > 0 {
		cpuUsage = cpuUsageStats[0]
	}

	// 4. Get Memory Info
	vMem, err := mem.VirtualMemory()
	if err != nil {
		return nil, fmt.Errorf("get memory info: %w", err)
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
		OSName:      osName,
		CPUCores:    cpuCores,
		CPUUsage:    cpuUsage,
		MemoryTotal: vMem.Total,
		MemoryUsed:  vMem.Used,
		NetIn:       netInRate,
		NetOut:      netOutRate,
		DiskRead:    diskReadRate,
		DiskWrite:   diskWriteRate,
	}, nil
}
