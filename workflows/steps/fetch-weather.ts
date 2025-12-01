import { FatalError } from "workflow";
import { getWeatherForCity, WeatherData } from "@/lib/weather";

export async function fetchWeatherStep(
  city: string,
  country?: string
): Promise<WeatherData> {
  "use step";

  const location = country ? `${city}, ${country}` : city;

  try {
    return await getWeatherForCity(location);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Weather fetch failed";

    // Location not found errors should not retry
    if (
      message.includes("not found") ||
      message.includes("No matching location")
    ) {
      throw new FatalError(`Invalid location: ${location}`);
    }

    // Other errors can be retried
    throw error;
  }
}
