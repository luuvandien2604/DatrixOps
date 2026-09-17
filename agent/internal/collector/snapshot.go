package collector

import (
	"bufio"
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
	"strconv"
	"strings"
	"sync"
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
	ID         string     `json:"id"`
	Source     string     `json:"source"`
	Owner      string     `json:"owner"`
	Schedule   string     `json:"schedule"`
	Command    string     `json:"command"`
	Enabled    bool       `json:"enabled"`
	LastRunAt  *time.Time `json:"last_run_at,omitempty"`
	NextRunAt  *time.Time `json:"next_run_at,omitempty"`
	LastStatus string     `json:"last_status,omitempty"`
}

type NetworkInterfaceInfo struct {
	Name            string   `json:"name"`
	MAC             string   `json:"mac"`
	IPs             []string `json:"ips"`
	Flags           []string `json:"flags"`
	RxBytes         uint64   `json:"rx_bytes"`
	TxBytes         uint64   `json:"tx_bytes"`
	RxPackets       uint64   `json:"rx_packets"`
	TxPackets       uint64   `json:"tx_packets"`
	RxErrors        uint64   `json:"rx_errors"`
	TxErrors        uint64   `json:"tx_errors"`
	RxDropped       uint64   `json:"rx_dropped"`
	TxDropped       uint64   `json:"tx_dropped"`
	DeltaErrors     uint64   `json:"delta_errors"`
	DeltaDropped    uint64   `json:"delta_dropped"`
	ErrorRatePerMin float64  `json:"error_rate_per_min"`
	DropRatePerMin  float64  `json:"drop_rate_per_min"`
	IsUp            bool     `json:"is_up"`
	IsPhysical      bool     `json:"is_physical"`
	IsPrimaryUplink bool     `json:"is_primary_uplink"`
}

type NetworkSample struct {
	Timestamp    time.Time `json:"timestamp"`
	DeltaDropped uint64    `json:"delta_dropped"`
	DeltaErrors  uint64    `json:"delta_errors"`
	DNSLatencyMs float64   `json:"dns_latency_ms"`
}

type NetworkDiagnostics struct {
	PrimaryUplink     string          `json:"primary_uplink,omitempty"`
	DefaultGateway    string          `json:"default_gateway,omitempty"`
	GatewayLatencyMs  float64         `json:"gateway_latency_ms,omitempty"`
	GatewayPacketLoss float64         `json:"gateway_packet_loss"`
	DNSLatencyMs      float64         `json:"dns_latency_ms,omitempty"`
	DNSResolvable     bool            `json:"dns_resolvable"`
	DNSSource         string          `json:"dns_source,omitempty"`
	InternetConnected bool            `json:"internet_connected"`
	ActiveErrors      uint64          `json:"active_errors"`
	ActiveDropped     uint64          `json:"active_dropped"`
	LifetimeErrors    uint64          `json:"lifetime_errors"`
	LifetimeDropped   uint64          `json:"lifetime_dropped"`
	ErrorRatePerMin   float64         `json:"error_rate_per_min"`
	DropRatePerMin    float64         `json:"drop_rate_per_min"`
	Status            string          `json:"status"` // "healthy", "warning", "critical"
	StatusReason      string          `json:"status_reason,omitempty"`
	RecentSamples     []NetworkSample `json:"recent_samples,omitempty"`
	LastCheckedAt     time.Time       `json:"last_checked_at"`
}

type Snapshot struct {
	OSFamily              string                 `json:"os_family"`
	SystemInfo            *SystemInfo            `json:"system_info,omitempty"`
	Inventory             *Inventory             `json:"inventory,omitempty"`
	CronJobs              []CronJob              `json:"cron_jobs"`
	CronDiscoveryComplete bool                   `json:"cron_discovery_complete"`
	TopProcesses          []TopProcess           `json:"top_processes,omitempty"`
	Services              []ServiceStatus        `json:"services,omitempty"`
	DockerContainers      []DockerContainer      `json:"docker_containers,omitempty"`
	PackageUpdate         int                    `json:"package_update"`
	NetworkInterfaces     []NetworkInterfaceInfo `json:"network_interfaces,omitempty"`
	NetworkDiagnostics    *NetworkDiagnostics    `json:"network_diagnostics,omitempty"`
}

