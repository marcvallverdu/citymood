import { fal } from "./fal";
import { supabase, STORAGE_BUCKET, CityImage, TimeOfDay, AnimationStatus } from "./supabase";
import { WeatherCategory, getCategoryDescription } from "./weather-categories";
import { normalizeCity } from "./weather";
import { generateVideoFromImage } from "./veo";
import { convertMp4ToApng } from "./ffmpeg";
import { ImageModel, IMAGE_MODELS, VideoModel } from "./models";



// Image prompt template with time of day
const PROMPT_TEMPLATE = `Create a highly detailed miniature diorama of {CITY} in isometric 3D view, placed on a thick textured platform base with rounded edges. Feature the city's most iconic landmarks and architectural elements as detailed miniature models. The scene should look like a collectible tabletop diorama with realistic depth and scale.

Style: lear, 45° top-down isometric miniature 3D cartoon scene, detailed miniature models, warm lighting, soft shadows, high-quality 3D render with PBR materials.

Weather and time: {WEATHER} {TIME_OF_DAY} atmosphere - integrate weather effects naturally (clouds, lighting mood, sky color).

Background: Clean, solid gradient background matching the {TIME_OF_DAY} sky color. The diorama should appear to float with a subtle shadow beneath the platform.`;

/**
 * Generate the image prompt for a city, weather category, and time of day
 */
export function generatePrompt(
  city: string,
  weather: WeatherCategory,
  timeOfDay: TimeOfDay
): string {
  const weatherDescription = getCategoryDescription(weather);
  const timeDescription = timeOfDay === "day" ? "day" : "night";
  return PROMPT_TEMPLATE.replace("{CITY}", city)
    .replace("{WEATHER}", weatherDescription)
    .replace("{TIME_OF_DAY}", timeDescription);
}

/**
 * Check if an image already exists for a city + weather + time of day combination
 */
export async function getCachedImage(
  city: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay
): Promise<CityImage | null> {
  const normalizedCity = normalizeCity(city);

  const { data } = await supabase
    .from("city_images")
    .select("*")
    .eq("city", normalizedCity)
    .eq("weather_category", weatherCategory)
    .eq("time_of_day", timeOfDay)
    .single<CityImage>();

  return data;
}

// Type for fal.ai image response (shared across models)
interface FalImage {
  url: string;
  file_name?: string;
  content_type?: string;
  width?: number;
  height?: number;
}

interface FalImageResponse {
  images: FalImage[];
  description?: string;
}

/**
 * Generate an image using the selected fal.ai model
 */
export async function generateImage(
  city: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay,
  model: ImageModel = "nano-banana"
): Promise<string> {
  const normalizedCity = normalizeCity(city);
  const prompt = generatePrompt(city, weatherCategory, timeOfDay);
  const modelConfig = IMAGE_MODELS[model];

  let result;

  console.log(`Starting ${model} image generation with fal.subscribe()...`);

  // Call the appropriate model with its specific parameters
  switch (model) {
    case "nano-banana":
      result = await fal.subscribe(modelConfig.id, {
        input: {
          prompt,
          aspect_ratio: "1:1",
          resolution: "1K",
          output_format: "png",
          num_images: 1,
        },
        onQueueUpdate(update) {
          console.log(`${model} status: ${update.status}`);
        },
      });
      break;

    case "seedream":
      result = await fal.subscribe(modelConfig.id, {
        input: {
          prompt,
          image_size: "square_hd",
          num_images: 1,
          enable_safety_checker: true,
        },
        onQueueUpdate(update) {
          console.log(`${model} status: ${update.status}`);
        },
      });
      break;

    case "imagen4":
      result = await fal.subscribe(modelConfig.id, {
        input: {
          prompt,
          aspect_ratio: "1:1",
          safety_filter_level: "block_low_and_above",
        },
        onQueueUpdate(update) {
          console.log(`${model} status: ${update.status}`);
        },
      });
      break;

    default:
      throw new Error(`Unknown image model: ${model}`);
  }

  const response = result.data as FalImageResponse;

  // Extract image URL from response
  if (!response.images || response.images.length === 0) {
    throw new Error("No image generated in response");
  }

  const generatedImageUrl = response.images[0].url;

  // Download the image from fal.ai
  const imageResponse = await fetch(generatedImageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.statusText}`);
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  // Upload to Supabase Storage
  const fileName = `${normalizedCity}/${weatherCategory}_${timeOfDay}.png`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, imageBuffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload image: ${uploadError.message}`);
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);

  // Save reference to database
  await supabase.from("city_images").upsert(
    {
      city: normalizedCity,
      weather_category: weatherCategory,
      time_of_day: timeOfDay,
      image_url: publicUrl,
      prompt_used: prompt,
    },
    {
      onConflict: "city,weather_category,time_of_day",
    }
  );

  return publicUrl;
}

/**
 * Get or generate an image for a city + weather + time of day combination
 */
