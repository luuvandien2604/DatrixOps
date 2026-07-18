package collector

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
	gnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type TopProcess struct {
	PID  int32   `json:"pid"`
	Name string  `json:"name"`
	CPU  float64 `json:"cpu"`
	RAM  float32 `json:"ram"`
	User string  `json:"user"`
}

type ServiceStatus struct {
	Name          string    `json:"name"`
	DisplayName   string    `json:"display_name"`
	Status        string    `json:"status"` // running, stopped, not_installed, unknown
	SubStatus     string    `json:"sub_status,omitempty"`
	StartupType   string    `json:"startup_type,omitempty"`
	Source        string    `json:"source"`
	Description   string    `json:"description,omitempty"`
	LastCheckedAt time.Time `json:"last_checked_at"`
}

type SystemInfo struct {
	Kernel         string `json:"kernel"`
	Uptime         uint64 `json:"uptime"`
	PublicIP       string `json:"public_ip"`
	Virtualization string `json:"virtualization"`
}

type InventoryDisk struct {
	Device     string `json:"device"`
	Mountpoint string `json:"mountpoint"`
	FileSystem string `json:"file_system"`
	TotalBytes uint64 `json:"total_bytes"`
}

type Inventory struct {
	OSFamily        string          `json:"os_family"`
	Hostname        string          `json:"hostname"`
	Architecture    string          `json:"architecture"`
	Platform        string          `json:"platform"`
	PlatformVersion string          `json:"platform_version"`
	KernelVersion   string          `json:"kernel_version"`
	CPUModel        string          `json:"cpu_model"`
	LogicalCores    int             `json:"logical_cores"`
	PhysicalCores   int             `json:"physical_cores"`
	MemoryTotal     uint64          `json:"memory_total"`
	BootTime        uint64          `json:"boot_time"`
	AgentVersion    string          `json:"agent_version"`
	PrivateIPs      []string        `json:"private_ips"`
	Disks           []InventoryDisk `json:"disks"`
	CollectedAt     time.Time       `json:"collected_at"`
}

type CronJob struct {
	ID       string `json:"id"`
	Source   string `json:"source"`
	Owner    string `json:"owner"`
	Schedule string `json:"schedule"`
	Command  string `json:"command"`
	Enabled  bool   `json:"enabled"`
}

type Snapshot struct {
	OSFamily              string            `json:"os_family"`
	SystemInfo            *SystemInfo       `json:"system_info,omitempty"`
	Inventory             *Inventory        `json:"inventory,omitempty"`
	CronJobs              []CronJob         `json:"cron_jobs"`
	CronDiscoveryComplete bool              `json:"cron_discovery_complete"`
	TopProcesses          []TopProcess      `json:"top_processes,omitempty"`
	Services              []ServiceStatus   `json:"services,omitempty"`
	DockerContainers      []DockerContainer `json:"docker_containers,omitempty"`
	PackageUpdate         int               `json:"package_update"`
}

func CollectSnapshot(agentVersion string, monitoredServices []string) *Snapshot {
	cronJobs, cronDiscoveryComplete := collectCronJobs()
	return &Snapshot{
		OSFamily:              currentOSFamily(),
		SystemInfo:            collectSystemInfo(),
		Inventory:             collectInventory(agentVersion),
		CronJobs:              cronJobs,
		CronDiscoveryComplete: cronDiscoveryComplete,
		TopProcesses:          collectTopProcesses(),
		Services:              collectServices(monitoredServices),
		DockerContainers:      collectDockerContainers(),
		PackageUpdate:         collectPackageUpdate(),
	}
}

func collectSystemInfo() *SystemInfo {
	info, err := host.Info()
	if err != nil {
		return nil
	}

	// Try to get Public IP quickly
	ip := ""
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("https://api.ipify.org")
	if err == nil && resp.StatusCode == 200 {
		body, _ := io.ReadAll(resp.Body)
		ip = string(body)
		resp.Body.Close()
	}

	return &SystemInfo{
		Kernel:         info.KernelVersion,
		Uptime:         info.Uptime,
		PublicIP:       ip,
		Virtualization: info.VirtualizationSystem,
	}
}