func CollectSnapshot(agentVersion string, monitoredServices []string) *Snapshot {
	snap := &Snapshot{
		OSFamily: currentOSFamily(),
	}

	var wg sync.WaitGroup
	wg.Add(8)

	go func() {
		defer wg.Done()
		jobs, complete := collectCronJobs()
		snap.CronJobs = jobs
		snap.CronDiscoveryComplete = complete
	}()

	go func() {
		defer wg.Done()
		snap.SystemInfo = collectSystemInfo()
	}()

	go func() {
		defer wg.Done()
		snap.Inventory = collectInventory(agentVersion)
	}()

	go func() {
		defer wg.Done()
		snap.TopProcesses = collectTopProcesses()
	}()

	go func() {
		defer wg.Done()
		snap.Services = collectServices(monitoredServices)
	}()

	go func() {
		defer wg.Done()
		snap.DockerContainers = collectDockerContainers()
	}()

	go func() {
		defer wg.Done()
		snap.PackageUpdate = collectPackageUpdate()
	}()

	go func() {
		defer wg.Done()
		ifaces, diags := collectNetworkTelemetry()
		snap.NetworkInterfaces = ifaces
		snap.NetworkDiagnostics = diags
	}()

	wg.Wait()
	return snap
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
	if err == nil {
		if resp.StatusCode == http.StatusOK {
			body, readErr := io.ReadAll(io.LimitReader(resp.Body, 128))
			if readErr == nil {
				candidate := strings.TrimSpace(string(body))
				if parsed := net.ParseIP(candidate); parsed != nil {
					ip = parsed.String()
				}
			}
		}
		_ = resp.Body.Close()
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
			ID:        fmt.Sprintf("%x", sum),
			Source:    source,
			Owner:     owner,
			Schedule:  schedule,
			Command:   command,
			Enabled:   true,
			NextRunAt: nextCronRun(schedule, time.Now().UTC()),
		})
	}
	return jobs
}

func nextCronRun(schedule string, after time.Time) *time.Time {
	parsed, ok := parseCronSchedule(schedule)
	if !ok {
		return nil
	}

	cursor := after.UTC().Truncate(time.Minute).Add(time.Minute)
	limit := cursor.AddDate(1, 0, 0)
	for cursor.Before(limit) || cursor.Equal(limit) {
		if !parsed.months[cursor.Month()] {
			cursor = time.Date(cursor.Year(), cursor.Month()+1, 1, 0, 0, 0, 0, time.UTC)
			continue
		}
		if !parsed.dayMatches(cursor) {
			cursor = time.Date(cursor.Year(), cursor.Month(), cursor.Day()+1, 0, 0, 0, 0, time.UTC)
			continue
		}
		if !parsed.hours[cursor.Hour()] {
			cursor = cursor.Add(time.Hour).Truncate(time.Hour)
			continue
		}
		if parsed.minutes[cursor.Minute()] {
			next := cursor
			return &next
		}
		cursor = cursor.Add(time.Minute)
	}
	return nil
}

type cronSchedule struct {
	minutes            map[int]bool
	hours              map[int]bool
	daysOfMonth        map[int]bool
	months             map[time.Month]bool
	daysOfWeek         map[int]bool
	dayOfMonthWildcard bool
	dayOfWeekWildcard  bool
}

func (schedule cronSchedule) dayMatches(at time.Time) bool {
	dayOfMonthMatches := schedule.daysOfMonth[at.Day()]
	dayOfWeekMatches := schedule.daysOfWeek[int(at.Weekday())]
	if !schedule.dayOfMonthWildcard && !schedule.dayOfWeekWildcard {
		return dayOfMonthMatches || dayOfWeekMatches
	}
	return dayOfMonthMatches && dayOfWeekMatches
}

