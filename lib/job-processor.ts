import {
  startJob,
  updateJobStage,
  completeJob,
  failJob,
  getJob,
} from "./jobs";
import { getWeatherForCity, WeatherData } from "./weather";
import { getOrGenerateImage, getOrGenerateAnimation } from "./gemini";
import { TimeOfDay } from "./supabase";

/**
 * Process a video generation job in the background
 * This function runs asynchronously and updates the job status as it progresses
 */
export async function processVideoJob(jobId: string): Promise<void> {
  console.log(`[Job ${jobId}] Starting processing...`);

  try {
    // Get job details
    const job = await getJob(jobId);
    if (!job) {
      console.error(`[Job ${jobId}] Job not found`);
      return;
    }

    // Mark job as processing
    await startJob(jobId);

    // Build location query
    const locationQuery = job.country ? `${job.city}, ${job.country}` : job.city;

    // Stage 1: Fetch weather
    console.log(`[Job ${jobId}] Stage 1: Fetching weather for ${locationQuery}`);
    let weather: WeatherData;
    try {
      weather = await getWeatherForCity(locationQuery);
      await updateJobStage(jobId, "generating_image", {
        weather_data: weather,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch weather";
      console.error(`[Job ${jobId}] Weather fetch failed:`, message);
      await failJob(jobId, `Weather fetch failed: ${message}`);
      return;
    }

    // Determine time of day
    const timeOfDay: TimeOfDay = weather.isDay ? "day" : "night";

    // Stage 2: Generate image
    console.log(`[Job ${jobId}] Stage 2: Generating image`);
    let imageUrl: string;
    try {
      const imageResult = await getOrGenerateImage(
        job.city,
        weather.category,
        timeOfDay,
        "nano-banana"
      );
      imageUrl = imageResult.imageUrl;

      // Check if video already exists (cached)
      if (imageResult.videoUrl) {
        console.log(`[Job ${jobId}] Video already cached, completing job`);
        await completeJob(jobId, imageResult.videoUrl, weather, imageUrl);
        return;
      }

      await updateJobStage(jobId, "generating_video", {
        image_url: imageUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate image";
      console.error(`[Job ${jobId}] Image generation failed:`, message);
      await failJob(jobId, `Image generation failed: ${message}`);
      return;
    }

    // Stage 3 & 4: Generate video (includes boomerang processing)
    console.log(`[Job ${jobId}] Stage 3: Generating video animation`);
    try {
      // Update to video generation stage
      await updateJobStage(jobId, "generating_video");

      const animationResult = await getOrGenerateAnimation(
        job.city,
        weather.category,
        timeOfDay,
        imageUrl,
        "seedance"
      );

      if (!animationResult.videoUrl) {
        throw new Error("Video generation did not return a URL");
      }

      // The boomerang effect is already applied inside getOrGenerateAnimation
      // Mark as complete
      console.log(`[Job ${jobId}] Processing complete, video URL: ${animationResult.videoUrl}`);
      await completeJob(jobId, animationResult.videoUrl, weather, imageUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate video";
      console.error(`[Job ${jobId}] Video generation failed:`, message);
      await failJob(jobId, `Video generation failed: ${message}`);
      return;
    }

    console.log(`[Job ${jobId}] Job completed successfully`);
  } catch (error) {
    // Catch-all for unexpected errors
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Job ${jobId}] Unexpected error:`, error);
    try {
      await failJob(jobId, `Unexpected error: ${message}`);
    } catch {
      console.error(`[Job ${jobId}] Failed to mark job as failed`);
    }
  }
}
