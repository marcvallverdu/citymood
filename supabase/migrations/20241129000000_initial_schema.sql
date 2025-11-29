-- CityMood Database Schema
-- Run this SQL in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Weather Cache Table
-- Stores cached weather data for cities (refreshes every hour)
CREATE TABLE IF NOT EXISTS weather_cache (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    city TEXT NOT NULL,
    weather_category TEXT NOT NULL,
    weather_data JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index on city (normalized/lowercase)
CREATE UNIQUE INDEX IF NOT EXISTS weather_cache_city_idx ON weather_cache (city);

-- City Images Table
-- Stores references to generated images per city and weather category
CREATE TABLE IF NOT EXISTS city_images (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    city TEXT NOT NULL,
    weather_category TEXT NOT NULL,
    image_url TEXT NOT NULL,
    prompt_used TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index on city + weather_category combination
CREATE UNIQUE INDEX IF NOT EXISTS city_images_city_weather_idx ON city_images (city, weather_category);

-- Row Level Security (RLS) Policies
-- Enable RLS on tables
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE city_images ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated and anon users
CREATE POLICY "Allow read access to weather_cache" ON weather_cache
    FOR SELECT USING (true);

CREATE POLICY "Allow read access to city_images" ON city_images
    FOR SELECT USING (true);

-- Allow insert/update for service role (used by API)
-- Note: When using anon key with service operations, you may need to adjust these
CREATE POLICY "Allow insert to weather_cache" ON weather_cache
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update to weather_cache" ON weather_cache
    FOR UPDATE USING (true);

CREATE POLICY "Allow insert to city_images" ON city_images
    FOR INSERT WITH CHECK (true);

-- Storage Bucket Setup
-- Run these in separate SQL commands or use the Supabase dashboard

-- Create the storage bucket (if using SQL)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('city-images', 'city-images', true)
-- ON CONFLICT (id) DO NOTHING;

-- Storage policy for public read access
-- CREATE POLICY "Public read access for city-images" ON storage.objects
--     FOR SELECT USING (bucket_id = 'city-images');

-- Storage policy for insert (upload) access
-- CREATE POLICY "Allow uploads to city-images" ON storage.objects
--     FOR INSERT WITH CHECK (bucket_id = 'city-images');

/*
MANUAL STEPS IN SUPABASE DASHBOARD:

1. Go to Storage in your Supabase dashboard
2. Create a new bucket called "city-images"
3. Make the bucket PUBLIC (toggle the public setting)
4. The bucket should allow uploads from your API

Alternatively, you can run the commented SQL above after adjusting for your setup.
*/
