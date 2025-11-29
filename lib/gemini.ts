import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase, STORAGE_BUCKET, CityImage, TimeOfDay, AnimationStatus } from "./supabase";
import { WeatherCategory, getCategoryDescription } from "./weather-categories";
import { normalizeCity } from "./weather";
import { generateVideoFromImage } from "./veo";
import { convertMp4ToGif } from "./ffmpeg";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Image prompt template with time of day
const PROMPT_TEMPLATE = `Create a highly detailed miniature diorama of {CITY} in isometric 3D view, placed on a thick wooden or textured platform base with rounded edges. Feature the city's most iconic landmarks and architectural elements as detailed miniature models. The scene should look like a collectible tabletop diorama with realistic depth and scale.

Style: Tilt-shift photography aesthetic, detailed miniature models, warm lighting, soft shadows, high-quality 3D render with PBR materials.

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

/**
 * Generate an image using Gemini API
 */
export async function generateImage(
  city: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay
): Promise<string> {
  const normalizedCity = normalizeCity(city);
  const prompt = generatePrompt(city, weatherCategory, timeOfDay);

  // Use Gemini 3 Pro for image generation
  const model = genAI.getGenerativeModel({
    model: "gemini-3-pro-image-preview",
    generationConfig: {
      // @ts-expect-error - responseModalities is valid for image generation but not in types
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;

  // Extract image data from response
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    throw new Error("No response from Gemini API");
  }

  // Find the image part in the response
  const imagePart = parts.find(
    (part) => "inlineData" in part && part.inlineData?.mimeType?.startsWith("image/")
  );

  if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData) {
    throw new Error("No image generated in response");
  }

  const imageData = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType;

  // Convert base64 to buffer
  const buffer = Buffer.from(imageData, "base64");

  // Determine file extension from mime type
  const extension = mimeType === "image/png" ? "png" : "jpg";
  const fileName = `${normalizedCity}/${weatherCategory}_${timeOfDay}.${extension}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, buffer, {
      contentType: mimeType,
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
  timeOfDay: TimeOfDay
): Promise<{ imageUrl: string; cached: boolean; animationUrl?: string; animationStatus: AnimationStatus }> {
  // Check for cached image first
  const cached = await getCachedImage(city, weatherCategory, timeOfDay);
  if (cached) {
    return {
      imageUrl: cached.image_url,
      cached: true,
      animationUrl: cached.animation_url,
      animationStatus: cached.animation_status || "none",
    };
  }

  // Generate new image
  const imageUrl = await generateImage(city, weatherCategory, timeOfDay);
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
  animationUrl?: string
): Promise<void> {
  const normalizedCity = normalizeCity(city);

  const updateData: { animation_status: AnimationStatus; animation_url?: string } = {
    animation_status: status,
  };

  if (animationUrl) {
    updateData.animation_url = animationUrl;
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
 */
export async function generateAnimation(
  city: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay,
  imageUrl: string
): Promise<string> {
  const normalizedCity = normalizeCity(city);

  // Update status to processing
  await updateAnimationStatus(city, weatherCategory, timeOfDay, "processing");

  try {
    // Generate video from image using Veo
    const videoBuffer = await generateVideoFromImage(imageUrl, weatherCategory, timeOfDay);

    // Convert MP4 to GIF with center crop to 1:1
    const gifBuffer = await convertMp4ToGif(videoBuffer, {
      fps: 12,
      width: 512,
      cropToSquare: true,
    });

    // Upload GIF to Supabase Storage
    const fileName = `${normalizedCity}/${weatherCategory}_${timeOfDay}.gif`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, gifBuffer, {
        contentType: "image/gif",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload animation: ${uploadError.message}`);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);

    // Update database with animation URL
    await updateAnimationStatus(city, weatherCategory, timeOfDay, "completed", publicUrl);

    return publicUrl;
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
  imageUrl: string
): Promise<{ animationUrl: string | null; animationStatus: AnimationStatus }> {
  // Check if animation already exists
  const cached = await getCachedImage(city, weatherCategory, timeOfDay);

  if (cached?.animation_status === "completed" && cached.animation_url) {
    return { animationUrl: cached.animation_url, animationStatus: "completed" };
  }

  if (cached?.animation_status === "processing") {
    return { animationUrl: null, animationStatus: "processing" };
  }

  // Start animation generation
  // Note: This is a long-running operation, so in production you'd want to
  // handle this asynchronously (e.g., with a job queue)
  try {
    const animationUrl = await generateAnimation(city, weatherCategory, timeOfDay, imageUrl);
    return { animationUrl, animationStatus: "completed" };
  } catch (error) {
    console.error("Animation generation failed:", error);
    return { animationUrl: null, animationStatus: "failed" };
  }
}
