-- Create video_jobs table for async job processing
CREATE TABLE video_jobs (
  id TEXT PRIMARY KEY,
  api_key_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  stage TEXT,
  city TEXT NOT NULL,
  country TEXT,
  weather_data JSONB,
  image_url TEXT,
  video_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for finding jobs by API key (for rate limiting)
CREATE INDEX idx_video_jobs_api_key_hash ON video_jobs(api_key_hash);

-- Index for finding active jobs by status
CREATE INDEX idx_video_jobs_status ON video_jobs(status);

-- Index for finding active jobs by API key and status (for rate limit checks)
CREATE INDEX idx_video_jobs_api_key_status ON video_jobs(api_key_hash, status);

-- Add comment describing the table
COMMENT ON TABLE video_jobs IS 'Tracks async video generation jobs for the public API';
COMMENT ON COLUMN video_jobs.id IS 'Unique job ID (e.g., job_abc123xyz)';
COMMENT ON COLUMN video_jobs.api_key_hash IS 'SHA-256 hash of the API key for ownership validation';
COMMENT ON COLUMN video_jobs.status IS 'Job status: pending, processing, completed, failed';
COMMENT ON COLUMN video_jobs.stage IS 'Current processing stage: fetching_weather, generating_image, generating_video, processing_video';
COMMENT ON COLUMN video_jobs.weather_data IS 'Cached weather data for the job';
