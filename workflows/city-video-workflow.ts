import { fetchWeatherStep } from "./steps/fetch-weather";
import { generateImageStep } from "./steps/generate-image";
import { generateVideoStep } from "./steps/generate-video";
import { processVideoStep } from "./steps/process-video";
import {
  startJobStep,
  updateJobStageStep,
  completeVideoJobStep,
  failJobStep,
} from "./steps/complete-job";
import { TimeOfDay } from "@/lib/supabase";
import { WeatherData } from "@/lib/weather";

export interface VideoWorkflowInput {
  jobId: string;
  city: string;
  country?: string;
}

export interface VideoWorkflowResult {
  jobId: string;
  videoUrl: string;
  imageUrl: string;
  weather: WeatherData;
  timeOfDay: TimeOfDay;
}

export async function cityVideoWorkflow(
  input: VideoWorkflowInput
): Promise<VideoWorkflowResult> {
  "use workflow";

  const { jobId, city, country } = input;

  try {
    // Mark job as processing
    await startJobStep(jobId);

    // Step 1: Fetch weather
    await updateJobStageStep(jobId, "fetching_weather");
    const weather = await fetchWeatherStep(city, country);

    // Determine time of day
    const timeOfDay: TimeOfDay = weather.isDay ? "day" : "night";

    // Step 2: Generate or retrieve cached image
    await updateJobStageStep(jobId, "generating_image", {
      weather_data: weather,
    });
    const image = await generateImageStep(city, weather.category, timeOfDay);

    // Check if video already cached
    if (image.videoUrl) {
      console.log(`[Job ${jobId}] Video already cached, completing job`);
      await completeVideoJobStep(jobId, image.videoUrl, weather, image.imageUrl, true);
      return {
        jobId,
        videoUrl: image.videoUrl,
        imageUrl: image.imageUrl,
        weather,
        timeOfDay,
      };
    }

    // Step 3: Generate video from image
    await updateJobStageStep(jobId, "generating_video", {
      image_url: image.imageUrl,
    });
    const rawVideoBuffer = await generateVideoStep(
      image.imageUrl,
      weather.category,
      timeOfDay
    );

    // Step 4: Process video (boomerang effect + weather overlay)
    await updateJobStageStep(jobId, "processing_video");
    const videoUrl = await processVideoStep(
      city,
      weather.category,
      timeOfDay,
      rawVideoBuffer,
      weather
    );

    // Complete job
    await completeVideoJobStep(jobId, videoUrl, weather, image.imageUrl);

    return {
      jobId,
      videoUrl,
      imageUrl: image.imageUrl,
      weather,
      timeOfDay,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Video workflow failed";
    await failJobStep(jobId, message);
    throw error;
  }
}
