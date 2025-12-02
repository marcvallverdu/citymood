import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

/**
 * Create a boomerang (ping-pong) effect on an MP4 video
 * Concatenates the video with a reversed copy for seamless looping
 * Optionally adds a weather overlay at the bottom
 * Returns the original buffer if FFmpeg is not available (e.g., on Vercel)
 */
export async function createBoomerangMp4(
  mp4Buffer: Buffer,
  overlayText?: string
): Promise<Buffer> {
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

    // Build filter chain:
    // 1. Split input, reverse one copy, concatenate for boomerang effect
    // 2. Optionally add weather overlay on top
    let filters = "[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0[out]";

    if (overlayText) {
      const escapedText = escapeFFmpegText(overlayText);
      const barHeight = 80;
      const fontSize = 32;
      const textY = `h-${Math.round(barHeight / 2 + fontSize / 3)}`;

      // Add semi-transparent bar and centered text at the bottom
      filters += `;[out]drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black@0.5:t=fill,drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${textY}:shadowcolor=black@0.7:shadowx=2:shadowy=2`;
    }

    const cmd = `ffmpeg -y -i "${inputPath}" -filter_complex "${filters}" -an "${outputPath}"`;
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
  fontSize?: number;
  barHeight?: number;
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

  // Keep 720p but use lower fps (6) to stay under Supabase 50MB limit
  // 720p at 6fps with palettegen optimization produces ~20-40MB files
  const { fps = 6, scale = 720, fontSize = 32, barHeight = 80 } = options;

  const tempDir = await mkdtemp(join(tmpdir(), "citymood-apng-"));
  const inputPath = join(tempDir, "input.mp4");
  const outputPath = join(tempDir, "output.apng");
  const palettePath = join(tempDir, "palette.png");

  try {
    await writeFile(inputPath, mp4Buffer);

    // Escape special characters in the overlay text for FFmpeg
    const escapedText = escapeFFmpegText(overlayText);

    // Calculate text Y position (centered in the bar)
    const textY = `h-${Math.round(barHeight / 2 + fontSize / 3)}`;

    // FFmpeg command using two-pass palette generation for smaller file size:
    // Pass 1: Generate optimal palette from the video
    // Pass 2: Apply palette to create optimized APNG
    const filters = `fps=${fps},scale=${scale}:-1,drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black@0.5:t=fill,drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${textY}:shadowcolor=black@0.7:shadowx=2:shadowy=2`;

    // Generate palette
    const paletteCmd = `ffmpeg -y -i "${inputPath}" -vf "${filters},palettegen=max_colors=128:stats_mode=diff" "${palettePath}"`;
    await execAsync(paletteCmd, { maxBuffer: 50 * 1024 * 1024 });

    // Apply palette and create APNG
    const apngCmd = `ffmpeg -y -i "${inputPath}" -i "${palettePath}" -lavfi "${filters}[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=3" -plays 0 "${outputPath}"`;
    await execAsync(apngCmd, { maxBuffer: 100 * 1024 * 1024 });

    return await readFile(outputPath);
  } finally {
    try {
      await unlink(inputPath);
      await unlink(outputPath);
      await unlink(palettePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Add weather overlay to an MP4 video
 * Creates a semi-transparent bar at the bottom with weather info
 * Re-encodes the video with the overlay burned in
 */
export async function addOverlayToVideo(
  videoBuffer: Buffer,
  overlayText: string
): Promise<Buffer> {
  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    console.log("FFmpeg not available, returning original video");
    return videoBuffer;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "citymood-video-overlay-"));
  const inputPath = join(tempDir, "input.mp4");
  const outputPath = join(tempDir, "output.mp4");

  try {
    await writeFile(inputPath, videoBuffer);

    const escapedText = escapeFFmpegText(overlayText);
    const barHeight = 80;
    const fontSize = 32;
    const textY = `h-${Math.round(barHeight / 2 + fontSize / 3)}`;

    // Add semi-transparent bar and centered text at the bottom
    const filters = `drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black@0.5:t=fill,drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${textY}:shadowcolor=black@0.7:shadowx=2:shadowy=2`;

    // Use fast preset for reasonable encoding speed, copy audio if present
    const cmd = `ffmpeg -y -i "${inputPath}" -vf "${filters}" -c:v libx264 -preset fast -crf 23 -an "${outputPath}"`;
    await execAsync(cmd, { maxBuffer: 100 * 1024 * 1024 });

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
 * Add weather overlay to a static PNG image
 * Creates a semi-transparent bar at the bottom with weather info
 */
export async function addOverlayToImage(
  imageBuffer: Buffer,
  overlayText: string
): Promise<Buffer> {
  const ffmpegAvailable = await checkFfmpegAvailable();
  if (!ffmpegAvailable) {
    console.log("FFmpeg not available, returning original image");
    return imageBuffer;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "citymood-overlay-"));
  const inputPath = join(tempDir, "input.png");
  const outputPath = join(tempDir, "output.png");

  try {
    await writeFile(inputPath, imageBuffer);

    const escapedText = escapeFFmpegText(overlayText);
    const barHeight = 80;
    const fontSize = 32;
    const textY = `h-${Math.round(barHeight / 2 + fontSize / 3)}`;

    // Add semi-transparent bar and centered text at the bottom
    const filters = `drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black@0.5:t=fill,drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=white:x=(w-text_w)/2:y=${textY}:shadowcolor=black@0.7:shadowx=2:shadowy=2`;

    const cmd = `ffmpeg -y -i "${inputPath}" -vf "${filters}" "${outputPath}"`;
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
 * Escape special characters for FFmpeg drawtext filter
 */
function escapeFFmpegText(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}
