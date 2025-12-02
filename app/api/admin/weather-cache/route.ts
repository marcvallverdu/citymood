import { NextRequest } from "next/server";
import { validateApiKeyAsync } from "@/lib/auth";
import {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
} from "@/lib/api-utils";
import { getSupabase } from "@/lib/supabase";

export interface WeatherCacheEntry {
  id: string;
  city: string;
  weather_category: string;
  weather_data: {
    condition_code?: number;
    condition_text?: string;
    temp_c?: number;
    temp_f?: number;
    humidity?: number;
    wind_kph?: number;
    is_day?: boolean;
  };
  fetched_at: string;
  created_at: string;
}

/**
 * GET /api/admin/weather-cache
 * Returns all weather cache entries
 * Requires admin API key
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  const authResult = await validateApiKeyAsync(request);
  if (!authResult.valid) {
    return createErrorResponse(
      requestId,
      authResult.errorCode || "AUTH_INVALID_KEY",
      authResult.error || "Invalid API key"
    );
  }

  if (!authResult.isAdmin) {
    return createErrorResponse(
      requestId,
      "AUTH_INVALID_KEY",
      "Admin access required"
    );
  }

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("weather_cache")
      .select("*")
      .order("fetched_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch weather cache: ${error.message}`);
    }

    const entries: WeatherCacheEntry[] = (data || []).map((row) => ({
      id: row.id,
      city: row.city,
      weather_category: row.weather_category,
      weather_data: row.weather_data || {},
      fetched_at: row.fetched_at,
      created_at: row.created_at,
    }));

    return createSuccessResponse(requestId, { entries }, startTime);
  } catch (error) {
    console.error("Error fetching weather cache:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to fetch weather cache"
    );
  }
}
