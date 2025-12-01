import { NextRequest, NextResponse } from "next/server";
import { registerDevice, isDeviceRegistered } from "@/lib/api-keys";
import {
  generateRequestId,
  createErrorResponse,
  SuccessResponse,
} from "@/lib/api-utils";

/**
 * Simple IP-based rate limiting for registration
 * Allows 5 new registrations per IP per hour
 */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REGISTRATIONS = 5;

// In-memory store: IP -> timestamps of registrations
const registrationAttempts = new Map<string, number[]>();

function checkRegistrationRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetIn: number;
} {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Get existing attempts for this IP
  const attempts = registrationAttempts.get(ip) || [];

  // Filter to only recent attempts within the window
  const recentAttempts = attempts.filter((ts) => ts > windowStart);

  // Update the stored attempts
  registrationAttempts.set(ip, recentAttempts);

  const remaining = Math.max(0, RATE_LIMIT_MAX_REGISTRATIONS - recentAttempts.length);
  const oldestAttempt = recentAttempts[0] || now;
  const resetIn = Math.max(0, oldestAttempt + RATE_LIMIT_WINDOW_MS - now);

  return {
    allowed: recentAttempts.length < RATE_LIMIT_MAX_REGISTRATIONS,
    remaining,
    resetIn,
  };
}

function recordRegistrationAttempt(ip: string): void {
  const attempts = registrationAttempts.get(ip) || [];
  attempts.push(Date.now());
  registrationAttempts.set(ip, attempts);
}

function getClientIp(request: NextRequest): string {
  // Try various headers that might contain the real IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback (won't work in production behind proxy)
  return "unknown";
}

/**
 * Request body for device registration
 */
interface RegisterRequest {
  device_id: string;
  device_name?: string;
  app_version?: string;
}

/**
 * Response data for successful registration
 */
interface RegisterResponseData {
  api_key: string;
  device_id: string;
  created_at: string;
  rate_limit: {
    max_concurrent_jobs: number;
  };
}

/**
 * Validate device_id format (should be UUID-like)
 */
function isValidDeviceId(deviceId: string): boolean {
  // Accept UUID format or any reasonable identifier
  // UUID: 8-4-4-4-12 hex chars
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Also accept plain hex identifiers (32+ chars)
  const hexRegex = /^[0-9a-f]{32,}$/i;

  return uuidRegex.test(deviceId) || hexRegex.test(deviceId);
}

/**
 * POST /api/v1/register
 *
 * Register a device and receive an API key.
 * If the device is already registered, returns the existing key.
 *
 * This endpoint does not require authentication.
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // 0. Check rate limit (only for NEW registrations, not re-registrations)
  const clientIp = getClientIp(request);

  // 1. Parse request body
  let body: RegisterRequest;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse(
      requestId,
      "INVALID_BODY",
      "Request body must be valid JSON"
    );
  }

  // 2. Validate device_id
  if (!body.device_id || typeof body.device_id !== "string") {
    return createErrorResponse(
      requestId,
      "MISSING_CITY", // Reusing error code, could add MISSING_DEVICE_ID
      "The 'device_id' field is required"
    );
  }

  const deviceId = body.device_id.trim();

  if (!isValidDeviceId(deviceId)) {
    return createErrorResponse(
      requestId,
      "INVALID_CITY", // Reusing error code
      "Invalid device_id format. Expected UUID or hex identifier."
    );
  }

  // 3. Validate optional fields
  const deviceName = body.device_name?.trim().slice(0, 100) || undefined;
  const appVersion = body.app_version?.trim().slice(0, 20) || undefined;

  // 4. Check if this is a new registration and apply rate limit
  try {
    const alreadyRegistered = await isDeviceRegistered(deviceId);

    // Only apply rate limit for NEW device registrations
    if (!alreadyRegistered) {
      const rateLimit = checkRegistrationRateLimit(clientIp);
      if (!rateLimit.allowed) {
        return createErrorResponse(
          requestId,
          "RATE_LIMITED",
          `Too many registration attempts. Try again in ${Math.ceil(rateLimit.resetIn / 60000)} minutes.`
        );
      }
    }

    // 5. Register device or get existing key
    const { apiKey, isNew } = await registerDevice(
      deviceId,
      deviceName,
      appVersion
    );

    // Record the registration attempt if it was a new device
    if (isNew) {
      recordRegistrationAttempt(clientIp);
    }

    const responseData: RegisterResponseData = {
      api_key: apiKey.id,
      device_id: apiKey.device_id,
      created_at: apiKey.created_at,
      rate_limit: {
        max_concurrent_jobs: 1,
      },
    };

    const processingTimeMs = Date.now() - startTime;

    const response: SuccessResponse<RegisterResponseData> = {
      success: true,
      data: responseData,
      meta: {
        request_id: requestId,
        processing_time_ms: processingTimeMs,
      },
    };

    // 201 Created for new registration, 200 OK for existing
    return NextResponse.json(response, { status: isNew ? 201 : 200 });
  } catch (error) {
    console.error("Registration failed:", error);
    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "Failed to register device. Please try again."
    );
  }
}
