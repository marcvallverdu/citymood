import { NextResponse } from "next/server";
import { supabase, TimeOfDay } from "@/lib/supabase";

export interface CachedCity {
  city: string;
  weather_category: string;
  time_of_day: TimeOfDay;
  image_url: string;
  created_at: string;
}

export async function GET() {
  const { data, error } = await supabase
    .from("city_images")
    .select("city, weather_category, time_of_day, image_url, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as CachedCity[]);
}
