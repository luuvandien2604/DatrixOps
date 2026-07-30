-- Persist pending alert conditions so duration survives worker restarts.
ALTER TABLE alert_state
    ADD COLUMN IF NOT EXISTS condition_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_alert_state_status
    ON alert_state(status);
