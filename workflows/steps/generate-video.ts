import { FatalError } from "workflow";
import { generateVideoFromImage } from "@/lib/veo";
import { WeatherCategory } from "@/lib/weather-categories";
import { TimeOfDay } from "@/lib/supabase";

export async function generateVideoStep(
  imageUrl: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay
): Promise<Buffer> {
  "use step";

  try {
    return await generateVideoFromImage(
      imageUrl,
      weatherCategory,
      timeOfDay,
      "seedance"
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Video generation failed";

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
