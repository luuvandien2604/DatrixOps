-- System webhooks for outbound operational events.
-- Idempotent because the current backend reruns every migration on startup.
CREATE TABLE IF NOT EXISTS system_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    name VARCHAR(120) NOT NULL,
    url TEXT NOT NULL,
    signing_secret TEXT NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_delivery_status VARCHAR(20),
    last_delivery_at TIMESTAMP WITH TIME ZONE,
    last_delivery_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_webhooks_user_created
    ON system_webhooks(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_webhooks_user_enabled
    ON system_webhooks(user_id, enabled);

CREATE TABLE IF NOT EXISTS system_webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    webhook_id UUID
        REFERENCES system_webhooks(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    event_type VARCHAR(80) NOT NULL,
    event_id VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL,
    status_code INTEGER,
    latency_ms INTEGER,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_attempt_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE system_webhook_deliveries
    ADD COLUMN IF NOT EXISTS event_id VARCHAR(80) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_system_webhook_deliveries_user_created
    ON system_webhook_deliveries(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_webhook_deliveries_webhook_created
    ON system_webhook_deliveries(webhook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_webhook_deliveries_retry
    ON system_webhook_deliveries(next_attempt_at, created_at)
    WHERE status = 'failed';

CREATE TABLE IF NOT EXISTS system_event_state (
    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    server_id UUID
        REFERENCES servers(id)
        ON DELETE CASCADE,

    event_type VARCHAR(80) NOT NULL,
    resource_key VARCHAR(180) NOT NULL,
    state VARCHAR(40) NOT NULL,
    last_event_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, event_type, resource_key)
);

CREATE INDEX IF NOT EXISTS idx_system_event_state_server
    ON system_event_state(server_id, event_type);
