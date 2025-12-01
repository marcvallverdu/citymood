-- Migrate API keys to use hashed storage
-- The actual key is only returned once at creation time

-- Add key_hash column (will store SHA-256 hash of the key)
ALTER TABLE api_keys ADD COLUMN key_hash TEXT;

-- Create index on key_hash for lookups
CREATE UNIQUE INDEX idx_api_keys_key_hash ON api_keys(key_hash);

-- Hash existing keys (SHA-256)
-- Note: After this migration, the 'id' column still contains the plaintext key
-- for backward compatibility. A future migration can remove it once all clients
-- are updated to store their keys securely.
UPDATE api_keys
SET key_hash = encode(sha256(id::bytea), 'hex')
WHERE key_hash IS NULL;

-- Make key_hash NOT NULL after populating
ALTER TABLE api_keys ALTER COLUMN key_hash SET NOT NULL;
