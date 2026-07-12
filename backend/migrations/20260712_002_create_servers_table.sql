-- Migration: Create Servers Table
-- Date: 2026-07-12
-- Description: Creates the servers table to manage monitored infrastructure.

CREATE TABLE IF NOT EXISTS servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    agent_token VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'offline',
    os_info JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_server_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for querying servers by user quickly
CREATE INDEX IF NOT EXISTS idx_servers_user_id ON servers(user_id);
