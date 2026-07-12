package collector

import (
	"fmt"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
)

type Metrics struct {
	OSName      string  `json:"os_name"`
	CPUCores    int     `json:"cpu_cores"`
	CPUUsage    float64 `json:"cpu_usage"`
	MemoryTotal uint64  `json:"memory_total"`
	MemoryUsed  uint64  `json:"memory_used"`
}

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

	// 3. Get CPU Usage (Interval = 0 returns immediately, or we can use 1 second)
	// For agent heartbeat, a 1-second sample is better to get actual usage instead of since-boot.
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

	return &Metrics{
		OSName:      osName,
		CPUCores:    cpuCores,
		CPUUsage:    cpuUsage,
		MemoryTotal: vMem.Total,
		MemoryUsed:  vMem.Used,
	}, nil
}
