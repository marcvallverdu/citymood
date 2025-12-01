import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { validateApiKeyAsync } from "@/lib/auth";
import { createJob, getActiveJobForApiKey } from "@/lib/jobs";
import { cityImageWorkflow } from "@/workflows/city-image-workflow";
import {
  generateRequestId,
  createErrorResponse,
  SuccessResponse,
} from "@/lib/api-utils";

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

interface CityImageRequest {
  city: string;
  country?: string;
}

interface JobSubmitData {
  job_id: string;
  status: "pending";
  status_url: string;
  estimated_time_seconds: number;
}

/**
 * POST /api/v1/city-image
 *
 * Submit an image generation job for a city.
 * Returns immediately with a job_id that can be polled for status.
 *
 * Rate limited to 1 active job per API key (admin keys exempt).
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();

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

  // 2. Check for existing active job (rate limiting)
  if (!isAdmin) {
    try {
      const activeJobId = await getActiveJobForApiKey(apiKey);
      if (activeJobId) {
        return createErrorResponse(
          requestId,
          "RATE_LIMITED",
          "You already have an active job in progress. Please wait for it to complete or poll its status.",
          {
            active_job_id: activeJobId,
            status_url: `/api/v1/city-image/${activeJobId}`,
          }
        );
      }
    } catch (error) {
      console.error("Rate limit check failed:", error);
      // Continue anyway - better to allow the request than block on error
    }
  }

  // 3. Parse request body
  let body: CityImageRequest;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse(
      requestId,
      "INVALID_BODY",
      "Request body must be valid JSON"
    );
  }

  // 4. Validate city parameter
  if (!body.city || typeof body.city !== "string") {
    return createErrorResponse(
      requestId,
      "MISSING_CITY",
      "The 'city' field is required and must be a string"
    );
  }

  const city = body.city.trim();
  if (city.length === 0) {
    return createErrorResponse(
      requestId,
      "INVALID_CITY",
      "City name cannot be empty"
    );
  }

  if (city.length > 100) {
    return createErrorResponse(
      requestId,
      "INVALID_CITY",
      "City name is too long (maximum 100 characters)",
      { max_length: 100, provided_length: city.length }
    );
  }

  const country = body.country?.trim() || undefined;

  // 5. Create job in database
  let jobId: string;
  try {
    jobId = await createJob(apiKey, city, country, "image");
  } catch (error) {
    console.error("Failed to create job:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to create job. Please try again."
    );
  }

  // 6. Start workflow (durable, will survive restarts)
  try {
    await start(cityImageWorkflow, [{ jobId, city, country }]);
  } catch (error) {
    console.error(`Failed to start workflow for job ${jobId}:`, error);
    // Job is created but workflow didn't start - it will be in pending state
    // The user can poll for status and it will show as failed eventually
  }

  // 7. Return immediately with job info
  const responseData: JobSubmitData = {
    job_id: jobId,
    status: "pending",
    status_url: `/api/v1/city-image/${jobId}`,
    estimated_time_seconds: 15,
  };

  const processingTimeMs = Date.now() - startTime;

  const response: SuccessResponse<JobSubmitData> = {
    success: true,
    data: responseData,
    meta: {
      request_id: requestId,
      processing_time_ms: processingTimeMs,
    },
  };

  return NextResponse.json(response, { status: 202 });
}
