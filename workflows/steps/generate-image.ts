import { FatalError } from "workflow";
import { getOrGenerateImage } from "@/lib/gemini";
import { WeatherCategory } from "@/lib/weather-categories";
import { TimeOfDay, AnimationStatus } from "@/lib/supabase";

export interface ImageStepResult {
  imageUrl: string;
  cached: boolean;
  videoUrl?: string;
  animationStatus: AnimationStatus;
}

export async function generateImageStep(
  city: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay
): Promise<ImageStepResult> {
  "use step";

  try {
    const result = await getOrGenerateImage(
      city,
      weatherCategory,
      timeOfDay,
      "nano-banana"
    );

    return {
      imageUrl: result.imageUrl,
      cached: result.cached,
      videoUrl: result.videoUrl,
      animationStatus: result.animationStatus,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image generation failed";

    // Content policy violations should not retry
    if (
      message.includes("content policy") ||
      message.includes("safety") ||
      message.includes("blocked")
    ) {
      throw new FatalError(message);
    }

    throw error;
  }
}
