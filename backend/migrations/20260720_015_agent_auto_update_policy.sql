-- Per-Agent automatic signed-release update policy. Opt-in by default.
ALTER TABLE servers
    ADD COLUMN IF NOT EXISTS auto_update_agent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_servers_auto_update_agent
    ON servers(auto_update_agent)
    WHERE auto_update_agent = TRUE;
