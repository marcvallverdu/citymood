import { createBoomerangMp4 } from "@/lib/ffmpeg";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase";
import { normalizeCity } from "@/lib/weather";
import { WeatherCategory } from "@/lib/weather-categories";
import { TimeOfDay } from "@/lib/supabase";
import { updateAnimationStatus } from "@/lib/gemini";

export async function processVideoStep(
  city: string,
  weatherCategory: WeatherCategory,
  timeOfDay: TimeOfDay,
  rawVideoBuffer: Buffer
): Promise<string> {
  "use step";

  const normalizedCity = normalizeCity(city);

  // Mark animation as processing
  await updateAnimationStatus(city, weatherCategory, timeOfDay, "processing");

  try {
    // Create boomerang effect (forward + reverse) for seamless looping
    const videoBuffer = await createBoomerangMp4(rawVideoBuffer);

    // Upload MP4 to Supabase Storage
    const mp4FileName = `${normalizedCity}/${weatherCategory}_${timeOfDay}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(mp4FileName, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload MP4: ${uploadError.message}`);
    }

    const {
      data: { publicUrl: videoUrl },
    } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(mp4FileName);

    // Update database with video URL
    await updateAnimationStatus(
      city,
      weatherCategory,
      timeOfDay,
      "completed",
      videoUrl,
      videoUrl
    );

    return videoUrl;
  } catch (error) {
    // Mark animation as failed
    await updateAnimationStatus(city, weatherCategory, timeOfDay, "failed");
    throw error;
  }
}
