import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Lazy initialization to avoid build-time errors
let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }
    _supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  }
  return _supabase;
}

// For backwards compatibility
export const supabase = {
  get from() {
    return getSupabase().from.bind(getSupabase());
  },
  get storage() {
    return getSupabase().storage;
  },
};

// Type definitions for our database tables
export interface WeatherCache {
  id: string;
  city: string;
  weather_category: string;
  weather_data: {
    condition_code: number;
    condition_text: string;
    temp_c: number;
    temp_f: number;
    humidity: number;
    wind_kph: number;
    is_day: number;
  };
  fetched_at: string;
  created_at: string;
}

export type TimeOfDay = "day" | "night";

export type AnimationStatus = "none" | "pending" | "processing" | "completed" | "failed";

export interface CityImage {
  id: string;
  city: string;
  weather_category: string;
  time_of_day: TimeOfDay;
  image_url: string;
  prompt_used: string;
  animation_url?: string;
  video_url?: string;
  animation_status: AnimationStatus;
  created_at: string;
}

// Storage bucket name
export const STORAGE_BUCKET = "city-images";

export interface WidgetCache {
  id: string;
  city: string;
  weather_hash: string;
  apng_url: string;
  created_at: string;
  expires_at: string;
}
