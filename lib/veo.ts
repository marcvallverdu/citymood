import { GoogleGenAI } from "@google/genai";
import { WeatherCategory } from "./weather-categories";
import { TimeOfDay } from "./supabase";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// Initialize Google GenAI client for Veo
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Animation prompt templates for each weather category
const ANIMATION_EFFECTS: Record<WeatherCategory, string> = {
  sunny: "gentle sun rays shifting, subtle light shimmer on buildings, soft shadow movement",
  cloudy: "slow clouds drifting across the sky, soft light changes",
  foggy: "wisps of fog gently drifting through the scene, atmospheric haze moving",
  drizzle: "light rain particles falling gently, small ripples in puddles",
  rainy: "rain falling steadily, puddles rippling, water drops on surfaces",
  snowy: "snowflakes drifting down gently, snow accumulating softly",
  sleet: "mixed precipitation falling, icy particles bouncing",
  stormy: "dramatic clouds moving, lightning flashes, heavy rain",
};

/**
 * Generate animation prompt for a weather category
 */
export function getAnimationPrompt(
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay
): string {
  const effect = ANIMATION_EFFECTS[weatherCategory];
  const timeContext = timeOfDay === "day" ? "daylight" : "nighttime with soft lights";

  return `Animate this miniature diorama with subtle, looping motion. Add ${effect}. The scene is in ${timeContext}. Keep the camera completely static. Create smooth, seamless looping animation. Maintain the miniature diorama aesthetic throughout.`;
}

export interface VideoOperation {
  name?: string;
  done?: boolean;
  error?: { message: string };
  response?: {
    generatedVideos?: Array<{
      video?: {
        uri?: string;
      };
    }>;
  };
}

/**
 * Start video generation from an image using Veo
 * Returns the operation for polling
 */
export async function startVideoGeneration(
  imageUrl: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay
): Promise<VideoOperation> {
  // Fetch the image and convert to base64
  const imageResponse = await fetch(imageUrl);
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString("base64");
  const mimeType = imageResponse.headers.get("content-type") || "image/png";

  const prompt = getAnimationPrompt(weatherCategory, timeOfDay);

  // Use Veo for image-to-video generation
  const operation = await ai.models.generateVideos({
    model: "veo-2.0-generate-001",
    prompt,
    image: {
      imageBytes: base64Image,
      mimeType,
    },
    config: {
      aspectRatio: "16:9",
      numberOfVideos: 1,
      durationSeconds: 5,
      personGeneration: "dont_allow",
    },
  });

  return operation as VideoOperation;
}

/**
 * Poll for video generation completion
 * Returns the video URI when complete, or null if still processing
 */
export async function pollVideoGeneration(
  operation: VideoOperation
): Promise<{ videoUri: string } | null> {
  const updatedOp = await ai.operations.getVideosOperation({
    operation: operation as never,
  }) as unknown as VideoOperation;

  if (!updatedOp.done) {
    return null;
  }

  if (updatedOp.error) {
    throw new Error(`Video generation failed: ${updatedOp.error.message}`);
  }

  // Extract video from response
  const response = updatedOp.response;
  if (!response || !response.generatedVideos || response.generatedVideos.length === 0) {
    throw new Error("No video generated in response");
  }

  const video = response.generatedVideos[0];
  if (!video.video?.uri) {
    throw new Error("Video generation completed but no video URI available");
  }

  return { videoUri: video.video.uri };
}

/**
 * Download video from URI and return as buffer
 */
export async function downloadVideo(videoUri: string): Promise<Buffer> {
  const response = await fetch(videoUri);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Wait for video generation to complete with polling
 * Polls every 10 seconds for up to maxWaitMs
 */
export async function waitForVideoGeneration(
  operation: VideoOperation,
  maxWaitMs: number = 300000, // 5 minutes default
  pollIntervalMs: number = 10000 // 10 seconds
): Promise<string> {
  const startTime = Date.now();
  let currentOp = operation;

  while (Date.now() - startTime < maxWaitMs) {
    const result = await pollVideoGeneration(currentOp);

    if (result) {
      return result.videoUri;
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    // Update operation reference for next poll
    currentOp = await ai.operations.getVideosOperation({
      operation: currentOp as never,
    }) as unknown as VideoOperation;
  }

  throw new Error(`Video generation timed out after ${maxWaitMs}ms`);
}

/**
 * Generate a video from an image and return the video buffer
 * This is a convenience function that starts generation and waits for completion
 */
export async function generateVideoFromImage(
  imageUrl: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay
): Promise<Buffer> {
  const operation = await startVideoGeneration(imageUrl, weatherCategory, timeOfDay);
  const videoUri = await waitForVideoGeneration(operation);
  return downloadVideo(videoUri);
}
