CREATE TABLE IF NOT EXISTS terminal_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    remote_address TEXT,
    cols INTEGER NOT NULL DEFAULT 120,
    rows INTEGER NOT NULL DEFAULT 32,
    bytes_from_browser BIGINT NOT NULL DEFAULT 0,
    bytes_from_agent BIGINT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    close_reason TEXT,
    CONSTRAINT terminal_sessions_status_check
        CHECK (status IN ('active', 'closed', 'agent_disconnected', 'timed_out', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_terminal_sessions_one_active_per_server
    ON terminal_sessions(server_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_user_started
    ON terminal_sessions(user_id, started_at DESC);

UPDATE terminal_sessions
SET status = 'failed',
    ended_at = COALESCE(ended_at, NOW()),
    close_reason = COALESCE(close_reason, 'Control plane restarted')
WHERE status = 'active';
