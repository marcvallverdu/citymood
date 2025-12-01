import { NextRequest } from "next/server";
import { validateApiKeyAsync } from "@/lib/auth";
import { getWeatherForCity } from "@/lib/weather";
import {
  generateRequestId,
  createErrorResponse,
  createSuccessResponse,
} from "@/lib/api-utils";

interface WeatherResponseData {
  city: string;
  country?: string;
  weather: {
    category: string;
    description: string;
    temperature_c: number;
    temperature_f: number;
    humidity: number;
    wind_kph: number;
    is_day: boolean;
  };
  cached: boolean;
}

/**
 * GET /api/v1/city-weather?city=Paris&country=France
 *
 * Get weather data for a city (with caching).
 * Returns cached weather if available and fresh (< 1 hour old).
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // 1. Authenticate
  const authResult = await validateApiKeyAsync(request);
  if (!authResult.valid) {
    return createErrorResponse(
      requestId,
      authResult.errorCode || "AUTH_INVALID_KEY",
      authResult.error || "Authentication failed"
    );
  }

  // 2. Get query parameters
  const searchParams = request.nextUrl.searchParams;
  const city = searchParams.get("city");
  const country = searchParams.get("country");

  // 3. Validate city parameter
  if (!city || city.trim().length === 0) {
    return createErrorResponse(
      requestId,
      "MISSING_CITY",
      "The 'city' query parameter is required"
    );
  }

  const trimmedCity = city.trim();
  if (trimmedCity.length > 100) {
    return createErrorResponse(
      requestId,
      "INVALID_CITY",
      "City name is too long (maximum 100 characters)",
      { max_length: 100, provided_length: trimmedCity.length }
    );
  }

  // 4. Build location string
  const location = country ? `${trimmedCity}, ${country.trim()}` : trimmedCity;

  // 5. Fetch weather (uses caching internally)
  try {
    const weather = await getWeatherForCity(location);

    const responseData: WeatherResponseData = {
      city: weather.locationName || trimmedCity,
      country: weather.country || country?.trim(),
      weather: {
        category: weather.category,
        description: weather.conditionText,
        temperature_c: weather.tempC,
        temperature_f: weather.tempF,
        humidity: weather.humidity,
        wind_kph: weather.windKph,
        is_day: weather.isDay,
      },
      cached: weather.cached,
    };

    return createSuccessResponse(requestId, responseData, startTime);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Weather fetch failed";

    // Location not found
    if (
      message.includes("not found") ||
      message.includes("No matching location")
    ) {
      return createErrorResponse(
        requestId,
        "CITY_NOT_FOUND",
        `City '${trimmedCity}' not found. Please check the spelling.`
      );
    }

    // Weather API error
    console.error("Weather API error:", error);
    return createErrorResponse(
      requestId,
      "WEATHER_API_ERROR",
      "Failed to fetch weather data. Please try again."
    );
  }
}
