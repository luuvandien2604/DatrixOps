-- Durable website probe history and configurable retention support.
CREATE TABLE IF NOT EXISTS website_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    failure_kind VARCHAR(80),
    ssl_days_remaining INTEGER,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_checks_website_checked
    ON website_checks(website_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_website_checks_checked
    ON website_checks(checked_at);

CREATE INDEX IF NOT EXISTS idx_server_metrics_created_at
    ON server_metrics(created_at);
