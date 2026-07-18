-- Keep agent presence separate from administrative server updates.
ALTER TABLE servers ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Preserve the best known heartbeat for existing online agents.
UPDATE servers
SET last_seen_at = updated_at
WHERE last_seen_at IS NULL
  AND status = 'online';

CREATE INDEX IF NOT EXISTS idx_servers_user_last_seen
ON servers(user_id, last_seen_at DESC);
