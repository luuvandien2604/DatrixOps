package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/luuvandien2604/DatrixOps/agent/internal/collector"
	"github.com/luuvandien2604/DatrixOps/agent/internal/config"
)

type DatrixClient struct {
	cfg        *config.Config
	httpClient *http.Client
}

func New(cfg *config.Config) *DatrixClient {
	return &DatrixClient{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 10 * time.Second, // 10s timeout for each request
		},
	}
}

type Task struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Payload string `json:"payload"`
}

type HeartbeatResponse struct {
	UpdateRequired bool   `json:"update_required"`
	Tasks          []Task `json:"tasks"`
}

// SendHeartbeat sends the collected metrics to the Core API.
func (c *DatrixClient) SendHeartbeat(ctx context.Context, metrics *collector.Metrics) (*HeartbeatResponse, error) {
	payload, err := json.Marshal(metrics)
	if err != nil {
		return nil, fmt.Errorf("marshal metrics: %w", err)
	}

	url := fmt.Sprintf("%s/agent/heartbeat", c.cfg.ServerURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(payload))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.cfg.AgentToken))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var result HeartbeatResponse
	_ = json.NewDecoder(resp.Body).Decode(&result)

	return &result, nil
}

func (c *DatrixClient) ReportTaskResult(ctx context.Context, taskID, status, result string) error {
	payload, _ := json.Marshal(map[string]string{
		"task_id": taskID,
		"status":  status,
		"result":  result,
	})

	url := fmt.Sprintf("%s/agent/tasks/result", c.cfg.ServerURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(payload))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.cfg.AgentToken))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