func parseCronSchedule(schedule string) (cronSchedule, bool) {
	switch strings.TrimSpace(schedule) {
	case "@hourly":
		schedule = "0 * * * *"
	case "@daily", "@midnight":
		schedule = "0 0 * * *"
	case "@weekly":
		schedule = "0 0 * * 0"
	case "@monthly":
		schedule = "0 0 1 * *"
	case "@yearly", "@annually":
		schedule = "0 0 1 1 *"
	}

	fields := strings.Fields(schedule)
	if len(fields) != 5 {
		return cronSchedule{}, false
	}

	minutes, _, ok := parseCronField(fields[0], 0, 59)
	if !ok {
		return cronSchedule{}, false
	}
	hours, _, ok := parseCronField(fields[1], 0, 23)
	if !ok {
		return cronSchedule{}, false
	}
	daysOfMonth, dayOfMonthWildcard, ok := parseCronField(fields[2], 1, 31)
	if !ok {
		return cronSchedule{}, false
	}
	monthNumbers, _, ok := parseCronField(fields[3], 1, 12)
	if !ok {
		return cronSchedule{}, false
	}
	dayNumbers, dayOfWeekWildcard, ok := parseCronField(fields[4], 0, 7)
	if !ok {
		return cronSchedule{}, false
	}

	months := make(map[time.Month]bool, len(monthNumbers))
	for month := range monthNumbers {
		months[time.Month(month)] = true
	}
	daysOfWeek := make(map[int]bool, len(dayNumbers))
	for day := range dayNumbers {
		if day == 7 {
			daysOfWeek[0] = true
			continue
		}
		daysOfWeek[day] = true
	}
	return cronSchedule{
		minutes:            minutes,
		hours:              hours,
		daysOfMonth:        daysOfMonth,
		months:             months,
		daysOfWeek:         daysOfWeek,
		dayOfMonthWildcard: dayOfMonthWildcard,
		dayOfWeekWildcard:  dayOfWeekWildcard,
	}, true
}

func parseCronField(field string, minValue, maxValue int) (map[int]bool, bool, bool) {
	values := make(map[int]bool)
	wildcard := strings.TrimSpace(field) == "*"
	for _, part := range strings.Split(field, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			return nil, false, false
		}

		step := 1
		base := part
		if strings.Contains(part, "/") {
			pieces := strings.Split(part, "/")
			if len(pieces) != 2 {
				return nil, false, false
			}
			base = pieces[0]
			parsedStep, err := strconv.Atoi(pieces[1])
			if err != nil || parsedStep <= 0 {
				return nil, false, false
			}
			step = parsedStep
		}

		start, end := minValue, maxValue
		switch {
		case base == "*":
		case strings.Contains(base, "-"):
			bounds := strings.Split(base, "-")
			if len(bounds) != 2 {
				return nil, false, false
			}
			parsedStart, err := strconv.Atoi(bounds[0])
			if err != nil {
				return nil, false, false
			}
			parsedEnd, err := strconv.Atoi(bounds[1])
			if err != nil {
				return nil, false, false
			}
			start, end = parsedStart, parsedEnd
		default:
			parsed, err := strconv.Atoi(base)
			if err != nil {
				return nil, false, false
			}
			start, end = parsed, parsed
		}

		if start < minValue || end > maxValue || start > end {
			return nil, false, false
		}
		for value := start; value <= end; value += step {
			values[value] = true
		}
	}
	return values, wildcard, len(values) > 0
}

