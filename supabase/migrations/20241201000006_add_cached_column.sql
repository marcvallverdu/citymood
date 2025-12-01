-- Add cached column to video_jobs table to track if result was from cache
ALTER TABLE video_jobs ADD COLUMN cached BOOLEAN DEFAULT false;
