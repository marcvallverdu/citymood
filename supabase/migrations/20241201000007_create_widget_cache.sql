-- Create widget_cache table for storing generated APNG images with weather overlays
CREATE TABLE widget_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  weather_hash TEXT NOT NULL,
  apng_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(city, weather_hash)
);

CREATE INDEX idx_widget_cache_city ON widget_cache(city);
CREATE INDEX idx_widget_cache_expires ON widget_cache(expires_at);
