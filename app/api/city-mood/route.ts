import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { getWeatherForCity, normalizeCity } from "@/lib/weather";
import { getOrGenerateImage } from "@/lib/gemini";
import { TimeOfDay } from "@/lib/supabase";

export interface CityMoodRequest {
  city: string;
}

export interface CityMoodResponse {
  city: string;
  normalizedCity: string;
  weather: {
    category: string;
    description: string;
    temperature: number;
    temperatureF: number;
    humidity: number;
    windKph: number;
    isDay: boolean;
    timeOfDay: TimeOfDay;
    cached: boolean;
  };
  imageUrl: string;
  imageCached: boolean;
}

export interface ErrorResponse {
  error: string;
}

export async function POST(request: NextRequest) {
  // Validate API key
  const authResult = validateApiKey(request);
  if (!authResult.valid) {
    return NextResponse.json<ErrorResponse>(
      { error: authResult.error! },
      { status: 401 }
    );
  }

  // Parse request body
  let body: CityMoodRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorResponse>(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate city parameter
  if (!body.city || typeof body.city !== "string") {
    return NextResponse.json<ErrorResponse>(
      { error: "Missing or invalid 'city' parameter" },
      { status: 400 }
    );
  }

  const city = body.city.trim();
  if (city.length === 0) {
    return NextResponse.json<ErrorResponse>(
      { error: "City name cannot be empty" },
      { status: 400 }
    );
  }

  if (city.length > 100) {
    return NextResponse.json<ErrorResponse>(
      { error: "City name too long (max 100 characters)" },
      { status: 400 }
    );
  }

  try {
    // Get weather data (cached or fresh)
    const weather = await getWeatherForCity(city);

    // Determine time of day from weather data
    const timeOfDay: TimeOfDay = weather.isDay ? "day" : "night";

    // Get or generate image (now includes time of day)
    const { imageUrl, cached: imageCached } = await getOrGenerateImage(
      city,
      weather.category,
      timeOfDay
    );

    const response: CityMoodResponse = {
      city,
      normalizedCity: normalizeCity(city),
      weather: {
        category: weather.category,
        description: weather.conditionText,
        temperature: weather.tempC,
        temperatureF: weather.tempF,
        humidity: weather.humidity,
        windKph: weather.windKph,
        isDay: weather.isDay,
        timeOfDay,
        cached: weather.cached,
      },
      imageUrl,
      imageCached,
    };

    return NextResponse.json<CityMoodResponse>(response);
  } catch (error) {
    console.error("CityMood API error:", error);

    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json<ErrorResponse>({ error: message }, { status: 500 });
  }
}
