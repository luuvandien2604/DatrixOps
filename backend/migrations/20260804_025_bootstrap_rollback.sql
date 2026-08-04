-- Add short-lived bootstrap rollback credential and completion tracking to servers table.

ALTER TABLE servers
    ADD COLUMN IF NOT EXISTS bootstrap_rollback_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS bootstrap_rollback_expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS bootstrap_completed_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_bootstrap_rollback_token_hash
    ON servers(bootstrap_rollback_token_hash)
    WHERE bootstrap_rollback_token_hash IS NOT NULL;
