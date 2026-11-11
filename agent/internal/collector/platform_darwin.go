//go:build darwin

package collector

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/unix"
)

//go:linkname syscall_syscall syscall.syscall
func syscall_syscall(fn, a1, a2, a3 uintptr) (r1, r2 uintptr, err syscall.Errno)

//go:linkname syscall_syscall6 syscall.syscall6
func syscall_syscall6(fn, a1, a2, a3, a4, a5, a6 uintptr) (r1, r2 uintptr, err syscall.Errno)

//go:cgo_import_dynamic libc_mach_host_self mach_host_self "/usr/lib/libSystem.B.dylib"
//go:cgo_import_dynamic libc_host_statistics host_statistics "/usr/lib/libSystem.B.dylib"

//go:linkname machHostSelfTrampoline _datrix_mach_host_self_trampoline
var machHostSelfTrampoline uint8
var machHostSelfAddr = uintptr(unsafe.Pointer(&machHostSelfTrampoline))

//go:linkname hostStatisticsTrampoline _datrix_host_statistics_trampoline
var hostStatisticsTrampoline uint8
var hostStatisticsAddr = uintptr(unsafe.Pointer(&hostStatisticsTrampoline))

const (
	machKernSuccess        = 0
	machHostVMInfoFlavor   = 2
	machHostCPULoadFlavor  = 3
	machHostVMInfoCount    = 15
	machHostCPULoadInfoMax = 4
)

type machHostCPULoadInfo struct {
	user   uint32
	system uint32
	idle   uint32
	nice   uint32
}

type machVMStatisticsData struct {
	freeCount     uint32
	activeCount   uint32
	inactiveCount uint32
	wireCount     uint32
	_             [44]byte
}

var (
	darwinHostPortOnce sync.Once
	darwinHostPort     uintptr

	darwinPlatformOnce sync.Once
	darwinPlatformVer  string
	darwinPlatformName string

	darwinCPUStaticOnce sync.Once
	darwinCPUModel      string
	darwinLogicalCores  int
	darwinPhysicalCores int

	darwinMemStaticOnce sync.Once
	darwinTotalMemBytes uint64
	darwinVMPageSize    uint64

	darwinCPUMu        sync.Mutex
	darwinLastCPUTicks machHostCPULoadInfo
	darwinHasLastCPU   bool

	darwinIORegReadRe  = regexp.MustCompile(`"Bytes \(Read\)"\s*=\s*(\d+)`)
	darwinIORegWriteRe = regexp.MustCompile(`"Bytes \(Write\)"\s*=\s*(\d+)`)
	darwinLinkIDRe     = regexp.MustCompile(`^<Link#\d+>$`)
)

func initPlatformMetrics() {
	if ticks, ok := readMachCPUTicks(); ok {
		darwinCPUMu.Lock()
		darwinLastCPUTicks = ticks
		darwinHasLastCPU = true
		darwinCPUMu.Unlock()
	}
}

func machHostSelfPort() uintptr {
	darwinHostPortOnce.Do(func() {
		host, _, _ := syscall_syscall(machHostSelfAddr, 0, 0, 0)
		darwinHostPort = host
	})
	return darwinHostPort
}

func readMachCPUTicks() (machHostCPULoadInfo, bool) {
	host := machHostSelfPort()
	if host == 0 {
		return machHostCPULoadInfo{}, false
	}

	info := new(machHostCPULoadInfo)
	count := new(uint32)
	*count = machHostCPULoadInfoMax

	var pinner runtime.Pinner
	pinner.Pin(info)
	pinner.Pin(count)
	rc, _, _ := syscall_syscall6(
		hostStatisticsAddr,
		host,
		machHostCPULoadFlavor,
		uintptr(unsafe.Pointer(info)),
		uintptr(unsafe.Pointer(count)),
		0, 0,
	)
	pinner.Unpin()

	if rc != machKernSuccess {
		return machHostCPULoadInfo{}, false
	}
	return *info, true
}

