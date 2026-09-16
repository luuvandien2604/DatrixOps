-- Daily Uptime Rollup table for 90-day history bars and status page
CREATE TABLE IF NOT EXISTS daily_uptime_rollups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(20) NOT NULL, -- 'website' or 'server'
    entity_id UUID NOT NULL,
    date DATE NOT NULL,
    uptime_pct NUMERIC(5, 2) NOT NULL DEFAULT 100.0,
    downtime_seconds INTEGER NOT NULL DEFAULT 0,
    total_checks INTEGER NOT NULL DEFAULT 0,
    failed_checks INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms NUMERIC(7, 2) NOT NULL DEFAULT 0.0,
    status VARCHAR(20) NOT NULL DEFAULT 'operational', -- 'operational', 'degraded', 'outage', 'no_data'
    incident_title VARCHAR(255),
    incident_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_daily_uptime_rollup UNIQUE (entity_type, entity_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_uptime_rollups_lookup
    ON daily_uptime_rollups(entity_type, entity_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_uptime_rollups_date
    ON daily_uptime_rollups(date);

-- Initial backfill from existing website_checks (if any) for the past 90 days
INSERT INTO daily_uptime_rollups (
    entity_type, entity_id, date, uptime_pct, downtime_seconds,
    total_checks, failed_checks, avg_latency_ms, status, incident_title
)
SELECT 
    'website' AS entity_type,
    website_id AS entity_id,
    checked_at::date AS date,
    ROUND(COUNT(CASE WHEN status = 'UP' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100.0, 2) AS uptime_pct,
    COUNT(CASE WHEN status != 'UP' THEN 1 END) * 60 AS downtime_seconds,
    COUNT(*) AS total_checks,
    COUNT(CASE WHEN status != 'UP' THEN 1 END) AS failed_checks,
    ROUND(AVG(COALESCE(response_time_ms, 0))::numeric, 2) AS avg_latency_ms,
    CASE 
        WHEN COUNT(CASE WHEN status != 'UP' THEN 1 END) = 0 THEN 'operational'
        WHEN COUNT(CASE WHEN status = 'UP' THEN 1 END)::numeric / COUNT(*) >= 0.95 THEN 'degraded'
        ELSE 'outage'
    END AS status,
    MAX(failure_kind) AS incident_title
FROM website_checks
WHERE checked_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY website_id, checked_at::date
ON CONFLICT (entity_type, entity_id, date) DO NOTHING;
