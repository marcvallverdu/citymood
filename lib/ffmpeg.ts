import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

export interface ConvertToApngOptions {
  fps?: number; // Frames per second (default: 12)
  width?: number; // Output width (default: 512, height auto-calculated)
  cropToSquare?: boolean; // Center-crop 16:9 to 1:1 (default: false)
}

/**
 * Convert MP4 video buffer to APNG (Animated PNG)
 * APNG supports full 24-bit color (vs GIF's 256 colors) for better quality
 */
export async function convertMp4ToApng(
  mp4Buffer: Buffer,
  options: ConvertToApngOptions = {}
): Promise<Buffer> {
  const { fps = 12, width = 512, cropToSquare = false } = options;

  // Create temp directory for our files
  const tempDir = await mkdtemp(join(tmpdir(), "citymood-"));
  const inputPath = join(tempDir, "input.mp4");
  const outputPath = join(tempDir, "output.apng");

  try {
    // Write input video to temp file
    await writeFile(inputPath, mp4Buffer);

    // Build filter chain
    const filters: string[] = [];

    // Crop to square (center crop from 16:9 to 1:1) if needed
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

    // Convert to APNG with infinite loop (-plays 0)
    // APNG doesn't need palette generation like GIF
    const apngCmd = `ffmpeg -y -i "${inputPath}" -vf "${filterChain}" -plays 0 "${outputPath}"`;
    await execAsync(apngCmd);

    // Read output APNG
    const apngBuffer = await readFile(outputPath);

    return apngBuffer;
  } finally {
    // Cleanup temp files
    try {
      await unlink(inputPath);
      await unlink(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Keep old function name as alias for backwards compatibility during transition
export const convertMp4ToGif = convertMp4ToApng;

/**
 * Create a boomerang (ping-pong) effect on an MP4 video
 * Concatenates the video with a reversed copy for seamless looping
 * Returns the original buffer if FFmpeg is not available (e.g., on Vercel)
 */
export async function createBoomerangMp4(mp4Buffer: Buffer): Promise<Buffer> {
  // Check if FFmpeg is available first
  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    console.log("FFmpeg not available, skipping boomerang effect");
    return mp4Buffer; // Return original video without boomerang
  }

  const tempDir = await mkdtemp(join(tmpdir(), "citymood-"));
  const inputPath = join(tempDir, "input.mp4");
  const outputPath = join(tempDir, "output.mp4");

  try {
    await writeFile(inputPath, mp4Buffer);

    // Use filter_complex to split, reverse, and concatenate
    // [0:v] = input video stream
    // split creates two copies [a][b]
    // [b] is reversed
    // concat joins them together
    const cmd = `ffmpeg -y -i "${inputPath}" -filter_complex "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0" -an "${outputPath}"`;
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
