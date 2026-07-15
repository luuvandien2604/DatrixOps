package collector

import (
	"context"
	"fmt"
	"io/ioutil"
	"net/http"
	"os/exec"
	"sort"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/host"
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
	Name   string `json:"name"`
	Status string `json:"status"` // running, stopped, not_installed
}

type SystemInfo struct {
	Kernel         string `json:"kernel"`
	Uptime         uint64 `json:"uptime"`
	PublicIP       string `json:"public_ip"`
	Virtualization string `json:"virtualization"`
}

type Snapshot struct {
	SystemInfo       *SystemInfo       `json:"system_info,omitempty"`
	TopProcesses     []TopProcess      `json:"top_processes,omitempty"`
	Services         []ServiceStatus   `json:"services,omitempty"`
	DockerContainers []DockerContainer `json:"docker_containers,omitempty"`
	PackageUpdate    int               `json:"package_update"`
}

func CollectSnapshot() *Snapshot {
	return &Snapshot{
		SystemInfo:       collectSystemInfo(),
		TopProcesses:     collectTopProcesses(),
		Services:         collectServices(),
		DockerContainers: collectDockerContainers(),
		PackageUpdate:    collectPackageUpdate(),
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
		body, _ := ioutil.ReadAll(resp.Body)
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

func collectServices() []ServiceStatus {
	services := []string{"nginx", "mysql", "redis-server", "docker", "apache2", "php-fpm"}
	var results []ServiceStatus

	for _, srv := range services {
		cmd := exec.Command("systemctl", "is-active", srv)
		out, _ := cmd.Output()
		status := strings.TrimSpace(string(out))
		
		if status == "active" {
			results = append(results, ServiceStatus{Name: srv, Status: "running"})
		} else if status == "inactive" || status == "failed" {
			results = append(results, ServiceStatus{Name: srv, Status: "stopped"})
		} else {
			results = append(results, ServiceStatus{Name: srv, Status: "not_installed"})
		}
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
