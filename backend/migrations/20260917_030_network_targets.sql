-- Migration: User-configurable Network Targets and Results History
-- Date: 2026-09-17
-- Description: Enables dynamic user-defined network diagnostic targets and time-series result tracking.

CREATE TABLE IF NOT EXISTS network_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT NOT NULL DEFAULT 0,
    tag VARCHAR(100) NOT NULL DEFAULT 'default',
    probe_method VARCHAR(10) NOT NULL DEFAULT 'ICMP', -- 'ICMP' or 'TCP'
    probes_per_run INT NOT NULL DEFAULT 5,
    alert_latency_warning_ms DOUBLE PRECISION,
    alert_latency_critical_ms DOUBLE PRECISION,
    alert_loss_critical_pct DOUBLE PRECISION,
    enabled BOOLEAN NOT NULL DEFAULT true,
    is_gateway BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_network_targets_agent_id ON network_targets(agent_id);
CREATE INDEX IF NOT EXISTS idx_network_targets_tag ON network_targets(tag);
CREATE INDEX IF NOT EXISTS idx_network_targets_enabled ON network_targets(agent_id, enabled);

CREATE TABLE IF NOT EXISTS network_target_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id UUID NOT NULL REFERENCES network_targets(id) ON DELETE CASCADE,
    latency_ms DOUBLE PRECISION,
    min_latency_ms DOUBLE PRECISION,
    max_latency_ms DOUBLE PRECISION,
    packet_loss DOUBLE PRECISION,
    total_probes INT NOT NULL DEFAULT 0,
    successful_probes INT NOT NULL DEFAULT 0,
    failed_probes INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'optimal',
    measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_network_target_results_target_measured
    ON network_target_results(target_id, measured_at DESC);
