import { NextRequest } from "next/server";
import { validateApiKeyAsync } from "@/lib/auth";
import { getJob, validateJobOwnership, STAGE_INFO, VideoJob } from "@/lib/jobs";
import {
  generateRequestId,
  createErrorResponse,
  createSuccessResponse,
} from "@/lib/api-utils";

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

interface JobProgress {
  current_step: number;
  total_steps: number;
  message: string;
}

interface JobStatusData {
  job_id: string;
  status: "pending" | "processing";
  stage?: string;
  progress?: JobProgress;
}

interface JobCompletedData {
  job_id: string;
  status: "completed";
  result: {
    city: string;
    country: string;
    image_url: string;
    weather: {
      category: string;
      description: string;
      temperature_c: number;
      temperature_f: number;
      humidity: number;
      wind_kph: number;
      is_day: boolean;
    };
    generated_at: string;
    cached: boolean;
  };
}

function buildJobResponse(job: VideoJob): JobStatusData | JobCompletedData {
  // For image jobs, video_url contains the image URL
  if (job.status === "completed" && job.video_url && job.weather_data) {
    return {
      job_id: job.id,
      status: "completed",
      result: {
        city: job.city,
        country: job.country || "",
        image_url: job.video_url, // For image jobs, this holds the image URL
        weather: {
          category: job.weather_data.category,
          description: job.weather_data.conditionText,
          temperature_c: job.weather_data.tempC,
          temperature_f: job.weather_data.tempF,
          humidity: job.weather_data.humidity,
          wind_kph: job.weather_data.windKph,
          is_day: job.weather_data.isDay,
        },
        generated_at: job.completed_at || new Date().toISOString(),
        cached: job.cached || false,
      },
    };
  }

  // Pending or processing
  const response: JobStatusData = {
    job_id: job.id,
    status: job.status as "pending" | "processing",
  };

  if (job.stage && STAGE_INFO[job.stage]) {
    const stageInfo = STAGE_INFO[job.stage];
    response.stage = job.stage;
    response.progress = {
      current_step: stageInfo.step,
      // Image jobs only have 2 steps
      total_steps: 2,
      message: stageInfo.message,
    };
  }

  return response;
}

/**
 * GET /api/v1/city-image/:jobId
 *
 * Check the status of an image generation job.
 * Returns progress information for pending/processing jobs.
 * Returns the full result for completed jobs.
 * Returns error details for failed jobs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const { jobId } = await params;

  // 1. Authenticate
  const authResult = await validateApiKeyAsync(request);
  if (!authResult.valid) {
    return createErrorResponse(
      requestId,
      authResult.errorCode || "AUTH_INVALID_KEY",
      authResult.error || "Authentication failed"
    );
  }

  const apiKey = authResult.apiKey!;
  const isAdmin = ADMIN_API_KEY && apiKey === ADMIN_API_KEY;

  // 2. Get job from database
  let job: VideoJob | null;
  try {
    job = await getJob(jobId);
  } catch (error) {
    console.error("Failed to get job:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to retrieve job status. Please try again."
    );
  }

  // 3. Check if job exists
  if (!job) {
    return createErrorResponse(
      requestId,
      "JOB_NOT_FOUND",
      `Job '${jobId}' not found. It may have expired or never existed.`
    );
  }

  // 4. Validate ownership (unless admin)
  if (!isAdmin && !validateJobOwnership(job, apiKey)) {
    // Return generic "not found" to avoid leaking job existence
    return createErrorResponse(
      requestId,
      "JOB_NOT_FOUND",
      `Job '${jobId}' not found. It may have expired or never existed.`
    );
  }

  // 5. Handle failed jobs
  if (job.status === "failed") {
    return createErrorResponse(
      requestId,
      "VIDEO_GENERATION_FAILED",
      job.error_message || "Image generation failed",
      { job_id: job.id, stage: job.stage }
    );
  }

  // 6. Return job status/result
  const responseData = buildJobResponse(job);
  return createSuccessResponse(requestId, responseData, startTime);
}
