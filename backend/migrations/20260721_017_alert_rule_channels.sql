-- Liên kết nhiều-nhiều giữa alert rule và notification channel.
-- Một rule có thể gửi qua nhiều channel; một channel có thể được nhiều rule sử dụng.
CREATE TABLE IF NOT EXISTS alert_rule_channels (
    alert_rule_id UUID NOT NULL
        REFERENCES alert_rules(id)
        ON DELETE CASCADE,

    alert_channel_id UUID NOT NULL
        REFERENCES alert_channels(id)
        ON DELETE RESTRICT,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    PRIMARY KEY (alert_rule_id, alert_channel_id)
);

-- Tăng tốc truy vấn ngược để kiểm tra một channel đang được rule nào sử dụng.
CREATE INDEX IF NOT EXISTS idx_alert_rule_channels_channel_id
    ON alert_rule_channels(alert_channel_id);
