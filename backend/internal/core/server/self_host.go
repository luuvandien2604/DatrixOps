package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/luuvandien2604/DatrixOps/backend/internal/platform/database"
)

const selfMonitorEnvPath = "/etc/datrixops/self-monitor.env"

// ReadSelfMonitorToken extracts the raw DATRIXOPS_AGENT_TOKEN and its SHA-256 hash
// from /etc/datrixops/self-monitor.env if the file exists.
func ReadSelfMonitorToken() (rawToken, tokenHash string, exists bool) {
	content, err := os.ReadFile(selfMonitorEnvPath)
	if err != nil {
		return "", "", false
	}

	lines := strings.Split(string(content), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "DATRIXOPS_AGENT_TOKEN=") {
			rawToken = strings.TrimSpace(strings.TrimPrefix(line, "DATRIXOPS_AGENT_TOKEN="))
			rawToken = strings.Trim(rawToken, "\"'")
			break
		}
	}

	if rawToken == "" {
		return "", "", false
	}

	sum := sha256.Sum256([]byte(rawToken))
	tokenHash = hex.EncodeToString(sum[:])
	return rawToken, tokenHash, true
}

// CheckSelfMonitorToken returns true if providedToken matches the token configured
// in /etc/datrixops/self-monitor.env.
func CheckSelfMonitorToken(providedToken string) bool {
	rawToken, _, exists := ReadSelfMonitorToken()
	if !exists || rawToken == "" {
		return false
	}
	return strings.TrimSpace(providedToken) == rawToken
}

// SyncSelfHost ensures that the server record in the database matches the credentials
// configured in /etc/datrixops/self-monitor.env, eliminating token drift or 401s.
func SyncSelfHost(ctx context.Context, db *database.DB, log *slog.Logger) error {
	_, tokenHash, exists := ReadSelfMonitorToken()
	if !exists {
		if log != nil {
			log.Debug("self-monitor env file not present, skipping self-host database sync", "path", selfMonitorEnvPath)
		}
		return nil
	}

	if log != nil {
		log.Info("syncing self-host server credential from env file", "path", selfMonitorEnvPath, "hash_prefix", tokenHash[:8])
	}

	ctxTimeout, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// 1. Identify primary administrative user ID
	var userID string
	err := db.Pool.QueryRow(ctxTimeout,
		`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`,
	).Scan(&userID)
	if err != nil {
		if log != nil {
			log.Warn("no administrative user found to bind self-host server", "error", err)
		}
		return fmt.Errorf("no administrative user: %w", err)
	}

	// 2. Find existing Control Plane / Self-Host record
	var existingServerID string
	err = db.Pool.QueryRow(ctxTimeout,
		`SELECT id FROM servers
		 WHERE agent_token_hash = $1
		    OR tags ? 'self-host'
		    OR tags ? 'control-plane'
		    OR name ILIKE '%DatrixOps%'
		    OR name ILIKE '%Control Plane%'
		    OR name = 'Server'
		 ORDER BY
		    CASE WHEN agent_token_hash = $1 THEN 0
		         WHEN status = 'online' THEN 1
		         ELSE 2 END,
		    last_seen_at DESC NULLS LAST,
		    created_at ASC
		 LIMIT 1`,
		tokenHash,
	).Scan(&existingServerID)

	if err != nil {
		// Insert new Control Plane server record
		_, err = db.Pool.Exec(ctxTimeout,
			`INSERT INTO servers (
				user_id, name, ip_address, status, agent_token_hash, enrolled_at, tags
			) VALUES (
				$1, 'Control Plane', '127.0.0.1', 'offline', $2, NOW(), '["self-host", "control-plane"]'::jsonb
			)`,
			userID, tokenHash,
		)
		if err != nil {
			if log != nil {
				log.Error("failed to create self-host server record", "error", err)
			}
			return fmt.Errorf("insert self-host server: %w", err)
		}
		if log != nil {
			log.Info("created self-host server record for Control Plane")
		}
	} else {
		// Update existing Control Plane server record to ensure matching agent_token_hash
		_, err = db.Pool.Exec(ctxTimeout,
			`UPDATE servers
			 SET user_id = $1,
			     name = COALESCE(NULLIF(name, ''), 'Control Plane'),
			     tags = CASE
			         WHEN tags IS NULL OR tags = '[]'::jsonb THEN '["self-host", "control-plane"]'::jsonb
			         WHEN NOT (tags ? 'self-host') AND NOT (tags ? 'control-plane') THEN tags || '["self-host", "control-plane"]'::jsonb
			         ELSE tags
			     END,
			     agent_token_hash = $2,
			     enrolled_at = COALESCE(enrolled_at, NOW()),
			     updated_at = NOW()
			 WHERE id = $3`,
			userID, tokenHash, existingServerID,
		)
		if err != nil {
			if log != nil {
				log.Error("failed to update self-host server record", "error", err)
			}
			return fmt.Errorf("update self-host server: %w", err)
		}

		// Clean up duplicate offline server records with self-host/control-plane tags
		_, _ = db.Pool.Exec(ctxTimeout,
			`DELETE FROM servers
			 WHERE id != $1
			   AND (
			       tags ? 'self-host'
			       OR tags ? 'control-plane'
			       OR name ILIKE '%DatrixOps%'
			       OR name ILIKE '%Control Plane%'
			       OR name = 'Server'
			   )
			   AND status = 'offline'`,
			existingServerID,
		)

		if log != nil {
			log.Info("synchronized self-host server record with active token", "server_id", existingServerID)
		}
	}

	return nil
}
