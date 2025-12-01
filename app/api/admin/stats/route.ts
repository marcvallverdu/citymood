import { NextRequest } from "next/server";
import { validateApiKeyAsync } from "@/lib/auth";
import {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
} from "@/lib/api-utils";
import { getSupabase } from "@/lib/supabase";
import type {
  DashboardStats,
  DeviceSummary,
  CitySummary,
  TimeSeriesPoint,
  JobStatus,
} from "@/lib/dashboard-types";

/**
 * GET /api/admin/stats
 * Returns aggregate dashboard statistics
 * Requires admin API key
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();

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

  try {
    const supabase = getSupabase();

    // Run queries in parallel for performance
    const [
      deviceCountsResult,
      jobCountsResult,
      topDevicesResult,
      topCitiesResult,
      jobsOverTimeResult,
      avgGenTimeResult,
    ] = await Promise.all([
      // 1. Device counts
      supabase.from("api_keys").select("is_active, last_used_at, expires_at"),

      // 2. Job counts by type/status/cached
      supabase.from("video_jobs").select("job_type, status, cached"),

      // 3. Top devices by request count
      supabase
        .from("api_keys")
        .select("key_hash, device_name, device_id, app_version, is_active, request_count, last_used_at")
        .order("request_count", { ascending: false })
        .limit(10),

      // 4. Top cities
      supabase
        .from("video_jobs")
        .select("city")
        .eq("status", "completed")
        .not("city", "is", null),

      // 5. Jobs over time (last 30 days)
      supabase
        .from("video_jobs")
        .select("created_at, job_type, cached")
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

      // 6. Average generation time for completed jobs
      supabase
        .from("video_jobs")
        .select("created_at, completed_at")
        .eq("status", "completed")
        .not("completed_at", "is", null),
    ]);

    // Process device counts
    const devices = deviceCountsResult.data || [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const deviceStats = {
      total: devices.length,
      active: devices.filter((d) => d.is_active && new Date(d.expires_at) > now).length,
      recentlyUsed: devices.filter(
        (d) => d.last_used_at && new Date(d.last_used_at) > sevenDaysAgo
      ).length,
      expired: devices.filter((d) => new Date(d.expires_at) <= now).length,
    };

    // Process job counts
    const jobs = jobCountsResult.data || [];
    const jobsByStatus: Record<JobStatus, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };
    let totalImages = 0;
    let totalVideos = 0;
    let cachedCount = 0;

    for (const job of jobs) {
      if (job.status in jobsByStatus) {
        jobsByStatus[job.status as JobStatus]++;
      }
      if (job.job_type === "image") totalImages++;
      if (job.job_type === "video") totalVideos++;
      if (job.cached) cachedCount++;
    }

    const totalJobs = jobs.length;
    const cacheHitRate = totalJobs > 0 ? (cachedCount / totalJobs) * 100 : 0;

    // Process top devices - need to get job counts per device
    const topDevicesRaw = topDevicesResult.data || [];
    const topDevices: DeviceSummary[] = [];

    for (const device of topDevicesRaw) {
      // Get job counts for this device
      const { data: deviceJobs } = await supabase
        .from("video_jobs")
        .select("job_type")
        .eq("api_key_hash", device.key_hash);

      const deviceJobsList = deviceJobs || [];
      const imageCount = deviceJobsList.filter((j) => j.job_type === "image").length;
      const videoCount = deviceJobsList.filter((j) => j.job_type === "video").length;

      topDevices.push({
        keyHash: device.key_hash,
        deviceName: device.device_name,
        deviceId: truncateDeviceId(device.device_id),
        appVersion: device.app_version,
        isActive: device.is_active,
        requestCount: device.request_count || 0,
        lastUsedAt: device.last_used_at,
        jobCount: deviceJobsList.length,
        imageCount,
        videoCount,
      });
    }

    // Process top cities
    const citiesRaw = topCitiesResult.data || [];
    const cityCounts: Record<string, number> = {};
    for (const job of citiesRaw) {
      if (job.city) {
        cityCounts[job.city] = (cityCounts[job.city] || 0) + 1;
      }
    }
    const topCities: CitySummary[] = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([city, count]) => ({ city, count }));

    // Process jobs over time
    const jobsTimeRaw = jobsOverTimeResult.data || [];
    const dateMap: Record<string, { images: number; videos: number; cached: number }> = {};

    for (const job of jobsTimeRaw) {
      const date = job.created_at.split("T")[0]; // YYYY-MM-DD
      if (!dateMap[date]) {
        dateMap[date] = { images: 0, videos: 0, cached: 0 };
      }
      if (job.job_type === "image") dateMap[date].images++;
      if (job.job_type === "video") dateMap[date].videos++;
      if (job.cached) dateMap[date].cached++;
    }

    const jobsOverTime: TimeSeriesPoint[] = Object.entries(dateMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({
        date,
        images: counts.images,
        videos: counts.videos,
        cached: counts.cached,
      }));

    // Calculate average generation time
    const completedJobs = avgGenTimeResult.data || [];
    let totalGenTime = 0;
    let genTimeCount = 0;

    for (const job of completedJobs) {
      if (job.created_at && job.completed_at) {
        const created = new Date(job.created_at).getTime();
        const completed = new Date(job.completed_at).getTime();
        const duration = (completed - created) / 1000; // seconds
        if (duration > 0 && duration < 3600) {
          // Ignore outliers > 1 hour
          totalGenTime += duration;
          genTimeCount++;
        }
      }
    }

    const avgGenerationTime = genTimeCount > 0 ? totalGenTime / genTimeCount : 0;

    // Build response
    const stats: DashboardStats = {
      devices: deviceStats,
      jobs: {
        totalImages,
        totalVideos,
        byStatus: jobsByStatus,
        cachedCount,
        cacheHitRate: Math.round(cacheHitRate * 10) / 10,
      },
      topDevices,
      topCities,
      jobsOverTime,
      avgGenerationTime: Math.round(avgGenerationTime * 10) / 10,
    };

    return createSuccessResponse(requestId, stats, startTime);
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to fetch dashboard statistics"
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
