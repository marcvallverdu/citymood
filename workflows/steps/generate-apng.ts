import { generateWidgetApng } from "@/lib/widget-image";
import { WeatherData } from "@/lib/weather";

/**
 * Workflow step to generate an APNG from a video with weather overlay
 * This creates the final animated widget image and stores it in widget_cache
 */
export async function generateApngStep(
  city: string,
  weather: WeatherData,
  videoUrl: string
): Promise<string> {
  "use step";

  console.log(`[APNG] Generating APNG for ${city} from video`);
  const apngUrl = await generateWidgetApng(city, weather, videoUrl);
  console.log(`[APNG] Generated and cached APNG: ${apngUrl}`);

  return apngUrl;
}
