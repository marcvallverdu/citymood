import crypto from "crypto";
import { supabase, STORAGE_BUCKET, WidgetCache } from "./supabase";
import { WeatherData, normalizeCity } from "./weather";
import { convertMp4ToApngWithOverlay, checkFfmpegAvailable } from "./ffmpeg";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);
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
 * Get cached overlaid video URL for a city and weather hash
 * Returns null if not cached or expired
 */
export async function getCachedOverlaidVideo(
  city: string,
  weatherHash: string
): Promise<string | null> {
  const normalizedCity = normalizeCity(city);

  const { data } = await supabase
    .from("widget_cache")
    .select("apng_url")
    .eq("city", normalizedCity)
    .eq("weather_hash", weatherHash)
    .gt("expires_at", new Date().toISOString())
    .single<{ apng_url: string }>();

  return data?.apng_url || null;
}

/**
 * Cache an overlaid video and return the public URL
 */
export async function cacheOverlaidVideo(
  city: string,
  weatherHash: string,
  videoBuffer: Buffer
): Promise<string> {
  const normalizedCity = normalizeCity(city);

  // Upload to Supabase Storage
  const fileName = `widgets/${normalizedCity}/${weatherHash}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload overlaid video: ${uploadError.message}`);
  }

  // Get public URL
  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);

  // Cache the result in widget_cache (reusing apng_url column for video URL)
  const expiresAt = new Date(Date.now() + CACHE_DURATION_MS).toISOString();
  await supabase.from("widget_cache").upsert(
    {
      city: normalizedCity,
      weather_hash: weatherHash,
      apng_url: publicUrl, // Reusing this column for overlaid video URL
      expires_at: expiresAt,
    },
    {
      onConflict: "city,weather_hash",
    }
  );

  return publicUrl;
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
 * Escape special characters for FFmpeg drawtext filter
 */
function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

/**
 * Generate a static PNG from an image URL with weather overlay
 * Used as an intermediate step when video is not yet available
 */
export async function generateStaticImageWithOverlay(
  imageUrl: string,
  overlayText: string,
  options: { scale?: number; fontSize?: number; barHeight?: number } = {}
): Promise<Buffer> {
  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    throw new Error("FFmpeg is not available on this system");
  }

  const { scale = 720, fontSize = 32, barHeight = 80 } = options;

  // Download the image
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.statusText}`);
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  const tempDir = await mkdtemp(join(tmpdir(), "citymood-static-"));
  const inputPath = join(tempDir, "input.png");
  const outputPath = join(tempDir, "output.png");

  try {
    await writeFile(inputPath, imageBuffer);

    const escapedText = escapeFFmpegText(overlayText);
    const textY = `h-${Math.round(barHeight / 2 + fontSize / 3)}`;

    // Scale and add overlay - same style as APNG
    const cmd = `ffmpeg -y -i "${inputPath}" -vf "scale=${scale}:-1,drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black@0.5:t=fill,drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${textY}:shadowcolor=black@0.7:shadowx=2:shadowy=2" "${outputPath}"`;

    await execAsync(cmd);

    return await readFile(outputPath);
  } finally {
    try {
      await unlink(inputPath);
      await unlink(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

export type WidgetImageResult = {
  type: "apng" | "static" | "placeholder";
  buffer?: Buffer;
  url?: string;
  cached: boolean;
  needsGeneration: boolean;
  needsVideoGeneration: boolean;
};

/**
 * Get or generate a widget image for a city
 * Returns progressive results based on what's available:
 * 1. APNG (animated) - when video exists and has been converted
 * 2. Static PNG with overlay - when static image exists but no video
 * 3. Placeholder - when nothing is cached
 */
export async function getOrGenerateWidgetImage(
  city: string,
  weather: WeatherData,
  videoUrl: string | null,
  imageUrl: string | null = null
): Promise<WidgetImageResult> {
  const weatherHash = generateWeatherHash(weather);
  const overlayText = formatOverlayText(city, weather);

  // Check cache first for APNG
  const cached = await getCachedWidgetImage(city, weatherHash);
  if (cached) {
    return {
      type: "apng",
      url: cached.apng_url,
      cached: true,
      needsGeneration: false,
      needsVideoGeneration: false,
    };
  }

  // If we have a video URL, generate the APNG
  if (videoUrl) {
    try {
      const apngUrl = await generateWidgetApng(city, weather, videoUrl);
      return {
        type: "apng",
        url: apngUrl,
        cached: false,
        needsGeneration: false,
        needsVideoGeneration: false,
      };
    } catch (error) {
      console.error("Failed to generate widget APNG:", error);
      // Fall through to static image fallback
    }
  }

  // If we have a static image URL, generate static PNG with overlay
  if (imageUrl) {
    try {
      const buffer = await generateStaticImageWithOverlay(imageUrl, overlayText);
      return {
        type: "static",
        buffer,
        cached: false,
        needsGeneration: false,
        needsVideoGeneration: true,
      };
    } catch (error) {
      console.error("Failed to generate static overlay:", error);
      // Fall through to placeholder
    }
  }

  // No image or video available - need full generation
  return {
    type: "placeholder",
    cached: false,
    needsGeneration: true,
    needsVideoGeneration: true,
  };
}
