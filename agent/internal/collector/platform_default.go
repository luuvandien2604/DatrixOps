//go:build !darwin

package collector

import (
	"context"
	"fmt"
	"runtime"
	"sort"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	gnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

func initPlatformMetrics() {
	// Initialize gopsutil CPU times snapshot so subsequent cpu.Percent(0, false) calls are non-blocking and instant
	_, _ = cpu.Percent(0, false)
}

func collectPlatformMetrics() (platformMetrics, error) {
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
	netIO, err := gnet.IOCounters(false) // false = all interfaces combined
	var currentNetIn, currentNetOut uint64
	if err == nil && len(netIO) > 0 {
		currentNetIn = netIO[0].BytesRecv
		currentNetOut = netIO[0].BytesSent
	}

	// 6. Get Disk IO
	diskIO, err := disk.IOCounters()
	var currentDiskRead, currentDiskWrite uint64
	if err == nil {
		for _, ioStat := range diskIO {
			currentDiskRead += ioStat.ReadBytes
			currentDiskWrite += ioStat.WriteBytes
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

	return platformMetrics{
		OSName:      osName,
		CPUCores:    cpuCores,
		CPUUsage:    cpuUsage,
		MemoryTotal: memTotal,
		MemoryUsed:  memUsed,
		NetIn:       currentNetIn,
		NetOut:      currentNetOut,
		DiskRead:    currentDiskRead,
		DiskWrite:   currentDiskWrite,
		DiskTotal:   diskTotal,
		DiskUsed:    diskUsed,
		DiskUsage:   diskUsage,
	}, nil
}

func collectPlatformHostInfo() (*platformHostInfo, error) {
	info, err := host.Info()
	if err != nil {
		return nil, err
	}
	return &platformHostInfo{
		Platform:        info.Platform,
		PlatformVersion: info.PlatformVersion,
		KernelVersion:   info.KernelVersion,
		Uptime:          info.Uptime,
		BootTime:        info.BootTime,
		Virtualization:  info.VirtualizationSystem,
	}, nil
}

func collectPlatformCPUDetails() platformCPUDetails {
	cpuInfo, _ := cpu.Info()
	logicalCores, _ := cpu.Counts(true)
	physicalCores, _ := cpu.Counts(false)
	var modelName string
	if len(cpuInfo) > 0 {
		modelName = cpuInfo[0].ModelName
	}
	return platformCPUDetails{
		ModelName:     modelName,
		LogicalCores:  logicalCores,
		PhysicalCores: physicalCores,
	}
}

func collectPlatformMemoryTotal() (uint64, error) {
	// The existing metrics collector is the source of truth for live usage.
	// Inventory records the installed capacity at snapshot time.
	memory, err := mem.VirtualMemory()
	if err != nil {
		return 0, err
	}
	return memory.Total, nil
}

func collectPlatformNetworkInterfaces() ([]platformNetInterface, error) {
	rawIfaces, err := gnet.Interfaces()
	if err != nil {
		return nil, err
	}
	result := make([]platformNetInterface, 0, len(rawIfaces))
	for _, iface := range rawIfaces {
		addrs := make([]string, 0, len(iface.Addrs))
		for _, a := range iface.Addrs {
			addrs = append(addrs, a.Addr)
		}
		result = append(result, platformNetInterface{
			Name:         iface.Name,
			HardwareAddr: iface.HardwareAddr,
			Flags:        iface.Flags,
			Addrs:        addrs,
		})
	}
	return result, nil
}

func collectPlatformNetIOCounters() ([]platformNetIOCounter, error) {
	rawIOs, err := gnet.IOCounters(true)
	if err != nil {
		return nil, err
	}
	result := make([]platformNetIOCounter, 0, len(rawIOs))
	for _, ioStat := range rawIOs {
		result = append(result, platformNetIOCounter{
			Name:        ioStat.Name,
			BytesRecv:   ioStat.BytesRecv,
			BytesSent:   ioStat.BytesSent,
			PacketsRecv: ioStat.PacketsRecv,
			PacketsSent: ioStat.PacketsSent,
			Errin:       ioStat.Errin,
			Errout:      ioStat.Errout,
			Dropin:      ioStat.Dropin,
			Dropout:     ioStat.Dropout,
		})
	}
	return result, nil
}

func collectPlatformInventoryDisks() []InventoryDisk {
	disks := make([]InventoryDisk, 0)
	if partitions, err := disk.Partitions(false); err == nil {
		for _, partition := range partitions {
			usage, err := disk.Usage(partition.Mountpoint)
			if err != nil {
				continue
			}
			disks = append(disks, InventoryDisk{
				Device:     partition.Device,
				Mountpoint: partition.Mountpoint,
				FileSystem: partition.Fstype,
				TotalBytes: usage.Total,
			})
		}
	}
	return disks
}

func collectPlatformTopProcesses() []TopProcess {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	procs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return nil
	}

	var results []TopProcess
	for _, p := range procs {
		if ctx.Err() != nil {
			break
		}
		name, err := p.NameWithContext(ctx)
		if err != nil {
			continue
		}
		cpuPercent, _ := p.CPUPercentWithContext(ctx)
		ramPercent, _ := p.MemoryPercentWithContext(ctx)
		username, _ := p.UsernameWithContext(ctx)

		// Skip processes with 0 cpu and 0 ram
		if cpuPercent > 0.1 || ramPercent > 0.1 {
			results = append(results, TopProcess{
				PID:  p.Pid,
				Name: name,
				CPU:  cpuPercent,
				RAM:  ramPercent,
				User: username,
			})
		}
	}

	// Sort by CPU desc
	sort.Slice(results, func(i, j int) bool {
		return results[i].CPU > results[j].CPU
	})

	if len(results) > 20 {
		results = results[:20]
	}

	return results
}
