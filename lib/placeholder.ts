import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { checkFfmpegAvailable } from "./ffmpeg";

const execAsync = promisify(exec);

// Fallback: A simple gray placeholder PNG (100x100)
// Generated using: convert -size 100x100 xc:gray placeholder.png && base64 placeholder.png
const FALLBACK_PLACEHOLDER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAA0klEQVR42u3QMQEAAAgDoH1F8t8oNvsqIGkFZCuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzK7MrsyuzKzN+fQAn4IB5bQAAAABJRU5ErkJggg==",
  "base64"
);

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
 * Generate a placeholder PNG with "Generating..." text
 * Uses FFmpeg if available, otherwise returns a static placeholder
 */
export async function generatePlaceholderPng(
  message: string = "Generating...",
  size: number = 720
): Promise<Buffer> {
  const ffmpegAvailable = await checkFfmpegAvailable();

  if (!ffmpegAvailable) {
    return FALLBACK_PLACEHOLDER;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "citymood-placeholder-"));
  const outputPath = join(tempDir, "placeholder.png");

  try {
    const escapedMessage = escapeFFmpegText(message);

    // Generate a simple placeholder with text
    // Uses lavfi (libavfilter virtual input) to create a solid color with text
    const cmd = `ffmpeg -y -f lavfi -i "color=c=0x2a2a2a:s=${size}x${size}:d=1" -vf "drawtext=text='${escapedMessage}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 "${outputPath}"`;

    await execAsync(cmd);

    return await readFile(outputPath);
  } catch (error) {
    console.error("Failed to generate placeholder:", error);
    return FALLBACK_PLACEHOLDER;
  } finally {
    try {
      await unlink(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Generate a placeholder PNG with weather overlay
 * Shows city name, temperature, and condition on a gray background
 * with the same frosted bar style as the final APNG
 */
export async function generateWeatherPlaceholderPng(
  overlayText: string,
  size: number = 720,
  options: { fontSize?: number; barHeight?: number } = {}
): Promise<Buffer> {
  const ffmpegAvailable = await checkFfmpegAvailable();

  if (!ffmpegAvailable) {
    return FALLBACK_PLACEHOLDER;
  }

  const { fontSize = 32, barHeight = 80 } = options;
  const tempDir = await mkdtemp(join(tmpdir(), "citymood-weather-placeholder-"));
  const outputPath = join(tempDir, "placeholder.png");

  try {
    const escapedText = escapeFFmpegText(overlayText);
    const textY = Math.round(size - barHeight / 2 + fontSize / 3);

    // Generate a placeholder with the same frosted bar overlay as the final APNG
    // Dark gray background with semi-transparent bar and white text
    const cmd = `ffmpeg -y -f lavfi -i "color=c=0x2a2a2a:s=${size}x${size}:d=1" -vf "drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black@0.5:t=fill,drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${textY}:shadowcolor=black@0.7:shadowx=2:shadowy=2" -frames:v 1 "${outputPath}"`;

    await execAsync(cmd);

    return await readFile(outputPath);
  } catch (error) {
    console.error("Failed to generate weather placeholder:", error);
    return FALLBACK_PLACEHOLDER;
  } finally {
    try {
      await unlink(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Cache the placeholder to avoid regenerating it
let cachedPlaceholder: Buffer | null = null;

/**
 * Get a cached placeholder PNG
 */
export async function getPlaceholderPng(): Promise<Buffer> {
  if (!cachedPlaceholder) {
    cachedPlaceholder = await generatePlaceholderPng("Generating...", 720);
  }
  return cachedPlaceholder;
}
