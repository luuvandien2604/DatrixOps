-- Self-hosted single-instance setup and one-time Agent enrollment.

CREATE TABLE IF NOT EXISTS system_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    system_name VARCHAR(120) NOT NULL DEFAULT 'DatrixOps',
    timezone VARCHAR(120) NOT NULL DEFAULT 'UTC',
    public_url TEXT NOT NULL DEFAULT '',
    registration_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    setup_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE servers
    ALTER COLUMN agent_token DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS agent_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS enrollment_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS enrollment_token_expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS enrollment_used_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS hostname VARCHAR(255),
    ADD COLUMN IF NOT EXISTS architecture VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_agent_token_hash
    ON servers(agent_token_hash)
    WHERE agent_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_enrollment_token_hash
    ON servers(enrollment_token_hash)
    WHERE enrollment_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_servers_pending_enrollment
    ON servers(enrollment_token_expires_at)
    WHERE enrollment_used_at IS NULL
      AND enrollment_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS system_runtime (
    component VARCHAR(80) PRIMARY KEY,
    status VARCHAR(40) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
