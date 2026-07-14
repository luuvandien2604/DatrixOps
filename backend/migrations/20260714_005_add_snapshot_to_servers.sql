-- Add snapshot JSONB to servers
ALTER TABLE servers ADD COLUMN IF NOT EXISTS snapshot JSONB DEFAULT '{}'::jsonb;
