-- Sửa dữ liệu liên kết alert rule/channel sai tenant và ngăn tái diễn.
-- File này idempotent vì backend hiện chạy lại toàn bộ migration khi khởi động.

-- Xóa liên kết không hợp lệ: rule và channel không thuộc cùng một user.
DELETE FROM alert_rule_channels arc
USING alert_rules r, alert_channels c
WHERE arc.alert_rule_id = r.id
  AND arc.alert_channel_id = c.id
  AND r.user_id IS DISTINCT FROM c.user_id;

-- Trigger bảo đảm mọi liên kết mới luôn cùng user.
CREATE OR REPLACE FUNCTION validate_alert_rule_channel_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    rule_user_id UUID;
    channel_user_id UUID;
BEGIN
    SELECT user_id INTO rule_user_id
    FROM alert_rules
    WHERE id = NEW.alert_rule_id;

    SELECT user_id INTO channel_user_id
    FROM alert_channels
    WHERE id = NEW.alert_channel_id;

    IF rule_user_id IS NULL OR channel_user_id IS NULL THEN
        RAISE EXCEPTION 'alert rule and channel must have an owner';
    END IF;

    IF rule_user_id IS DISTINCT FROM channel_user_id THEN
        RAISE EXCEPTION 'alert rule and channel must belong to the same user';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_alert_rule_channel_owner
ON alert_rule_channels;

CREATE TRIGGER trg_validate_alert_rule_channel_owner
BEFORE INSERT OR UPDATE ON alert_rule_channels
FOR EACH ROW
EXECUTE FUNCTION validate_alert_rule_channel_owner();
