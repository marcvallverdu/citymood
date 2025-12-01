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
 * Generate a placeholder PNG with "Generating..." text
 * Uses FFmpeg if available, otherwise returns a static placeholder
 */
export async function generatePlaceholderPng(
  message: string = "Generating...",
  size: number = 360
): Promise<Buffer> {
  const ffmpegAvailable = await checkFfmpegAvailable();

  if (!ffmpegAvailable) {
    return FALLBACK_PLACEHOLDER;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "citymood-placeholder-"));
  const outputPath = join(tempDir, "placeholder.png");

  try {
    // Escape text for FFmpeg
    const escapedMessage = message
      .replace(/\\/g, "\\\\\\\\")
      .replace(/'/g, "'\\''")
      .replace(/:/g, "\\:")
      .replace(/%/g, "\\%");

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

// Cache the placeholder to avoid regenerating it
let cachedPlaceholder: Buffer | null = null;

/**
 * Get a cached placeholder PNG
 */
export async function getPlaceholderPng(): Promise<Buffer> {
  if (!cachedPlaceholder) {
    cachedPlaceholder = await generatePlaceholderPng("Generating...", 360);
  }
  return cachedPlaceholder;
}