func readDarwinCPUUsage() float64 {
	cur, ok := readMachCPUTicks()
	if !ok {
		return 0
	}

	darwinCPUMu.Lock()
	defer darwinCPUMu.Unlock()

	if !darwinHasLastCPU {
		darwinLastCPUTicks = cur
		darwinHasLastCPU = true
		return 0
	}

	prev := darwinLastCPUTicks
	darwinLastCPUTicks = cur

	user := uint64(cur.user - prev.user)
	sys := uint64(cur.system - prev.system)
	idle := uint64(cur.idle - prev.idle)
	nice := uint64(cur.nice - prev.nice)

	busy := user + sys + nice
	total := busy + idle
	if total == 0 {
		return 0
	}

	pct := (float64(busy) / float64(total)) * 100.0
	if pct < 0 {
		return 0
	}
	if pct > 100 {
		return 100
	}
	return pct
}

func readDarwinStaticMemInfo() (totalBytes, pageSize uint64) {
	darwinMemStaticOnce.Do(func() {
		if total, err := unix.SysctlUint64("hw.memsize"); err == nil {
			darwinTotalMemBytes = total
		}
		if ps, err := unix.SysctlUint32("vm.pagesize"); err == nil && ps > 0 {
			darwinVMPageSize = uint64(ps)
		} else if ps, err := unix.SysctlUint32("hw.pagesize"); err == nil && ps > 0 {
			darwinVMPageSize = uint64(ps)
		} else {
			darwinVMPageSize = uint64(os.Getpagesize())
		}
	})
	return darwinTotalMemBytes, darwinVMPageSize
}

func readDarwinMemory() (total, used uint64, ok bool) {
	total, pageSize := readDarwinStaticMemInfo()
	if total == 0 || pageSize == 0 {
		return 0, 0, false
	}

	host := machHostSelfPort()
	if host == 0 {
		return total, 0, false
	}

	vm := new(machVMStatisticsData)
	count := new(uint32)
	*count = machHostVMInfoCount

	var pinner runtime.Pinner
	pinner.Pin(vm)
	pinner.Pin(count)
	rc, _, _ := syscall_syscall6(
		hostStatisticsAddr,
		host,
		machHostVMInfoFlavor,
		uintptr(unsafe.Pointer(vm)),
		uintptr(unsafe.Pointer(count)),
		0, 0,
	)
	pinner.Unpin()

	if rc != machKernSuccess {
		return total, 0, false
	}

	totalPages := total / pageSize
	availPages := uint64(vm.inactiveCount) + uint64(vm.freeCount)
	var usedPages uint64
	if totalPages > availPages {
		usedPages = totalPages - availPages
	}
	return total, usedPages * pageSize, true
}

