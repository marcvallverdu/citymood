import { NextRequest } from "next/server";
import { validateApiKeyAsync } from "@/lib/auth";
import {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
} from "@/lib/api-utils";
import { getSupabase, STORAGE_BUCKET } from "@/lib/supabase";

export interface WidgetCacheEntry {
  id: string;
  city: string;
  weather_hash: string;
  apng_url: string;
  created_at: string;
  expires_at: string;
}

/**
 * GET /api/admin/widget-cache
 * Returns all widget cache entries
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
      .from("widget_cache")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch widget cache: ${error.message}`);
    }

    const entries: WidgetCacheEntry[] = (data || []).map((row) => ({
      id: row.id,
      city: row.city,
      weather_hash: row.weather_hash,
      apng_url: row.apng_url,
      created_at: row.created_at,
      expires_at: row.expires_at,
    }));

    return createSuccessResponse(requestId, { entries }, startTime);
  } catch (error) {
    console.error("Error fetching widget cache:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to fetch widget cache"
    );
  }
}

/**
 * DELETE /api/admin/widget-cache
 * Deletes a widget cache entry and its storage file
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

    // Get the record first to know what file to delete
    const { data: record, error: fetchError } = await supabase
      .from("widget_cache")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !record) {
      return createErrorResponse(
        requestId,
        "JOB_NOT_FOUND",
        "Widget cache entry not found"
      );
    }

    // Delete storage file
    const filePath = `widgets/${record.city}/${record.weather_hash}.apng`;
    await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);

    // Delete the database record
    const { error: deleteError } = await supabase
      .from("widget_cache")
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
          city: record.city,
          weather_hash: record.weather_hash,
        },
      },
      startTime
    );
  } catch (error) {
    console.error("Error deleting widget cache:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to delete widget cache entry"
    );
  }
}
