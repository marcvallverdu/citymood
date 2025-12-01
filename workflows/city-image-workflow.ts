import { fetchWeatherStep } from "./steps/fetch-weather";
import { generateImageStep } from "./steps/generate-image";
import {
  startJobStep,
  updateJobStageStep,
  completeImageJobStep,
  failJobStep,
} from "./steps/complete-job";
import { TimeOfDay } from "@/lib/supabase";
import { WeatherData } from "@/lib/weather";

export interface ImageWorkflowInput {
  jobId: string;
  city: string;
  country?: string;
}

export interface ImageWorkflowResult {
  jobId: string;
  imageUrl: string;
  weather: WeatherData;
  timeOfDay: TimeOfDay;
}

export async function cityImageWorkflow(
  input: ImageWorkflowInput
): Promise<ImageWorkflowResult> {
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

    // Step 2: Generate image
    await updateJobStageStep(jobId, "generating_image", {
      weather_data: weather,
    });
    const image = await generateImageStep(city, weather.category, timeOfDay);

    // Complete job (pass cached flag from image result)
    await completeImageJobStep(jobId, image.imageUrl, weather, image.cached);

    return {
      jobId,
      imageUrl: image.imageUrl,
      weather,
      timeOfDay,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image workflow failed";
    await failJobStep(jobId, message);
    throw error;
  }
}