func collectTopProcesses() []TopProcess {
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
		cpu, _ := p.CPUPercentWithContext(ctx)
		ram, _ := p.MemoryPercentWithContext(ctx)
		user, _ := p.UsernameWithContext(ctx)

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

// --- Network Telemetry & Diagnostics Implementation ---

type ifaceCounterState struct {
	rxErrors  uint64
	txErrors  uint64
	rxDropped uint64
	txDropped uint64
	lastSeen  time.Time
}

var (
	netStateMu        sync.RWMutex
	lastIfaceCounters = make(map[string]ifaceCounterState)
	consecutiveErrors = make(map[string]int)
	recentNetSamples  = make([]NetworkSample, 0, 10)
	isAgentFirstTick  = true
)

func safeDelta(current, last uint64) uint64 {
	if current >= last {
		return current - last
	}
	// Counter reset or interface reload: return current value
	return current
}

func parseHexIPv4(hexStr string) string {
	hexStr = strings.TrimSpace(hexStr)
	if len(hexStr) != 8 {
		return ""
	}
	b3, err0 := strconv.ParseUint(hexStr[0:2], 16, 8)
	b2, err1 := strconv.ParseUint(hexStr[2:4], 16, 8)
	b1, err2 := strconv.ParseUint(hexStr[4:6], 16, 8)
	b0, err3 := strconv.ParseUint(hexStr[6:8], 16, 8)
	if err0 != nil || err1 != nil || err2 != nil || err3 != nil {
		return ""
	}
	if b0 == 0 && b1 == 0 && b2 == 0 && b3 == 0 {
		return ""
	}
	return fmt.Sprintf("%d.%d.%d.%d", b0, b1, b2, b3)
}

func findPrimaryUplink() (string, string) {
	// 1. Linux Native: Read /proc/net/route without spawning external processes
	if runtime.GOOS == "linux" {
		if content, err := os.ReadFile("/proc/net/route"); err == nil {
			scanner := bufio.NewScanner(strings.NewReader(string(content)))
			for scanner.Scan() {
				fields := strings.Fields(scanner.Text())
				if len(fields) >= 3 && fields[1] == "00000000" {
					iface := fields[0]
					gw := parseHexIPv4(fields[2])
					return iface, gw
				}
			}
		}

		// Fallback on Linux: ip route show default
		if out, err := exec.Command("ip", "-4", "route", "show", "default").Output(); err == nil {
			fields := strings.Fields(string(out))
			var iface, gw string
			for i := 0; i < len(fields)-1; i++ {
				if fields[i] == "dev" {
					iface = fields[i+1]
				}
				if fields[i] == "via" {
					gw = fields[i+1]
				}
			}
			if iface != "" {
				return iface, gw
			}
		}
	}

	// 2. macOS / Darwin: route -n get default
	if runtime.GOOS == "darwin" {
		if out, err := exec.Command("route", "-n", "get", "default").Output(); err == nil {
			var iface, gw string
			scanner := bufio.NewScanner(strings.NewReader(string(out)))
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if strings.HasPrefix(line, "gateway:") {
					parts := strings.Fields(line)
					if len(parts) >= 2 {
						gw = parts[1]
					}
				} else if strings.HasPrefix(line, "interface:") {
					parts := strings.Fields(line)
					if len(parts) >= 2 {
						iface = parts[1]
					}
				}
			}
			if iface != "" {
				return iface, gw
			}
		}
	}

	// 3. Windows: route print 0.0.0.0
	if runtime.GOOS == "windows" {
		if out, err := exec.Command("route", "print", "0.0.0.0").Output(); err == nil {
			scanner := bufio.NewScanner(strings.NewReader(string(out)))
			for scanner.Scan() {
				fields := strings.Fields(scanner.Text())
				if len(fields) >= 5 && fields[0] == "0.0.0.0" && fields[1] == "0.0.0.0" {
					gw := fields[2]
					ifaceIP := fields[3]
					if ifaces, err := net.Interfaces(); err == nil {
						for _, iface := range ifaces {
							addrs, err := iface.Addrs()
							if err != nil {
								continue
							}
							for _, addr := range addrs {
								if strings.HasPrefix(addr.String(), ifaceIP+"/") || addr.String() == ifaceIP {
									return iface.Name, gw
								}
							}
						}
					}
					return ifaceIP, gw
				}
			}
		}
	}

	// 4. Fallback: find first UP, non-loopback interface with private or public IP
	if ifaces, err := net.Interfaces(); err == nil {
		for _, iface := range ifaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			addrs, err := iface.Addrs()
			if err == nil && len(addrs) > 0 {
				return iface.Name, ""
			}
		}
	}

	return "", ""
}

func isPhysicalInterface(name string) bool {
	lower := strings.ToLower(name)
	if lower == "lo" || strings.HasPrefix(lower, "docker") || strings.HasPrefix(lower, "veth") ||
		strings.HasPrefix(lower, "br-") || strings.HasPrefix(lower, "virbr") ||
		strings.HasPrefix(lower, "cni") || strings.HasPrefix(lower, "flannel") ||
		strings.HasPrefix(lower, "calico") || strings.HasPrefix(lower, "tun") ||
		strings.HasPrefix(lower, "tap") || strings.HasPrefix(lower, "dummy") {
		return false
	}
	if runtime.GOOS == "linux" {
		devicePath := filepath.Join("/sys/class/net", name, "device")
		if _, err := os.Stat(devicePath); err == nil {
			return true
		}
		return false
	}
	if runtime.GOOS == "windows" {
		if strings.HasPrefix(lower, "vethernet") || strings.Contains(lower, "virtual") ||
			strings.Contains(lower, "vmware") || strings.Contains(lower, "hyper-v") ||
			strings.Contains(lower, "loopback") || strings.Contains(lower, "tap") ||
			strings.Contains(lower, "npcap") || strings.Contains(lower, "teredo") ||
			strings.Contains(lower, "isatap") {
			return false
		}
		return true
	}
	return strings.HasPrefix(lower, "en") || strings.HasPrefix(lower, "eth") || strings.HasPrefix(lower, "wlan")
}

