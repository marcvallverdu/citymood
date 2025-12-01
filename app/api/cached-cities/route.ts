import { NextRequest, NextResponse } from "next/server";
import {
  supabase,
  STORAGE_BUCKET,
  TimeOfDay,
  AnimationStatus,
} from "@/lib/supabase";
import { validateApiKeyAsync } from "@/lib/auth";

export interface CachedCity {
  city: string;
  weather_category: string;
  time_of_day: TimeOfDay;
  image_url: string;
  animation_url?: string;
  video_url?: string;
  animation_status: AnimationStatus;
  created_at: string;
}

export async function GET(request: NextRequest) {
  // Require authentication to prevent enumeration attacks
  const authResult = await validateApiKeyAsync(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: authResult.error || "Unauthorized" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("city_images")
    .select(
      "city, weather_category, time_of_day, image_url, animation_url, video_url, animation_status, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as CachedCity[]);
}

export async function DELETE(request: NextRequest) {
  // Validate API key
  const authResult = await validateApiKeyAsync(request);
  if (!authResult.valid) {
    return NextResponse.json(
      { error: authResult.error || "Unauthorized" },
      { status: 401 }
    );
  }

  // Parse request body
  let body: { city: string; weather_category: string; time_of_day: TimeOfDay };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { city, weather_category, time_of_day } = body;

  if (!city || !weather_category || !time_of_day) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  // Delete files from storage
  const imageFileName = `${city}/${weather_category}_${time_of_day}.png`;
  const animationFileName = `${city}/${weather_category}_${time_of_day}.apng`;
  const videoFileName = `${city}/${weather_category}_${time_of_day}.mp4`;

  await supabase.storage.from(STORAGE_BUCKET).remove([imageFileName, animationFileName, videoFileName]);

  // Delete from database
  const { error } = await supabase
    .from("city_images")
    .delete()
    .eq("city", city)
    .eq("weather_category", weather_category)
    .eq("time_of_day", time_of_day);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
