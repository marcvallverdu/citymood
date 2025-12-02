import { NextRequest } from "next/server";
import { validateApiKeyAsync } from "@/lib/auth";
import {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
} from "@/lib/api-utils";
import { getSupabase } from "@/lib/supabase";
import { start } from "workflow/api";
import { cityVideoWorkflow } from "@/workflows/city-video-workflow";
import type { VideoJob } from "@/lib/jobs";

export interface FailedJobEntry {
  id: string;
  city: string;
  country: string | null;
  job_type: string;
  stage: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/admin/failed-jobs
 * Returns all failed jobs
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
      .from("video_jobs")
      .select("id, city, country, job_type, stage, error_message, created_at, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch failed jobs: ${error.message}`);
    }

    const jobs: FailedJobEntry[] = (data || []).map((row) => ({
      id: row.id,
      city: row.city,
      country: row.country,
      job_type: row.job_type,
      stage: row.stage,
      error_message: row.error_message,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return createSuccessResponse(requestId, { jobs }, startTime);
  } catch (error) {
    console.error("Error fetching failed jobs:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to fetch failed jobs"
    );
  }
}

/**
 * POST /api/admin/failed-jobs
 * Retry a failed job by resetting its status and starting the workflow
 * Requires admin API key
 */
export async function POST(request: NextRequest) {
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
    const { jobId } = body;

    if (!jobId) {
      return createErrorResponse(
        requestId,
        "INVALID_BODY",
        "Missing required field: jobId"
      );
    }

    const supabase = getSupabase();

    // Get the failed job
    const { data: job, error: fetchError } = await supabase
      .from("video_jobs")
      .select("*")
      .eq("id", jobId)
      .single<VideoJob>();

    if (fetchError || !job) {
      return createErrorResponse(
        requestId,
        "JOB_NOT_FOUND",
        "Job not found"
      );
    }

    if (job.status !== "failed") {
      return createErrorResponse(
        requestId,
        "INVALID_BODY",
        `Cannot retry job with status: ${job.status}`
      );
    }

    // Reset the job status to pending
    const { error: updateError } = await supabase
      .from("video_jobs")
      .update({
        status: "pending",
        stage: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateError) {
      throw new Error(`Failed to reset job: ${updateError.message}`);
    }

    // Start the workflow
    try {
      await start(cityVideoWorkflow, [{ jobId, city: job.city, country: job.country ?? undefined }]);
    } catch (workflowError) {
      console.error(`Failed to start workflow for retry job ${jobId}:`, workflowError);
      // Job is reset but workflow didn't start - it will remain in pending state
    }

    return createSuccessResponse(
      requestId,
      {
        success: true,
        jobId,
        city: job.city,
        message: "Job has been queued for retry",
      },
      startTime
    );
  } catch (error) {
    console.error("Error retrying job:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to retry job"
    );
  }
}

/**
 * DELETE /api/admin/failed-jobs
 * Delete a failed job
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
    const { jobId } = body;

    if (!jobId) {
      return createErrorResponse(
        requestId,
        "INVALID_BODY",
        "Missing required field: jobId"
      );
    }

    const supabase = getSupabase();

    // Verify job exists and is failed
    const { data: job, error: fetchError } = await supabase
      .from("video_jobs")
      .select("id, status, city")
      .eq("id", jobId)
      .single();

    if (fetchError || !job) {
      return createErrorResponse(
        requestId,
        "JOB_NOT_FOUND",
        "Job not found"
      );
    }

    if (job.status !== "failed") {
      return createErrorResponse(
        requestId,
        "INVALID_BODY",
        `Cannot delete job with status: ${job.status}`
      );
    }

    // Delete the job
    const { error: deleteError } = await supabase
      .from("video_jobs")
      .delete()
      .eq("id", jobId);

    if (deleteError) {
      throw new Error(`Failed to delete job: ${deleteError.message}`);
    }

    return createSuccessResponse(
      requestId,
      {
        success: true,
        deleted: { jobId, city: job.city },
      },
      startTime
    );
  } catch (error) {
    console.error("Error deleting failed job:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to delete job"
    );
  }
}
