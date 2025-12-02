import { NextRequest } from "next/server";
import { validateApiKeyAsync } from "@/lib/auth";
import {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
} from "@/lib/api-utils";
import { getSupabase, STORAGE_BUCKET } from "@/lib/supabase";

export interface CityImageEntry {
  id: string;
  city: string;
  weather_category: string;
  time_of_day: string;
  image_url: string;
  video_url: string | null;
  animation_url: string | null;
  apng_url: string | null;
  animation_status: string;
  created_at: string;
}

/**
 * GET /api/admin/gallery
 * Returns all city images with their status
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

    // Fetch city images and widget cache in parallel
    const [imagesResult, widgetCacheResult] = await Promise.all([
      supabase
        .from("city_images")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("widget_cache")
        .select("city, apng_url, weather_hash")
        .gt("expires_at", new Date().toISOString()),
    ]);

    if (imagesResult.error) {
      throw new Error(`Failed to fetch city images: ${imagesResult.error.message}`);
    }

    // Build a map of city -> apng_url from widget cache
    const apngMap: Record<string, string> = {};
    for (const entry of widgetCacheResult.data || []) {
      // Use lowercase city as key for matching
      const key = entry.city.toLowerCase();
      apngMap[key] = entry.apng_url;
    }

    const images: CityImageEntry[] = (imagesResult.data || []).map((row) => {
      const cityKey = row.city.toLowerCase();
      return {
        id: row.id,
        city: row.city,
        weather_category: row.weather_category,
        time_of_day: row.time_of_day || "day",
        image_url: row.image_url,
        video_url: row.video_url || null,
        animation_url: row.animation_url || null,
        apng_url: apngMap[cityKey] || null,
        animation_status: row.animation_status || "none",
        created_at: row.created_at,
      };
    });

    return createSuccessResponse(requestId, { images }, startTime);
  } catch (error) {
    console.error("Error fetching gallery:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to fetch gallery"
    );
  }
}

/**
 * DELETE /api/admin/gallery
 * Deletes a city image entry and its storage files
 * Requires admin API key
 */
export async function DELETE(request: NextRequest) {
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
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return createErrorResponse(
        requestId,
        "INVALID_BODY",
        "Missing required field: id"
      );
    }

    const supabase = getSupabase();

    // Get the record first to know what files to delete
    const { data: record, error: fetchError } = await supabase
      .from("city_images")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !record) {
      return createErrorResponse(
        requestId,
        "JOB_NOT_FOUND",
        "City image not found"
      );
    }

    // Delete storage files
    const filesToDelete: string[] = [];
    const city = record.city;
    const weatherCategory = record.weather_category;
    const timeOfDay = record.time_of_day || "day";
    const basePath = `${city}/${weatherCategory}_${timeOfDay}`;

    filesToDelete.push(`${basePath}.png`);
    filesToDelete.push(`${basePath}.mp4`);
    filesToDelete.push(`${basePath}.apng`);

    // Try to delete files (ignore errors for missing files)
    for (const file of filesToDelete) {
      await supabase.storage.from(STORAGE_BUCKET).remove([file]);
    }

    // Delete the database record
    const { error: deleteError } = await supabase
      .from("city_images")
      .delete()
      .eq("id", id);

    if (deleteError) {
      throw new Error(`Failed to delete record: ${deleteError.message}`);
    }

    return createSuccessResponse(
      requestId,
      {
        success: true,
        deleted: {
          city,
          weather_category: weatherCategory,
          time_of_day: timeOfDay,
        },
      },
      startTime
    );
  } catch (error) {
    console.error("Error deleting city image:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to delete city image"
    );
  }
}
