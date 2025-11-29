-- Add time_of_day column to city_images table
-- Values: 'day' or 'night'

-- First, drop the existing unique constraint
DROP INDEX IF EXISTS city_images_city_weather_idx;

-- Add the new column with default 'day' for existing records
ALTER TABLE city_images ADD COLUMN IF NOT EXISTS time_of_day TEXT NOT NULL DEFAULT 'day';

-- Create new unique index on city + weather_category + time_of_day
CREATE UNIQUE INDEX city_images_city_weather_time_idx ON city_images (city, weather_category, time_of_day);
