package collector

type platformMetrics struct {
	OSName      string
	CPUCores    int
	CPUUsage    float64
	MemoryTotal uint64
	MemoryUsed  uint64
	NetIn       uint64
	NetOut      uint64
	DiskRead    uint64
	DiskWrite   uint64
	DiskTotal   uint64
	DiskUsed    uint64
	DiskUsage   float64
}

type platformHostInfo struct {
	Platform        string
	PlatformVersion string
	KernelVersion   string
	Uptime          uint64
	BootTime        uint64
	Virtualization  string
}

type platformCPUDetails struct {
	ModelName     string
	LogicalCores  int
	PhysicalCores int
}

type platformNetInterface struct {
	Name         string
	HardwareAddr string
	Flags        []string
	Addrs        []string
}

type platformNetIOCounter struct {
	Name        string
	BytesRecv   uint64
	BytesSent   uint64
	PacketsRecv uint64
	PacketsSent uint64
	Errin       uint64
	Errout      uint64
	Dropin      uint64
	Dropout     uint64
}
