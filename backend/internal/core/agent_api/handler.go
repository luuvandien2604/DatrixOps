package agent_api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/response"
)

type Handler struct {
	db *database.DB
}

func NewHandler(db *database.DB) *Handler {
	return &Handler{db: db}
}

type HeartbeatRequest struct {
	OSName      string  `json:"os_name"`
	CPUCores    int     `json:"cpu_cores"`
	CPUUsage    float64 `json:"cpu_usage"`
	MemoryTotal uint64  `json:"memory_total"`
	MemoryUsed  uint64  `json:"memory_used"`
	NetIn       uint64  `json:"net_in"`
	NetOut      uint64  `json:"net_out"`
	DiskRead    uint64  `json:"disk_read"`
	DiskWrite   uint64  `json:"disk_write"`
}

func (h *Handler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	// 1. Extract and validate Agent Token from header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Missing Authorization header")
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid Authorization header format")
		return
	}
	agentToken := parts[1]

	// 2. Parse Payload
	var req HeartbeatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid request body")
		return
	}

	// 3. Update Server Status in Database
	// We use the agent_token directly to find the server and update it.
	// Convert OS Info to JSON string
	osInfoBytes, _ := json.Marshal(req)
	osInfoStr := string(osInfoBytes)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var serverID string
	err := h.db.Pool.QueryRow(ctx,
		`UPDATE servers 
		 SET status = 'online', 
		     os_info = $1, 
		     updated_at = NOW() 
		 WHERE agent_token = $2
		 RETURNING id`,
		osInfoStr, agentToken,
	).Scan(&serverID)

	if err != nil {
		if err.Error() == "no rows in result set" {
			response.Error(w, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid agent token")
		} else {
			response.Error(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Failed to update server status")
		}
		return
	}

	// Insert into server_metrics
	_, err = h.db.Pool.Exec(ctx,
		`INSERT INTO server_metrics (server_id, cpu_usage, memory_used, memory_total, net_in, net_out, disk_read, disk_write)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		serverID, req.CPUUsage, req.MemoryUsed, req.MemoryTotal, req.NetIn, req.NetOut, req.DiskRead, req.DiskWrite,
	)
	if err != nil {
		// Just log error, don't fail heartbeat
		println("Error inserting metric:", err.Error())
	}

	response.Success(w, http.StatusOK, map[string]string{"status": "recorded"})
}
