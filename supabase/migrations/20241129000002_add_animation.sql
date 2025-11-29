-- Add animation support to city_images table
ALTER TABLE city_images
ADD COLUMN IF NOT EXISTS animation_url text,
ADD COLUMN IF NOT EXISTS animation_status text DEFAULT 'none' CHECK (animation_status IN ('none', 'pending', 'processing', 'completed', 'failed'));

-- Add index for finding images that need animation
CREATE INDEX IF NOT EXISTS idx_city_images_animation_status ON city_images(animation_status);