func collectPlatformMetrics() (platformMetrics, error) {
	hostInfo, _ := collectPlatformHostInfo()
	osName := runtime.GOOS
	if hostInfo != nil {
		osName = strings.TrimSpace(fmt.Sprintf("%s %s", hostInfo.Platform, hostInfo.PlatformVersion))
	}

	cpuDetails := collectPlatformCPUDetails()
	cpuCores := cpuDetails.LogicalCores
	if cpuCores <= 0 {
		cpuCores = runtime.NumCPU()
	}

	cpuUsage := readDarwinCPUUsage()
	memTotal, memUsed, _ := readDarwinMemory()

	var currentNetIn, currentNetOut uint64
	if netIO, err := collectPlatformNetIOCounters(); err == nil {
		for _, nic := range netIO {
			currentNetIn += nic.BytesRecv
			currentNetOut += nic.BytesSent
		}
	}

	currentDiskRead, currentDiskWrite := readDarwinDiskIOCounters()

	var diskTotal, diskUsed uint64
	var diskUsage float64
	if total, used, pct, err := readDarwinDiskUsage("/"); err == nil {
		diskTotal = total
		diskUsed = used
		diskUsage = pct
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

func resolveDarwinPlatformMetadata() (string, string) {
	darwinPlatformOnce.Do(func() {
		platform := "darwin"
		if p, err := unix.Sysctl("kern.ostype"); err == nil && strings.TrimSpace(p) != "" {
			platform = strings.ToLower(strings.TrimSpace(p))
		}

		version := ""
		if v, err := unix.Sysctl("kern.osproductversion"); err == nil {
			version = strings.ToLower(strings.TrimSpace(v))
		}
		if version == "" {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if out, err := runDarwinSystemCommand(ctx, "sw_vers", "/usr/bin/sw_vers", "-productVersion"); err == nil {
				version = strings.ToLower(strings.TrimSpace(string(out)))
			}
		}

		darwinPlatformName = platform
		darwinPlatformVer = version
	})
	return darwinPlatformName, darwinPlatformVer
}

func collectPlatformHostInfo() (*platformHostInfo, error) {
	platform, platformVer := resolveDarwinPlatformMetadata()
	kernelVer, _ := unix.Sysctl("kern.osrelease")
	kernelVer = strings.ToLower(strings.TrimSpace(kernelVer))

	var bootTime uint64
	var uptime uint64
	if tv, err := unix.SysctlTimeval("kern.boottime"); err == nil && tv.Sec > 0 {
		bootTime = uint64(tv.Sec)
		if now := time.Now().Unix(); now > tv.Sec {
			uptime = uint64(now - tv.Sec)
		}
	}

	return &platformHostInfo{
		Platform:        platform,
		PlatformVersion: platformVer,
		KernelVersion:   kernelVer,
		Uptime:          uptime,
		BootTime:        bootTime,
		Virtualization:  "",
	}, nil
}

func collectPlatformCPUDetails() platformCPUDetails {
	darwinCPUStaticOnce.Do(func() {
		if model, err := unix.Sysctl("machdep.cpu.brand_string"); err == nil {
			darwinCPUModel = strings.TrimSpace(model)
		}
		if logical, err := unix.SysctlUint32("hw.logicalcpu"); err == nil && logical > 0 {
			darwinLogicalCores = int(logical)
		} else {
			darwinLogicalCores = runtime.NumCPU()
		}
		if physical, err := unix.SysctlUint32("hw.physicalcpu"); err == nil && physical > 0 {
			darwinPhysicalCores = int(physical)
		} else {
			darwinPhysicalCores = darwinLogicalCores
		}
	})
	return platformCPUDetails{
		ModelName:     darwinCPUModel,
		LogicalCores:  darwinLogicalCores,
		PhysicalCores: darwinPhysicalCores,
	}
}

func collectPlatformMemoryTotal() (uint64, error) {
	total, _ := readDarwinStaticMemInfo()
	if total == 0 {
		return 0, fmt.Errorf("failed to read macOS hw.memsize")
	}
	return total, nil
}

func collectPlatformNetworkInterfaces() ([]platformNetInterface, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}
	result := make([]platformNetInterface, 0, len(ifaces))
	for _, ifi := range ifaces {
		var flags []string
		if ifi.Flags&net.FlagUp != 0 {
			flags = append(flags, "up")
		}
		if ifi.Flags&net.FlagBroadcast != 0 {
			flags = append(flags, "broadcast")
		}
		if ifi.Flags&net.FlagLoopback != 0 {
			flags = append(flags, "loopback")
		}
		if ifi.Flags&net.FlagPointToPoint != 0 {
			flags = append(flags, "pointtopoint")
		}
		if ifi.Flags&net.FlagMulticast != 0 {
			flags = append(flags, "multicast")
		}

		var addrStrings []string
		if addrs, err := ifi.Addrs(); err == nil {
			addrStrings = make([]string, 0, len(addrs))
			for _, addr := range addrs {
				addrStrings = append(addrStrings, addr.String())
			}
		}

		result = append(result, platformNetInterface{
			Name:         ifi.Name,
			HardwareAddr: ifi.HardwareAddr.String(),
			Flags:        flags,
			Addrs:        addrStrings,
		})
	}
	return result, nil
}

func collectPlatformNetIOCounters() ([]platformNetIOCounter, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	out, err := runDarwinSystemCommand(ctx, "netstat", "/usr/sbin/netstat", "-ibdnW")
	if err != nil {
		return nil, err
	}
	return parseDarwinNetstatOutput(string(out)), nil
}

func parseDarwinNetstatOutput(output string) []platformNetIOCounter {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	counters := make([]platformNetIOCounter, 0, len(lines))
	seen := make(map[string]struct{}, len(lines))

	for _, rawLine := range lines {
		fields := strings.Fields(rawLine)
		if len(fields) < 11 || fields[0] == "Name" {
			continue
		}
		if !darwinLinkIDRe.MatchString(fields[2]) {
			continue
		}

		name := strings.TrimSuffix(fields[0], "*")
		if name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			continue
		}

		// netstat -ibdnW trailing 8 fields: Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll Drop
		offset := len(fields) - 8
		if offset != 3 && offset != 4 {
			continue
		}

		ipkts, ok0 := parseNetstatField(fields[offset+0])
		ierrs, ok1 := parseNetstatField(fields[offset+1])
		ibytes, ok2 := parseNetstatField(fields[offset+2])
		opkts, ok3 := parseNetstatField(fields[offset+3])
		oerrs, ok4 := parseNetstatField(fields[offset+4])
		obytes, ok5 := parseNetstatField(fields[offset+5])
		drop, ok6 := parseNetstatField(fields[offset+7])
		if !(ok0 && ok1 && ok2 && ok3 && ok4 && ok5 && ok6) {
			continue
		}

		seen[name] = struct{}{}
		counters = append(counters, platformNetIOCounter{
			Name:        name,
			BytesRecv:   ibytes,
			BytesSent:   obytes,
			PacketsRecv: ipkts,
			PacketsSent: opkts,
			Errin:       ierrs,
			Errout:      oerrs,
			Dropin:      drop,
			Dropout:     0,
		})
	}
	return counters
}

