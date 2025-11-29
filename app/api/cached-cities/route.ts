import { NextResponse } from "next/server";
import { supabase, TimeOfDay, AnimationStatus } from "@/lib/supabase";

export interface CachedCity {
  city: string;
  weather_category: string;
  time_of_day: TimeOfDay;
  image_url: string;
  animation_url?: string;
  animation_status: AnimationStatus;
  created_at: string;
}

export async function GET() {
  const { data, error } = await supabase
    .from("city_images")
    .select("city, weather_category, time_of_day, image_url, animation_url, animation_status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as CachedCity[]);
}
