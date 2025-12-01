import { fal } from "./fal";
import { WeatherCategory } from "./weather-categories";
import { TimeOfDay } from "./supabase";
import { VideoModel, VIDEO_MODELS } from "./models";

// Animation prompt templates for each weather category
const ANIMATION_EFFECTS: Record<WeatherCategory, string> = {
  sunny: "gentle sun rays shifting, subtle light shimmer on buildings, soft shadow movement",
  cloudy: "slow clouds drifting across the sky, soft light changes",
  foggy: "wisps of fog gently drifting through the scene, atmospheric haze moving",
  drizzle: "light rain particles falling gently, small ripples in puddles",
  rainy: "rain falling steadily, water drops on surfaces",
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

  return `Animate only the weather effects in this miniature diorama. The diorama, buildings, and all structures must remain completely still and unchanged. Only animate: ${effect}. Keep the camera completely static. The scene is in ${timeContext}. Create a smooth animation that returns to the starting state.`;
}

// Type for fal.ai video response (shared across models)
interface FalVideoResponse {
  video: { url: string };
  seed?: number;
}

/**
 * Generate a video from an image using the selected fal.ai model
 * Returns the video buffer
 */
export async function generateVideoFromImage(
  imageUrl: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay,
  model: VideoModel = "seedance"
): Promise<Buffer> {
  const prompt = getAnimationPrompt(weatherCategory, timeOfDay);
  const modelConfig = VIDEO_MODELS[model];

  console.log(`Starting ${model} video generation with fal.subscribe()...`);

  const result = await fal.subscribe(modelConfig.id, {
    input: {
      prompt,
      image_url: imageUrl,
      end_image_url: imageUrl, // Same image for seamless loop
      aspect_ratio: "1:1",
      resolution: "720p",
      duration: 5,
      camera_fixed: true,
    },
    onQueueUpdate(update) {
      console.log(`${model} status: ${update.status}`);
    },
  });

  const response = result.data as FalVideoResponse;

  console.log("Fal.ai video response:", JSON.stringify(response, null, 2));

  // Extract video URL from response
  if (!response.video || !response.video.url) {
    throw new Error(`No video generated in response. Got: ${JSON.stringify(response)}`);
  }

  const videoUrl = response.video.url;
  console.log("Video URL to download:", videoUrl);

  // Download the video
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
  }

  const arrayBuffer = await videoResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
