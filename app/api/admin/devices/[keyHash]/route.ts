import { NextRequest } from "next/server";
import { validateApiKeyAsync } from "@/lib/auth";
import {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
} from "@/lib/api-utils";
import { getSupabase } from "@/lib/supabase";
import type { DeviceDetail, JobSummary } from "@/lib/dashboard-types";

/**
 * GET /api/admin/devices/[keyHash]
 * Returns detailed information about a specific device and its jobs
 * Requires admin API key
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ keyHash: string }> }
) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const { keyHash } = await params;

  // Validate admin access
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

  if (!keyHash) {
    return createErrorResponse(requestId, "INVALID_BODY", "Missing keyHash parameter");
  }

  try {
    const supabase = getSupabase();

    // Fetch device info
    const { data: device, error: deviceError } = await supabase
      .from("api_keys")
      .select(
        "key_hash, device_name, device_id, app_version, is_active, request_count, last_used_at, created_at, expires_at"
      )
      .eq("key_hash", keyHash)
      .single();

    if (deviceError || !device) {
      return createErrorResponse(
        requestId,
        "JOB_NOT_FOUND",
        "Device not found"
      );
    }

    // Fetch jobs for this device
    const { data: jobs, error: jobsError } = await supabase
      .from("video_jobs")
      .select("id, job_type, status, city, cached, created_at, completed_at")
      .eq("api_key_hash", keyHash)
      .order("created_at", { ascending: false })
      .limit(100);

    if (jobsError) {
      console.error("Error fetching device jobs:", jobsError);
    }

    const jobsList = jobs || [];

    // Calculate job stats
    const imageCount = jobsList.filter((j) => j.job_type === "image").length;
    const videoCount = jobsList.filter((j) => j.job_type === "video").length;

    // Calculate duration for each job
    const jobSummaries: JobSummary[] = jobsList.map((job) => {
      let durationSeconds: number | null = null;
      if (job.created_at && job.completed_at) {
        const created = new Date(job.created_at).getTime();
        const completed = new Date(job.completed_at).getTime();
        durationSeconds = Math.round((completed - created) / 1000);
      }

      return {
        id: job.id,
        jobType: job.job_type as "image" | "video",
        status: job.status,
        city: job.city || "Unknown",
        cached: job.cached || false,
        createdAt: job.created_at,
        completedAt: job.completed_at,
        durationSeconds,
      };
    });

    // Build response
    const deviceDetail: DeviceDetail = {
      keyHash: device.key_hash,
      deviceName: device.device_name,
      deviceId: truncateDeviceId(device.device_id),
      appVersion: device.app_version,
      isActive: device.is_active,
      requestCount: device.request_count || 0,
      lastUsedAt: device.last_used_at,
      jobCount: jobsList.length,
      imageCount,
      videoCount,
      createdAt: device.created_at,
      expiresAt: device.expires_at,
      jobs: jobSummaries,
    };

    return createSuccessResponse(requestId, deviceDetail, startTime);
  } catch (error) {
    console.error("Error fetching device details:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to fetch device details"
    );
  }
}

/**
 * Truncate device ID for privacy (show first 4 and last 4 chars)
 */
function truncateDeviceId(deviceId: string | null): string {
  if (!deviceId || deviceId.length <= 12) {
    return deviceId || "Unknown";
  }
  return `${deviceId.slice(0, 4)}...${deviceId.slice(-4)}`;
}
