-- Alert system enhancements: Website downtime tracking, SSL alerts, and alert rule repeat interval.
ALTER TABLE websites
    ADD COLUMN IF NOT EXISTS down_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_ssl_alert_at TIMESTAMPTZ;

-- Table to link websites with specific alert channels (optional; falls back to all user channels if empty)
CREATE TABLE IF NOT EXISTS website_channels (
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    alert_channel_id UUID NOT NULL REFERENCES alert_channels(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (website_id, alert_channel_id)
);

CREATE INDEX IF NOT EXISTS idx_website_channels_channel_id
    ON website_channels(alert_channel_id);

-- Support repeat_interval_minutes and target_name for alert rules
ALTER TABLE alert_rules
    ADD COLUMN IF NOT EXISTS repeat_interval_minutes INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS target_name VARCHAR(255);

-- Track last notification sent time for repeat interval in alert_state
ALTER TABLE alert_state
    ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;
