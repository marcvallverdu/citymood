import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

export interface ConvertToGifOptions {
  fps?: number; // Frames per second (default: 10)
  width?: number; // Output width (default: 480, height auto-calculated)
  cropToSquare?: boolean; // Center-crop 16:9 to 1:1 (default: true)
}

/**
 * Convert MP4 video buffer to optimized GIF
 * Uses ffmpeg with palette optimization for better quality and smaller size
 */
export async function convertMp4ToGif(
  mp4Buffer: Buffer,
  options: ConvertToGifOptions = {}
): Promise<Buffer> {
  const { fps = 10, width = 480, cropToSquare = true } = options;

  // Create temp directory for our files
  const tempDir = await mkdtemp(join(tmpdir(), "citymood-"));
  const inputPath = join(tempDir, "input.mp4");
  const palettePath = join(tempDir, "palette.png");
  const outputPath = join(tempDir, "output.gif");

  try {
    // Write input video to temp file
    await writeFile(inputPath, mp4Buffer);

    // Build filter chain
    let filters: string[] = [];

    // Crop to square (center crop from 16:9 to 1:1)
    if (cropToSquare) {
      // For 16:9, height is the constraining dimension
      // Crop to square from center: crop=ih:ih:(iw-ih)/2:0
      filters.push("crop=ih:ih:(iw-ih)/2:0");
    }

    // Scale to target width
    filters.push(`scale=${width}:-1:flags=lanczos`);

    // Set frame rate
    filters.push(`fps=${fps}`);

    const filterChain = filters.join(",");

    // Step 1: Generate optimized palette
    const paletteCmd = `ffmpeg -y -i "${inputPath}" -vf "${filterChain},palettegen=stats_mode=diff" "${palettePath}"`;
    await execAsync(paletteCmd);

    // Step 2: Generate GIF using palette
    const gifCmd = `ffmpeg -y -i "${inputPath}" -i "${palettePath}" -lavfi "${filterChain}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "${outputPath}"`;
    await execAsync(gifCmd);

    // Read output GIF
    const gifBuffer = await readFile(outputPath);

    return gifBuffer;
  } finally {
    // Cleanup temp files
    try {
      await unlink(inputPath);
      await unlink(palettePath);
      await unlink(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if ffmpeg is available on the system
 */
export async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}
