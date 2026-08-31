-- Cleanup stale update tasks that have been pending or processing for more than 15 minutes
UPDATE server_tasks
SET status = 'cancelled',
    result = '{"output": "Cleared stale task during system upgrade"}'::jsonb,
    completed_at = NOW(),
    updated_at = NOW()
WHERE status IN ('pending', 'processing')
  AND created_at < NOW() - INTERVAL '15 minutes';

-- Cleanup duplicate offline host records if an online or active host record exists
DO $$
DECLARE
    v_main_host_id UUID;
BEGIN
    SELECT id INTO v_main_host_id
    FROM servers
    WHERE tags ? 'self-host'
       OR tags ? 'control-plane'
       OR name ILIKE '%DatrixOps%'
       OR name ILIKE '%Control Plane%'
       OR name = 'Server'
    ORDER BY
        CASE WHEN status = 'online' THEN 0 ELSE 1 END,
        last_seen_at DESC NULLS LAST,
        created_at ASC
    LIMIT 1;

    IF v_main_host_id IS NOT NULL THEN
        DELETE FROM servers
        WHERE id != v_main_host_id
          AND (
              tags ? 'self-host'
              OR tags ? 'control-plane'
              OR name = 'Server'
              OR (name ILIKE '%DatrixOps%' AND status = 'offline' AND last_seen_at IS NULL)
          );
    END IF;
END $$;
