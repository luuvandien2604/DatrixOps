-- Idempotent repair migration for deployments that received the task handlers
-- before the complete lifecycle schema was packaged into the backend image.
ALTER TABLE server_tasks
    ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120),
    ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_server_tasks_idempotency
    ON server_tasks(server_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_server_tasks_claim
    ON server_tasks(server_id, status, created_at)
    WHERE status = 'pending';

-- Keep one active update (prefer a task already processing, otherwise the
-- newest pending task) before enforcing one in-flight update per server.
WITH duplicate_updates AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY server_id
               ORDER BY CASE WHEN status = 'processing' THEN 0 ELSE 1 END,
                        created_at DESC,
                        id DESC
           ) AS position
    FROM server_tasks
    WHERE type = 'agent_update'
      AND status IN ('pending', 'processing')
)
UPDATE server_tasks
SET status = 'expired',
    completed_at = COALESCE(completed_at, NOW()),
    updated_at = NOW()
WHERE id IN (
    SELECT id
    FROM duplicate_updates
    WHERE position > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_server_tasks_active_agent_update
    ON server_tasks(server_id)
    WHERE type = 'agent_update'
      AND status IN ('pending', 'processing');
