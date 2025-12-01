-- Create api_keys table for device-based API key registration
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,                    -- The API key itself (cm_live_...)
  device_id TEXT UNIQUE NOT NULL,         -- iOS identifierForVendor
  device_name TEXT,                       -- "iPhone 15 Pro"
  app_version TEXT,                       -- "1.0.0"
  is_active BOOLEAN DEFAULT true,         -- Can be revoked
  is_admin BOOLEAN DEFAULT false,         -- Admin privileges
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  request_count INTEGER DEFAULT 0         -- Total requests made
);

-- Index for looking up by device_id during registration
CREATE INDEX idx_api_keys_device_id ON api_keys(device_id);

-- Index for active keys lookup during authentication
CREATE INDEX idx_api_keys_active ON api_keys(id) WHERE is_active = true;
