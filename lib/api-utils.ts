import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

/**
 * Standard error codes for the API
 */
export type ErrorCode =
  | "AUTH_MISSING"
  | "AUTH_INVALID_FORMAT"
  | "AUTH_INVALID_KEY"
  | "RATE_LIMITED"
  | "INVALID_BODY"
  | "MISSING_CITY"
  | "INVALID_CITY"
  | "CITY_NOT_FOUND"
  | "JOB_NOT_FOUND"
  | "WEATHER_API_ERROR"
  | "VIDEO_GENERATION_FAILED"
  | "INTERNAL_ERROR";

/**
 * Map error codes to HTTP status codes
 */
const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  AUTH_MISSING: 401,
  AUTH_INVALID_FORMAT: 401,
  AUTH_INVALID_KEY: 401,
  RATE_LIMITED: 429,
  INVALID_BODY: 400,
  MISSING_CITY: 400,
  INVALID_CITY: 400,
  CITY_NOT_FOUND: 404,
  JOB_NOT_FOUND: 404,
  WEATHER_API_ERROR: 503,
  VIDEO_GENERATION_FAILED: 500,
  INTERNAL_ERROR: 500,
};

/**
 * Success response structure
 */
export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    request_id: string;
    processing_time_ms: number;
  };
}

/**
 * Error response structure
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    request_id: string;
  };
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  requestId: string,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  const status = ERROR_STATUS_MAP[code];

  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    meta: {
      request_id: requestId,
    },
  };

  return NextResponse.json(response, { status });
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(
  requestId: string,
  data: T,
  startTime: number
): NextResponse<SuccessResponse<T>> {
  const processingTimeMs = Date.now() - startTime;

  const response: SuccessResponse<T> = {
    success: true,
    data,
    meta: {
      request_id: requestId,
      processing_time_ms: processingTimeMs,
    },
  };

  return NextResponse.json(response);
}

/**
 * Extract a meaningful error message from an unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}
