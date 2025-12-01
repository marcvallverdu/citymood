import crypto from "crypto";
import { supabase, STORAGE_BUCKET, WidgetCache } from "./supabase";
import { WeatherData, normalizeCity } from "./weather";
import { convertMp4ToApngWithOverlay } from "./ffmpeg";

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a hash for the weather data to use as a cache key
 * This ensures we regenerate the APNG when weather conditions change
 */
export function generateWeatherHash(weather: WeatherData): string {
  const data = `${weather.category}_${Math.round(weather.tempC)}_${weather.isDay ? "day" : "night"}`;
  return crypto.createHash("md5").update(data).digest("hex").substring(0, 12);
}

/**
 * Format the overlay text for the widget
 * Example: "London • 22°C • Sunny"
 */
export function formatOverlayText(city: string, weather: WeatherData): string {
  const displayCity = city
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const temp = Math.round(weather.tempC);
  const condition = weather.conditionText;

  return `${displayCity} • ${temp}°C • ${condition}`;
}

/**
 * Check if there's a cached widget image for this city and weather
 */
export async function getCachedWidgetImage(
  city: string,
  weatherHash: string
): Promise<WidgetCache | null> {
  const normalizedCity = normalizeCity(city);

  const { data } = await supabase
    .from("widget_cache")
    .select("*")
    .eq("city", normalizedCity)
    .eq("weather_hash", weatherHash)
    .gt("expires_at", new Date().toISOString())
    .single<WidgetCache>();

  return data;
}

/**
 * Store a generated widget image in the cache
 */
export async function cacheWidgetImage(
  city: string,
  weatherHash: string,
  apngUrl: string
): Promise<void> {
  const normalizedCity = normalizeCity(city);
  const expiresAt = new Date(Date.now() + CACHE_DURATION_MS).toISOString();

  await supabase.from("widget_cache").upsert(
    {
      city: normalizedCity,
      weather_hash: weatherHash,
      apng_url: apngUrl,
      expires_at: expiresAt,
    },
    {
      onConflict: "city,weather_hash",
    }
  );
}

/**
 * Generate and cache a widget APNG from an MP4 video
 */
export async function generateWidgetApng(
  city: string,
  weather: WeatherData,
  videoUrl: string
): Promise<string> {
  const normalizedCity = normalizeCity(city);
  const weatherHash = generateWeatherHash(weather);

  // Download the MP4 video
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download video: ${videoResponse.statusText}`);
  }
  const mp4Buffer = Buffer.from(await videoResponse.arrayBuffer());

  // Generate the overlay text
  const overlayText = formatOverlayText(city, weather);

  // Convert to APNG with overlay
  const apngBuffer = await convertMp4ToApngWithOverlay(mp4Buffer, overlayText);

  // Upload to Supabase Storage
  const fileName = `widgets/${normalizedCity}/${weatherHash}.apng`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, apngBuffer, {
      contentType: "image/apng",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload APNG: ${uploadError.message}`);
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);

  // Cache the result
  await cacheWidgetImage(normalizedCity, weatherHash, publicUrl);

  return publicUrl;
}

/**
 * Get or generate a widget image for a city
 * Returns the APNG URL if available, or null if generation is needed
 */
export async function getOrGenerateWidgetImage(
  city: string,
  weather: WeatherData,
  videoUrl: string | null
): Promise<{ apngUrl: string | null; cached: boolean; needsGeneration: boolean }> {
  const weatherHash = generateWeatherHash(weather);

  // Check cache first
  const cached = await getCachedWidgetImage(city, weatherHash);
  if (cached) {
    return { apngUrl: cached.apng_url, cached: true, needsGeneration: false };
  }

  // If no video URL, we need to generate the video first
  if (!videoUrl) {
    return { apngUrl: null, cached: false, needsGeneration: true };
  }

  // Generate the APNG
  try {
    const apngUrl = await generateWidgetApng(city, weather, videoUrl);
    return { apngUrl, cached: false, needsGeneration: false };
  } catch (error) {
    console.error("Failed to generate widget APNG:", error);
    throw error;
  }
}