func checkDNSResolution() (float64, bool, string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	start := time.Now()
	_, err := net.DefaultResolver.LookupIPAddr(ctx, "google.com")
	latency := float64(time.Since(start).Milliseconds())

	if err == nil {
		return latency, true, "system"
	}

	// Fallback to Cloudflare 1.1.1.1 or Google 8.8.8.8
	fallbackStart := time.Now()
	conn, errDial := (&net.Dialer{Timeout: 1500 * time.Millisecond}).DialContext(ctx, "tcp", "1.1.1.1:53")
	if errDial == nil {
		_ = conn.Close()
		return float64(time.Since(fallbackStart).Milliseconds()), true, "cloudflare_fallback"
	}

	conn2, errDial2 := (&net.Dialer{Timeout: 1500 * time.Millisecond}).DialContext(ctx, "tcp", "8.8.8.8:53")
	if errDial2 == nil {
		_ = conn2.Close()
		return float64(time.Since(fallbackStart).Milliseconds()), true, "google_fallback"
	}

	return latency, false, "none"
}

func checkInternetConnectivity() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
	defer cancel()

	conn, err := (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "tcp", "1.1.1.1:53")
	if err == nil {
		_ = conn.Close()
		return true
	}

	conn2, err2 := (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "tcp", "8.8.8.8:53")
	if err2 == nil {
		_ = conn2.Close()
		return true
	}

	return false
}

func checkGatewayPing(gatewayIP string) (float64, float64) {
	if gatewayIP == "" {
		return 0, 0
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "darwin" {
		cmd = exec.CommandContext(ctx, "ping", "-c", "5", "-t", "2", gatewayIP)
	} else if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "ping", "-n", "5", "-w", "1000", gatewayIP)
	} else {
		cmd = exec.CommandContext(ctx, "ping", "-c", "5", "-W", "2", gatewayIP)
	}

	out, err := cmd.Output()
	if err != nil && len(out) == 0 {
		probeStart := time.Now()
		conn, probeErr := (&net.Dialer{Timeout: 1 * time.Second}).DialContext(ctx, "tcp", net.JoinHostPort(gatewayIP, "53"))
		if probeErr == nil {
			_ = conn.Close()
			return float64(time.Since(probeStart).Milliseconds()), 0
		}
		return 0, 100
	}

	return parsePingOutput(string(out))
}

func parsePingOutput(outStr string) (float64, float64) {
	var lossPercent float64 = 0
	var avgLatency float64 = 0

	for _, line := range strings.Split(outStr, "\n") {
		if strings.Contains(line, "packet loss") {
			parts := strings.Split(line, ",")
			for _, part := range parts {
				if strings.Contains(part, "packet loss") {
					sub := strings.TrimSpace(strings.ReplaceAll(part, "packet loss", ""))
					sub = strings.TrimSpace(strings.ReplaceAll(sub, "%", ""))
					if v, err := strconv.ParseFloat(sub, 64); err == nil {
						lossPercent = v
					}
				}
			}
		} else if strings.Contains(line, "% loss") {
			// Windows format: Lost = 0 (0% loss)
			start := strings.Index(line, "(")
			end := strings.Index(line, "% loss")
			if start != -1 && end != -1 && end > start {
				sub := strings.TrimSpace(line[start+1 : end])
				if v, err := strconv.ParseFloat(sub, 64); err == nil {
					lossPercent = v
				}
			}
		}

		if strings.Contains(line, "round-trip") || strings.Contains(line, "rtt min/avg/max") {
			eqIdx := strings.Index(line, "=")
			if eqIdx != -1 {
				valPart := strings.TrimSpace(line[eqIdx+1:])
				valParts := strings.Split(valPart, "/")
				if len(valParts) >= 2 {
					if v, err := strconv.ParseFloat(strings.TrimSpace(valParts[1]), 64); err == nil {
						avgLatency = v
					}
				}
			}
		} else if strings.Contains(line, "Average =") {
			// Windows format: Minimum = 0ms, Maximum = 1ms, Average = 2ms
			idx := strings.Index(line, "Average =")
			sub := strings.TrimSpace(line[idx+len("Average ="):])
			sub = strings.TrimSpace(strings.ReplaceAll(sub, "ms", ""))
			if v, err := strconv.ParseFloat(sub, 64); err == nil {
				avgLatency = v
			}
		}
	}

	return avgLatency, lossPercent
}

