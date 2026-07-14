CREATE TABLE IF NOT EXISTS server_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    cpu_usage DOUBLE PRECISION NOT NULL DEFAULT 0,
    memory_used BIGINT NOT NULL DEFAULT 0,
    memory_total BIGINT NOT NULL DEFAULT 0,
    net_in BIGINT NOT NULL DEFAULT 0,
    net_out BIGINT NOT NULL DEFAULT 0,
    disk_read BIGINT NOT NULL DEFAULT 0,
    disk_write BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_server_id_created_at ON server_metrics(server_id, created_at DESC);
