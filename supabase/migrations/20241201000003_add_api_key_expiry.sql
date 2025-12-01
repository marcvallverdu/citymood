-- Add expiration column to api_keys table
-- Keys expire 1 year after creation, but auto-renew on use

ALTER TABLE api_keys ADD COLUMN expires_at TIMESTAMPTZ;

-- Set default expiration for existing keys (1 year from now)
UPDATE api_keys SET expires_at = NOW() + INTERVAL '1 year' WHERE expires_at IS NULL;

-- Make expires_at NOT NULL with default of 1 year from creation
ALTER TABLE api_keys ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '1 year';
ALTER TABLE api_keys ALTER COLUMN expires_at SET NOT NULL;

-- Index for efficient expiration checks
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at) WHERE is_active = true;
