import { supabase, WeatherCache } from "./supabase";
import { getWeatherCategory, WeatherCategory } from "./weather-categories";

const WEATHER_API_KEY = process.env.WEATHER_API_KEY!;
const WEATHER_API_BASE = "https://api.weatherapi.com/v1";
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour in milliseconds

export interface WeatherData {
  category: WeatherCategory;
  conditionCode: number;
  conditionText: string;
  tempC: number;
  tempF: number;
  humidity: number;
  windKph: number;
  isDay: boolean;
  cached: boolean;
  locationName?: string;
  country?: string;
}

interface WeatherAPIResponse {
  location: {
    name: string;
    region: string;
    country: string;
  };
  current: {
    temp_c: number;
    temp_f: number;
    is_day: number;
    condition: {
      text: string;
      code: number;
    };
    humidity: number;
    wind_kph: number;
  };
}

/**
 * Normalize city name for consistent caching
 */
export function normalizeCity(city: string): string {
  return city.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Check if cached weather data is still fresh (less than 1 hour old)
 */
function isCacheFresh(fetchedAt: string): boolean {
  const fetchedTime = new Date(fetchedAt).getTime();
  const now = Date.now();
  return now - fetchedTime < CACHE_DURATION_MS;
}

/**
 * Get weather for a city, using cache if available and fresh
 */
export async function getWeatherForCity(city: string): Promise<WeatherData> {
  const normalizedCity = normalizeCity(city);

  // Check cache first
  const { data: cached } = await supabase
    .from("weather_cache")
    .select("*")
    .eq("city", normalizedCity)
    .single<WeatherCache>();

  if (cached && isCacheFresh(cached.fetched_at)) {
    return {
      category: cached.weather_category as WeatherCategory,
      conditionCode: cached.weather_data.condition_code,
      conditionText: cached.weather_data.condition_text,
      tempC: cached.weather_data.temp_c,
      tempF: cached.weather_data.temp_f,
      humidity: cached.weather_data.humidity,
      windKph: cached.weather_data.wind_kph,
      isDay: cached.weather_data.is_day === 1,
      cached: true,
    };
  }

  // Fetch fresh weather data
  const response = await fetch(
    `${WEATHER_API_BASE}/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(city)}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to fetch weather data");
  }

  const data: WeatherAPIResponse = await response.json();
  const category = getWeatherCategory(data.current.condition.code);

  console.log(`[Weather] ${city}: ${data.current.condition.text} (code ${data.current.condition.code}) → category: ${category}, temp: ${data.current.temp_c}°C, isDay: ${data.current.is_day}`);

  const weatherData = {
    condition_code: data.current.condition.code,
    condition_text: data.current.condition.text,
    temp_c: data.current.temp_c,
    temp_f: data.current.temp_f,
    humidity: data.current.humidity,
    wind_kph: data.current.wind_kph,
    is_day: data.current.is_day,
  };

  // Upsert cache (insert or update if city exists)
  await supabase.from("weather_cache").upsert(
    {
      city: normalizedCity,
      weather_category: category,
      weather_data: weatherData,
      fetched_at: new Date().toISOString(),
    },
    {
      onConflict: "city",
    }
  );

  return {
    category,
    conditionCode: data.current.condition.code,
    conditionText: data.current.condition.text,
    tempC: data.current.temp_c,
    tempF: data.current.temp_f,
    humidity: data.current.humidity,
    windKph: data.current.wind_kph,
    isDay: data.current.is_day === 1,
    cached: false,
    locationName: data.location.name,
    country: data.location.country,
  };
}
