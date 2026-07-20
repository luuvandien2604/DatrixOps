-- Migration: Remote Agent uninstall lifecycle
-- Date: 2026-07-20
-- Description:
--   Adds the server deletion state machine and a one-time confirmation token
--   used by the detached Linux uninstall helper.

ALTER TABLE servers
    ADD COLUMN IF NOT EXISTS deletion_status VARCHAR(30) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_error TEXT,
    ADD COLUMN IF NOT EXISTS uninstall_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS uninstall_token_expires_at TIMESTAMPTZ;

-- Normalize rows created before this migration.
UPDATE servers
SET deletion_status = 'active'
WHERE deletion_status IS NULL OR deletion_status = '';

-- Ensure only one uninstall command can be active for a server at a time.
WITH duplicate_uninstalls AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY server_id
               ORDER BY CASE WHEN status = 'processing' THEN 0 ELSE 1 END,
                        created_at DESC,
                        id DESC
           ) AS position
    FROM server_tasks
    WHERE type = 'agent_uninstall'
      AND status IN ('pending', 'processing')
)
UPDATE server_tasks
SET status = 'expired',
    completed_at = COALESCE(completed_at, NOW()),
    updated_at = NOW()
WHERE id IN (
    SELECT id
    FROM duplicate_uninstalls
    WHERE position > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_server_tasks_active_agent_uninstall
    ON server_tasks(server_id)
    WHERE type = 'agent_uninstall'
      AND status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_servers_deletion_status
    ON servers(user_id, deletion_status);