func calculateNetworkStatus(
	primaryUplink string,
	internetConnected bool,
	dnsResolvable bool,
	dnsLatencyMs float64,
	gatewayLatencyMs float64,
	gatewayPacketLoss float64,
	activeDropped uint64,
	activeDropRate float64,
	consecutiveErrors int,
) (string, string) {
	if !internetConnected || !dnsResolvable {
		return "critical", "Internet connectivity or DNS resolution unavailable"
	}
	if gatewayPacketLoss >= 40.0 {
		return "critical", fmt.Sprintf("High packet loss (%.0f%%) to default gateway", gatewayPacketLoss)
	}
	if consecutiveErrors >= 2 {
		return "critical", "Persistent packet errors detected on primary uplink"
	}
	if activeDropped > 0 {
		return "warning", fmt.Sprintf("Packet drops detected on primary uplink (%.1f drops/min)", activeDropRate)
	}
	if consecutiveErrors == 1 {
		return "warning", "Transient packet error detected on primary uplink"
	}
	if gatewayLatencyMs > 100.0 {
		return "warning", fmt.Sprintf("Elevated gateway latency (%.1f ms)", gatewayLatencyMs)
	}
	if gatewayPacketLoss >= 20.0 && gatewayPacketLoss < 40.0 {
		return "warning", fmt.Sprintf("Packet loss (%.0f%%) to default gateway", gatewayPacketLoss)
	}
	if dnsLatencyMs > 500.0 {
		return "warning", fmt.Sprintf("Slow DNS response time (%.1f ms)", dnsLatencyMs)
	}
	return "healthy", "Network link clean and operational"
}

