-- Allowlisted operational scripts. The Agent also keeps a built-in allowlist;
-- this table is the control-plane catalog and policy surface.
CREATE TABLE IF NOT EXISTS script_library (
    id VARCHAR(80) PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    os_family VARCHAR(40) NOT NULL DEFAULT 'linux',
    category VARCHAR(60) NOT NULL DEFAULT 'operations',
    requires_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
    timeout_seconds INTEGER NOT NULL DEFAULT 60,
    output_limit_bytes INTEGER NOT NULL DEFAULT 12000,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO script_library (
    id, name, description, os_family, category,
    requires_confirmation, timeout_seconds, output_limit_bytes, enabled
)
VALUES
    (
        'system_health_summary',
        'System health summary',
        'Read-only summary of uptime, disk usage, memory pressure and top processes.',
        'linux',
        'diagnostics',
        false,
        30,
        12000,
        true
    ),
    (
        'journal_errors_recent',
        'Recent systemd errors',
        'Read-only recent journalctl warning and error lines for quick incident triage.',
        'linux',
        'diagnostics',
        false,
        30,
        16000,
        true
    ),
    (
        'restart_nginx',
        'Restart Nginx',
        'Restart nginx through systemctl. Requires explicit operator confirmation.',
        'linux',
        'service-control',
        true,
        60,
        8000,
        true
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    os_family = EXCLUDED.os_family,
    category = EXCLUDED.category,
    requires_confirmation = EXCLUDED.requires_confirmation,
    timeout_seconds = EXCLUDED.timeout_seconds,
    output_limit_bytes = EXCLUDED.output_limit_bytes,
    enabled = EXCLUDED.enabled,
    updated_at = NOW();