func parseNetstatField(s string) (uint64, bool) {
	if s == "-" {
		return 0, true
	}
	v, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0, false
	}
	return v, true
}

func readDarwinDiskIOCounters() (uint64, uint64) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	out, err := runDarwinSystemCommand(ctx, "ioreg", "/usr/sbin/ioreg", "-r", "-w0", "-d1", "-c", "IOBlockStorageDriver")
	if err != nil {
		return 0, 0
	}
	return parseDarwinDiskIOCountersOutput(string(out))
}

func parseDarwinDiskIOCountersOutput(output string) (uint64, uint64) {
	var totalRead, totalWrite uint64
	for _, line := range strings.Split(output, "\n") {
		if !strings.Contains(line, `"Statistics"`) {
			continue
		}
		if match := darwinIORegReadRe.FindStringSubmatch(line); len(match) == 2 {
			if v, err := strconv.ParseUint(match[1], 10, 64); err == nil {
				totalRead += v
			}
		}
		if match := darwinIORegWriteRe.FindStringSubmatch(line); len(match) == 2 {
			if v, err := strconv.ParseUint(match[1], 10, 64); err == nil {
				totalWrite += v
			}
		}
	}
	return totalRead, totalWrite
}

func readDarwinDiskUsage(path string) (total, used uint64, usedPercent float64, err error) {
	var stat unix.Statfs_t
	if err := unix.Statfs(path, &stat); err != nil {
		return 0, 0, 0, err
	}
	bsize := uint64(stat.Bsize)
	total = uint64(stat.Blocks) * bsize
	free := uint64(stat.Bavail) * bsize
	if stat.Blocks >= stat.Bfree {
		used = (uint64(stat.Blocks) - uint64(stat.Bfree)) * bsize
	}
	if used+free > 0 {
		usedPercent = (float64(used) / float64(used+free)) * 100.0
	}
	return total, used, usedPercent, nil
}

