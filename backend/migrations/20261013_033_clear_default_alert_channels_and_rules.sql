-- Migration 033: Clear implicit website alert channel bindings and default alert rules
-- Ensures no website or server sends alerts to Discord/Telegram/Email unless explicitly configured.

-- 1. Clear all implicit/default website alert channel bindings.
-- Websites will monitor uptime and SSL on the dashboard only, without sending external webhook alerts.
DELETE FROM website_channels;

-- 2. Clear any default or orphan alert rules if they exist.
DELETE FROM alert_rules WHERE name ILIKE '%default%' OR name ILIKE '%mặc định%';
DELETE FROM alert_state WHERE rule_id NOT IN (SELECT id FROM alert_rules);
