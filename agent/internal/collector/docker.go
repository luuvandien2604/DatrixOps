package collector

import (
	"context"
	"encoding/json"
	"os/exec"
	"strings"
	"time"
)

type DockerContainer struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Image  string `json:"image"`
	State  string `json:"state"`
	Status string `json:"status"`
	CPU    string `json:"cpu"`
	RAM    string `json:"ram"`
}

func collectDockerContainers() []DockerContainer {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// 1. Check if docker is available
	cmdPath, err := exec.LookPath("docker")
	if err != nil {
		return nil
	}

	// 2. Get list of containers with state/status
	// docker ps -a --format '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","state":"{{.State}}","status":"{{.Status}}"}'
	psCmd := exec.CommandContext(ctx, cmdPath, "ps", "-a", "--format", `{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","state":"{{.State}}","status":"{{.Status}}"}`)
	psOut, err := psCmd.Output()
	if err != nil {
		return nil
	}

	var containers []DockerContainer
	lines := strings.Split(strings.TrimSpace(string(psOut)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		var c DockerContainer
		if err := json.Unmarshal([]byte(line), &c); err == nil {
			containers = append(containers, c)
		}
	}

	// 3. Get stats for running containers
	// docker stats --no-stream --format '{"id":"{{.ID}}","cpu":"{{.CPUPerc}}","ram":"{{.MemPerc}}"}'
	statsCmd := exec.CommandContext(ctx, cmdPath, "stats", "--no-stream", "--format", `{"id":"{{.ID}}","cpu":"{{.CPUPerc}}","ram":"{{.MemPerc}}"}`)
	statsOut, err := statsCmd.Output()
	if err == nil {
		statsLines := strings.Split(strings.TrimSpace(string(statsOut)), "\n")
		statsMap := make(map[string]map[string]string)
		for _, line := range statsLines {
			if line == "" {
				continue
			}
			var s map[string]string
			if err := json.Unmarshal([]byte(line), &s); err == nil {
				statsMap[s["id"]] = s
			}
		}

		// Merge stats into containers
		for i := range containers {
			if stats, ok := statsMap[containers[i].ID]; ok {
				containers[i].CPU = stats["cpu"]
				containers[i].RAM = stats["ram"]
			} else {
				containers[i].CPU = "0.00%"
				containers[i].RAM = "0.00%"
			}
		}
	}

	return containers
}
