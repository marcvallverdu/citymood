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