func collectNetworkTelemetry() ([]NetworkInterfaceInfo, *NetworkDiagnostics) {
	now := time.Now()
	primaryUplink, defaultGateway := findPrimaryUplink()

	dnsLatency, dnsResolvable, dnsSource := checkDNSResolution()
	internetConnected := checkInternetConnectivity()

	var gwLatency, gwLoss float64
	if defaultGateway != "" {
		gwLatency, gwLoss = checkGatewayPing(defaultGateway)
	}

	rawIfaces, _ := gnet.Interfaces()
	rawIOs, _ := gnet.IOCounters(true)

	ioMap := make(map[string]gnet.IOCountersStat)
	for _, ioStat := range rawIOs {
		ioMap[ioStat.Name] = ioStat
	}

	netStateMu.Lock()
	defer netStateMu.Unlock()

	var resultIfaces []NetworkInterfaceInfo
	var totalActiveErrors, totalActiveDropped uint64
	var totalLifetimeErrors, totalLifetimeDropped uint64
	var activeDropRate, activeErrorRate float64

	for _, iface := range rawIfaces {
		ioStat := ioMap[iface.Name]
		isPrimary := (iface.Name == primaryUplink)
		isPhysical := isPhysicalInterface(iface.Name)
		isUp := false
		for _, f := range iface.Flags {
			if strings.ToLower(f) == "up" {
				isUp = true
				break
			}
		}

		var ips []string
		for _, a := range iface.Addrs {
			ip := strings.Split(a.Addr, "/")[0]
			if ip != "" {
				ips = append(ips, ip)
			}
		}

		last, exists := lastIfaceCounters[iface.Name]
		var deltaErr, deltaDrop uint64
		var errRate, dropRate float64

		if !exists || isAgentFirstTick {
			deltaErr = 0
			deltaDrop = 0
			errRate = 0
			dropRate = 0
		} else {
			elapsed := now.Sub(last.lastSeen).Seconds()
			if elapsed <= 0.1 {
				elapsed = 1.0
			}
			dErrIn := safeDelta(ioStat.Errin, last.rxErrors)
			dErrOut := safeDelta(ioStat.Errout, last.txErrors)
			dDropIn := safeDelta(ioStat.Dropin, last.rxDropped)
			dDropOut := safeDelta(ioStat.Dropout, last.txDropped)

			deltaErr = dErrIn + dErrOut
			deltaDrop = dDropIn + dDropOut
			errRate = float64(deltaErr) / (elapsed / 60.0)
			dropRate = float64(deltaDrop) / (elapsed / 60.0)
		}

		lastIfaceCounters[iface.Name] = ifaceCounterState{
			rxErrors:  ioStat.Errin,
			txErrors:  ioStat.Errout,
			rxDropped: ioStat.Dropin,
			txDropped: ioStat.Dropout,
			lastSeen:  now,
		}

		totalLifetimeErrors += (ioStat.Errin + ioStat.Errout)
		totalLifetimeDropped += (ioStat.Dropin + ioStat.Dropout)

		if isPrimary {
			totalActiveErrors = deltaErr
			totalActiveDropped = deltaDrop
			activeErrorRate = errRate
			activeDropRate = dropRate
			if deltaErr > 0 {
				consecutiveErrors[primaryUplink]++
			} else {
				consecutiveErrors[primaryUplink] = 0
			}
		}

		resultIfaces = append(resultIfaces, NetworkInterfaceInfo{
			Name:            iface.Name,
			MAC:             iface.HardwareAddr,
			IPs:             ips,
			Flags:           iface.Flags,
			RxBytes:         ioStat.BytesRecv,
			TxBytes:         ioStat.BytesSent,
			RxPackets:       ioStat.PacketsRecv,
			TxPackets:       ioStat.PacketsSent,
			RxErrors:        ioStat.Errin,
			TxErrors:        ioStat.Errout,
			RxDropped:       ioStat.Dropin,
			TxDropped:       ioStat.Dropout,
			DeltaErrors:     deltaErr,
			DeltaDropped:    deltaDrop,
			ErrorRatePerMin: errRate,
			DropRatePerMin:  dropRate,
			IsUp:            isUp,
			IsPhysical:      isPhysical,
			IsPrimaryUplink: isPrimary,
		})
	}

	isAgentFirstTick = false

	status, statusReason := calculateNetworkStatus(
		primaryUplink,
		internetConnected,
		dnsResolvable,
		dnsLatency,
		gwLatency,
		gwLoss,
		totalActiveDropped,
		activeDropRate,
		consecutiveErrors[primaryUplink],
	)

	sample := NetworkSample{
		Timestamp:    now,
		DeltaDropped: totalActiveDropped,
		DeltaErrors:  totalActiveErrors,
		DNSLatencyMs: dnsLatency,
	}
	recentNetSamples = append(recentNetSamples, sample)
	if len(recentNetSamples) > 10 {
		recentNetSamples = recentNetSamples[len(recentNetSamples)-10:]
	}

	samplesCopy := make([]NetworkSample, len(recentNetSamples))
	copy(samplesCopy, recentNetSamples)

	diag := &NetworkDiagnostics{
		PrimaryUplink:     primaryUplink,
		DefaultGateway:    defaultGateway,
		GatewayLatencyMs:  gwLatency,
		GatewayPacketLoss: gwLoss,
		DNSLatencyMs:      dnsLatency,
		DNSResolvable:     dnsResolvable,
		DNSSource:         dnsSource,
		InternetConnected: internetConnected,
		ActiveErrors:      totalActiveErrors,
		ActiveDropped:     totalActiveDropped,
		LifetimeErrors:    totalLifetimeErrors,
		LifetimeDropped:   totalLifetimeDropped,
		ErrorRatePerMin:   activeErrorRate,
		DropRatePerMin:    activeDropRate,
		Status:            status,
		StatusReason:      statusReason,
		RecentSamples:     samplesCopy,
		LastCheckedAt:     now,
	}

	return resultIfaces, diag
}