func collectPlatformInventoryDisks() []InventoryDisk {
	disks := make([]InventoryDisk, 0)
	count, err := unix.Getfsstat(nil, unix.MNT_WAIT)
	if err != nil || count <= 0 {
		return disks
	}
	fs := make([]unix.Statfs_t, count)
	count, err = unix.Getfsstat(fs, unix.MNT_WAIT)
	if err != nil || count <= 0 {
		return disks
	}
	if count > len(fs) {
		count = len(fs)
	}
	for i := 0; i < count; i++ {
		st := &fs[i]
		mountpoint := darwinCString(st.Mntonname[:])
		if mountpoint == "" {
			continue
		}
		total, _, _, err := readDarwinDiskUsage(mountpoint)
		if err != nil {
			continue
		}
		disks = append(disks, InventoryDisk{
			Device:     darwinCString(st.Mntfromname[:]),
			Mountpoint: mountpoint,
			FileSystem: darwinCString(st.Fstypename[:]),
			TotalBytes: total,
		})
	}
	return disks
}

func darwinCString(buf []byte) string {
	for i, b := range buf {
		if b == 0 {
			return string(buf[:i])
		}
	}
	return string(buf)
}

func collectPlatformTopProcesses() []TopProcess {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	out, err := runDarwinSystemCommand(ctx, "ps", "/bin/ps", "-axcww", "-o", "pid=,pcpu=,pmem=,user=,comm=")
	if err != nil {
		return nil
	}
	return parseDarwinTopProcessesOutput(string(out))
}

func parseDarwinTopProcessesOutput(output string) []TopProcess {
	results := make([]TopProcess, 0, 32)
	for _, rawLine := range strings.Split(output, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		pidStr, rest, ok := cutNextField(line)
		if !ok {
			continue
		}
		cpuStr, rest, ok := cutNextField(rest)
		if !ok {
			continue
		}
		memStr, rest, ok := cutNextField(rest)
		if !ok {
			continue
		}
		userStr, commStr, ok := cutNextField(rest)
		if !ok {
			continue
		}

		pid, err := strconv.ParseInt(pidStr, 10, 32)
		if err != nil || pid <= 0 {
			continue
		}
		cpuVal, err := strconv.ParseFloat(cpuStr, 64)
		if err != nil {
			continue
		}
		memVal, err := strconv.ParseFloat(memStr, 32)
		if err != nil {
			continue
		}
		name := strings.TrimSpace(commStr)
		if name == "" {
			continue
		}

		if cpuVal > 0.1 || float32(memVal) > 0.1 {
			results = append(results, TopProcess{
				PID:  int32(pid),
				Name: name,
				CPU:  cpuVal,
				RAM:  float32(memVal),
				User: userStr,
			})
		}
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].CPU != results[j].CPU {
			return results[i].CPU > results[j].CPU
		}
		if results[i].RAM != results[j].RAM {
			return results[i].RAM > results[j].RAM
		}
		return results[i].PID < results[j].PID
	})

	if len(results) > 20 {
		results = results[:20]
	}
	return results
}

func cutNextField(s string) (field, rest string, ok bool) {
	s = strings.TrimLeft(s, " \t")
	if s == "" {
		return "", "", false
	}
	idx := strings.IndexAny(s, " \t")
	if idx == -1 {
		return "", "", false
	}
	field = s[:idx]
	rest = strings.TrimLeft(s[idx+1:], " \t")
	if rest == "" {
		return "", "", false
	}
	return field, rest, true
}

func runDarwinSystemCommand(ctx context.Context, name, fallbackPath string, args ...string) ([]byte, error) {
	binPath, err := exec.LookPath(name)
	if err != nil {
		if _, statErr := os.Stat(fallbackPath); statErr == nil {
			binPath = fallbackPath
		} else {
			return nil, err
		}
	}
	cmd := exec.CommandContext(ctx, binPath, args...)
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	return cmd.Output()
}