func collectInventory(agentVersion string) *Inventory {
	hostInfo, _ := host.Info()
	cpuInfo, _ := cpu.Info()
	logicalCores, _ := cpu.Counts(true)
	physicalCores, _ := cpu.Counts(false)

	hostname, _ := os.Hostname()
	inventory := &Inventory{
		OSFamily:      currentOSFamily(),
		Hostname:      hostname,
		Architecture:  runtime.GOARCH,
		LogicalCores:  logicalCores,
		PhysicalCores: physicalCores,
		AgentVersion:  agentVersion,
		PrivateIPs:    make([]string, 0),
		Disks:         make([]InventoryDisk, 0),
		CollectedAt:   time.Now().UTC(),
	}

	if hostInfo != nil {
		inventory.Platform = hostInfo.Platform
		inventory.PlatformVersion = hostInfo.PlatformVersion
		inventory.KernelVersion = hostInfo.KernelVersion
		inventory.BootTime = hostInfo.BootTime
	}
	if len(cpuInfo) > 0 {
		inventory.CPUModel = cpuInfo[0].ModelName
	}
	if memory, err := readMemoryTotal(); err == nil {
		inventory.MemoryTotal = memory
	}

	if interfaces, err := gnet.Interfaces(); err == nil {
		seen := make(map[string]struct{})
		for _, networkInterface := range interfaces {
			for _, address := range networkInterface.Addrs {
				ip := strings.Split(address.Addr, "/")[0]
				parsedIP := net.ParseIP(ip)
				if parsedIP == nil || !parsedIP.IsPrivate() {
					continue
				}
				if _, exists := seen[ip]; !exists {
					seen[ip] = struct{}{}
					inventory.PrivateIPs = append(inventory.PrivateIPs, ip)
				}
			}
		}
		sort.Strings(inventory.PrivateIPs)
	}

	if partitions, err := disk.Partitions(false); err == nil {
		for _, partition := range partitions {
			usage, err := disk.Usage(partition.Mountpoint)
			if err != nil {
				continue
			}
			inventory.Disks = append(inventory.Disks, InventoryDisk{
				Device:     partition.Device,
				Mountpoint: partition.Mountpoint,
				FileSystem: partition.Fstype,
				TotalBytes: usage.Total,
			})
		}
	}

	return inventory
}

func currentOSFamily() string {
	if runtime.GOOS == "darwin" {
		return "macos"
	}
	return runtime.GOOS
}

func readMemoryTotal() (uint64, error) {
	// The existing metrics collector is the source of truth for live usage.
	// Inventory records the installed capacity at snapshot time.
	memory, err := mem.VirtualMemory()
	if err != nil {
		return 0, err
	}
	return memory.Total, nil
}

func collectCronJobs() ([]CronJob, bool) {
	jobs := make([]CronJob, 0)
	discoveryComplete := false
	currentOwner := ""
	if currentUser, err := user.Current(); err == nil {
		currentOwner = currentUser.Username
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := exec.LookPath("crontab"); err == nil {
		discoveryComplete = true
		if output, err := exec.CommandContext(ctx, "crontab", "-l").Output(); err == nil {
			jobs = append(jobs, parseCronFile(string(output), "user-crontab", currentOwner, false)...)
		}
	}

	if content, err := os.ReadFile("/etc/crontab"); err == nil {
		discoveryComplete = true
		jobs = append(jobs, parseCronFile(string(content), "/etc/crontab", "", true)...)
	}
	if paths, err := filepath.Glob("/etc/cron.d/*"); err == nil {
		if _, statErr := os.Stat("/etc/cron.d"); statErr == nil {
			discoveryComplete = true
		}
		sort.Strings(paths)
		for _, path := range paths {
			content, err := os.ReadFile(path)
			if err == nil {
				discoveryComplete = true
				jobs = append(jobs, parseCronFile(string(content), path, "", true)...)
			}
		}
	}
	return jobs, discoveryComplete
}

func parseCronFile(content, source, defaultOwner string, systemFormat bool) []CronJob {
	jobs := make([]CronJob, 0)
	for _, rawLine := range strings.Split(content, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "#") || strings.Contains(strings.SplitN(line, " ", 2)[0], "=") {
			continue
		}

		fields := strings.Fields(line)
		scheduleFields := 5
		if strings.HasPrefix(line, "@") {
			scheduleFields = 1
		}
		if len(fields) < scheduleFields {
			continue
		}
		ownerIndex := scheduleFields
		commandIndex := scheduleFields
		owner := defaultOwner
		if systemFormat {
			commandIndex++
			if len(fields) > ownerIndex {
				owner = fields[ownerIndex]
			}
		}
		if len(fields) <= commandIndex {
			continue
		}

		schedule := strings.Join(fields[:scheduleFields], " ")
		command := strings.Join(fields[commandIndex:], " ")
		sum := sha256.Sum256([]byte(source + "\x00" + owner + "\x00" + schedule + "\x00" + command))
		jobs = append(jobs, CronJob{
			ID:       fmt.Sprintf("%x", sum),
			Source:   source,
			Owner:    owner,
			Schedule: schedule,
			Command:  command,
			Enabled:  true,
		})
	}
	return jobs
}

func collectTopProcesses() []TopProcess {
	procs, err := process.Processes()
	if err != nil {
		return nil
	}

	var results []TopProcess
	for _, p := range procs {
		name, _ := p.Name()
		cpu, _ := p.CPUPercent()
		ram, _ := p.MemoryPercent()
		user, _ := p.Username()

		// Skip processes with 0 cpu and 0 ram
		if cpu > 0.1 || ram > 0.1 {
			results = append(results, TopProcess{
				PID:  p.Pid,
				Name: name,
				CPU:  cpu,
				RAM:  ram,
				User: user,
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

func collectPackageUpdate() int {
	// A naive implementation to count upgradeable packages via apt
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", "apt-get -s upgrade | grep -P '^\\d+ upgraded' | awk '{print $1}'")
	out, err := cmd.Output()
	if err != nil {
		return 0
	}

	var count int
	if len(out) > 0 {
		// Just extract the number if possible, or assume 0
		// E.g. out could be "14\n"
		var parsed int
		if _, err := fmt.Sscanf(strings.TrimSpace(string(out)), "%d", &parsed); err == nil {
			count = parsed
		}
	}
	return count
}
