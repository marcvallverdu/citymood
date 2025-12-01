-- Add job_type column to video_jobs table to distinguish image-only jobs from video jobs
ALTER TABLE video_jobs ADD COLUMN job_type TEXT DEFAULT 'video';

-- Create index for querying by job type
CREATE INDEX idx_video_jobs_job_type ON video_jobs(job_type);