export async function getOrGenerateImage(
  city: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay,
  imageModel: ImageModel = "nano-banana"
): Promise<{ imageUrl: string; cached: boolean; animationUrl?: string; videoUrl?: string; animationStatus: AnimationStatus }> {
  // Check for cached image first (only use cache if using default model)
  if (imageModel === "nano-banana") {
    const cached = await getCachedImage(city, weatherCategory, timeOfDay);
    if (cached) {
      return {
        imageUrl: cached.image_url,
        cached: true,
        animationUrl: cached.animation_url,
        videoUrl: cached.video_url,
        animationStatus: cached.animation_status || "none",
      };
    }
  }

  // Generate new image with selected model
  const imageUrl = await generateImage(city, weatherCategory, timeOfDay, imageModel);
  return { imageUrl, cached: false, animationStatus: "none" };
}

/**
 * Update animation status in the database
 */
export async function updateAnimationStatus(
  city: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay,
  status: AnimationStatus,
  animationUrl?: string,
  videoUrl?: string
): Promise<void> {
  const normalizedCity = normalizeCity(city);

  const updateData: { animation_status: AnimationStatus; animation_url?: string; video_url?: string } = {
    animation_status: status,
  };

  if (animationUrl) {
    updateData.animation_url = animationUrl;
  }

  if (videoUrl) {
    updateData.video_url = videoUrl;
  }

  await supabase
    .from("city_images")
    .update(updateData)
    .eq("city", normalizedCity)
    .eq("weather_category", weatherCategory)
    .eq("time_of_day", timeOfDay);
}

/**
 * Generate animation for an existing image
 * Returns both the APNG animation URL and the raw MP4 video URL
 */
export async function generateAnimation(
  city: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay,
  imageUrl: string,
  videoModel: VideoModel = "seedance"
): Promise<{ animationUrl: string; videoUrl: string }> {
  const normalizedCity = normalizeCity(city);

  // Update status to processing
  await updateAnimationStatus(city, weatherCategory, timeOfDay, "processing");

  try {
    // Generate video from image using selected model
    const videoBuffer = await generateVideoFromImage(imageUrl, weatherCategory, timeOfDay, videoModel);

    // Upload raw MP4 to Supabase Storage first (for quality comparison)
    const mp4FileName = `${normalizedCity}/${weatherCategory}_${timeOfDay}.mp4`;
    const { error: mp4UploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(mp4FileName, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (mp4UploadError) {
      throw new Error(`Failed to upload MP4: ${mp4UploadError.message}`);
    }

    const {
      data: { publicUrl: videoUrl },
    } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(mp4FileName);

    // Convert MP4 to APNG (Animated PNG - better quality than GIF, full 24-bit color)
    const apngBuffer = await convertMp4ToApng(videoBuffer, {
      fps: 12,
      width: 512,
      cropToSquare: false,
    });

    // Upload APNG to Supabase Storage
    const apngFileName = `${normalizedCity}/${weatherCategory}_${timeOfDay}.apng`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(apngFileName, apngBuffer, {
        contentType: "image/apng",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload animation: ${uploadError.message}`);
    }

    // Get public URL for APNG
    const {
      data: { publicUrl: animationUrl },
    } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(apngFileName);

    // Update database with both URLs
    await updateAnimationStatus(city, weatherCategory, timeOfDay, "completed", animationUrl, videoUrl);

    return { animationUrl, videoUrl };
  } catch (error) {
    // Update status to failed
    await updateAnimationStatus(city, weatherCategory, timeOfDay, "failed");
    throw error;
  }
}

/**
 * Get or generate animation for an image
 */
export async function getOrGenerateAnimation(
  city: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay,
  imageUrl: string,
  videoModel: VideoModel = "seedance"
): Promise<{ animationUrl: string | null; videoUrl: string | null; animationStatus: AnimationStatus }> {
  // Check if animation already exists (only use cache if using default model)
  if (videoModel === "seedance") {
    const cached = await getCachedImage(city, weatherCategory, timeOfDay);

    if (cached?.animation_status === "completed" && cached.animation_url) {
      return {
        animationUrl: cached.animation_url,
        videoUrl: cached.video_url || null,
        animationStatus: "completed",
      };
    }

    if (cached?.animation_status === "processing") {
      return { animationUrl: null, videoUrl: null, animationStatus: "processing" };
    }
  }

  // Start animation generation
  // Note: This is a long-running operation, so in production you'd want to
  // handle this asynchronously (e.g., with a job queue)
  try {
    const { animationUrl, videoUrl } = await generateAnimation(city, weatherCategory, timeOfDay, imageUrl, videoModel);
    return { animationUrl, videoUrl, animationStatus: "completed" };
  } catch (error) {
    console.error("Animation generation failed:", error);
    return { animationUrl: null, videoUrl: null, animationStatus: "failed" };
  }
}
