-- Migration 034: Remove website_channels table and all implicit alert associations
-- Websites operate purely as uptime monitors without implicit/background alert linkages.

DROP TABLE IF EXISTS website_channels CASCADE;
