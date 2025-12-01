-- Add video_url column for storing raw MP4 video alongside processed APNG
-- This allows comparing original video quality vs. processed animation
ALTER TABLE city_images
ADD COLUMN IF NOT EXISTS video_url text;
