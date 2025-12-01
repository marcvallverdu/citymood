import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

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

export interface ApngOptions {
  fps?: number;
  scale?: number;
}

/**
 * Convert MP4 video to APNG with a frosted text overlay
 * Creates a semi-transparent bar at the bottom with weather info
 */
export async function convertMp4ToApngWithOverlay(
  mp4Buffer: Buffer,
  overlayText: string,
  options: ApngOptions = {}
): Promise<Buffer> {
  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    throw new Error("FFmpeg is not available on this system");
  }

  const { fps = 10, scale = 360 } = options;

  const tempDir = await mkdtemp(join(tmpdir(), "citymood-apng-"));
  const inputPath = join(tempDir, "input.mp4");
  const outputPath = join(tempDir, "output.apng");

  try {
    await writeFile(inputPath, mp4Buffer);

    // Escape special characters in the overlay text for FFmpeg
    const escapedText = escapeFFmpegText(overlayText);

    // FFmpeg command to:
    // 1. Scale to target size
    // 2. Set framerate
    // 3. Draw a semi-transparent black box at the bottom (frosted effect)
    // 4. Draw white text with drop shadow centered in the box
    // 5. Output as APNG with infinite loop
    const cmd = `ffmpeg -y -i "${inputPath}" -vf "fps=${fps},scale=${scale}:-1,drawbox=x=0:y=ih-60:w=iw:h=60:color=black@0.5:t=fill,drawtext=text='${escapedText}':fontsize=20:fontcolor=white:x=(w-text_w)/2:y=h-38:shadowcolor=black@0.7:shadowx=1:shadowy=1" -plays 0 "${outputPath}"`;

    await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 }); // 50MB buffer for APNG output

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
 * Escape special characters for FFmpeg drawtext filter
 */
function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}
