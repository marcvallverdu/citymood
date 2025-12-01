import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { ErrorCode } from "./api-utils";
import {
  isCityMoodApiKey,
  validateApiKeyFromDb,
  trackApiKeyUsage,
} from "./api-keys";

const API_SECRET_KEY = process.env.API_SECRET_KEY;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  try {
    // timingSafeEqual requires same-length buffers
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    // If lengths differ, compare with a dummy buffer to maintain constant time
    if (bufA.length !== bufB.length) {
      const dummy = Buffer.alloc(bufA.length);
      timingSafeEqual(bufA, dummy);
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export interface AuthResult {
  valid: boolean;
  error?: string;
  errorCode?: ErrorCode;
  apiKey?: string;
  isAdmin?: boolean;
}

/**
 * Extract the API key from the Authorization header
 * Returns null if header is missing or malformed
 */
export function extractApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.substring(7); // Remove "Bearer " prefix
}

/**
 * Validate API key from Authorization header (synchronous check for env vars only)
 * Expected format: "Bearer <api_key>"
 *
 * This checks admin and legacy env var keys synchronously.
 * For database-backed keys (cm_live_*), use validateApiKeyAsync.
 */
export function validateApiKey(request: NextRequest): AuthResult {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return {
      valid: false,
      error: "Missing Authorization header",
      errorCode: "AUTH_MISSING",
    };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return {
      valid: false,
      error: "Invalid Authorization format. Use: Bearer <api_key>",
      errorCode: "AUTH_INVALID_FORMAT",
    };
  }

  const providedKey = authHeader.substring(7); // Remove "Bearer " prefix

  // Check if it's the admin key (constant-time comparison)
  if (ADMIN_API_KEY && secureCompare(providedKey, ADMIN_API_KEY)) {
    return { valid: true, apiKey: providedKey, isAdmin: true };
  }

  // Check if it's the legacy env var API key (constant-time comparison)
  if (API_SECRET_KEY && secureCompare(providedKey, API_SECRET_KEY)) {
    return { valid: true, apiKey: providedKey, isAdmin: false };
  }

  // For cm_live_ keys, we need async validation
  if (isCityMoodApiKey(providedKey)) {
    // Return a special result indicating async validation is needed
    return {
      valid: false,
      error: "NEEDS_ASYNC_VALIDATION",
      errorCode: "AUTH_INVALID_KEY",
      apiKey: providedKey,
    };
  }

  return {
    valid: false,
    error: "Invalid API key",
    errorCode: "AUTH_INVALID_KEY",
  };
}

/**
 * Validate API key from Authorization header (async, supports database lookup)
 * Expected format: "Bearer <api_key>"
 *
 * This is the preferred method for validating API keys as it supports
 * both env var keys and database-backed keys (cm_live_*).
 */
export async function validateApiKeyAsync(
  request: NextRequest
): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return {
      valid: false,
      error: "Missing Authorization header",
      errorCode: "AUTH_MISSING",
    };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return {
      valid: false,
      error: "Invalid Authorization format. Use: Bearer <api_key>",
      errorCode: "AUTH_INVALID_FORMAT",
    };
  }

  const providedKey = authHeader.substring(7); // Remove "Bearer " prefix

  // Check if it's the admin key (constant-time comparison)
  if (ADMIN_API_KEY && secureCompare(providedKey, ADMIN_API_KEY)) {
    return { valid: true, apiKey: providedKey, isAdmin: true };
  }

  // Check if it's the legacy env var API key (constant-time comparison)
  if (API_SECRET_KEY && secureCompare(providedKey, API_SECRET_KEY)) {
    return { valid: true, apiKey: providedKey, isAdmin: false };
  }

  // Check if it's a CityMood API key (cm_live_*)
  if (isCityMoodApiKey(providedKey)) {
    try {
      const apiKeyRecord = await validateApiKeyFromDb(providedKey);

      if (!apiKeyRecord) {
        return {
          valid: false,
          error: "Invalid API key",
          errorCode: "AUTH_INVALID_KEY",
        };
      }

      // Track usage (fire and forget)
      trackApiKeyUsage(providedKey).catch(() => {});

      return {
        valid: true,
        apiKey: providedKey,
        isAdmin: apiKeyRecord.is_admin,
      };
    } catch (error) {
      console.error("Database error during API key validation:", error);
      return {
        valid: false,
        error: "Authentication service temporarily unavailable",
        errorCode: "INTERNAL_ERROR",
      };
    }
  }

  return {
    valid: false,
    error: "Invalid API key",
    errorCode: "AUTH_INVALID_KEY",
  };
}

/**
 * Validate API key from query parameter (for widget endpoints)
 * Used when authentication via header isn't practical (e.g., image URLs in widgets)
 */
export async function validateTokenFromQuery(
  token: string | null
): Promise<AuthResult> {
  if (!token) {
    return {
      valid: false,
      error: "Missing token parameter",
      errorCode: "AUTH_MISSING",
    };
  }

  // Check if it's the admin key (constant-time comparison)
  if (ADMIN_API_KEY && secureCompare(token, ADMIN_API_KEY)) {
    return { valid: true, apiKey: token, isAdmin: true };
  }

  // Check if it's the legacy env var API key (constant-time comparison)
  if (API_SECRET_KEY && secureCompare(token, API_SECRET_KEY)) {
    return { valid: true, apiKey: token, isAdmin: false };
  }

  // Check if it's a CityMood API key (cm_live_*)
  if (isCityMoodApiKey(token)) {
    try {
      const apiKeyRecord = await validateApiKeyFromDb(token);

      if (!apiKeyRecord) {
        return {
          valid: false,
          error: "Invalid token",
          errorCode: "AUTH_INVALID_KEY",
        };
      }

      // Track usage (fire and forget)
      trackApiKeyUsage(token).catch(() => {});

      return {
        valid: true,
        apiKey: token,
        isAdmin: apiKeyRecord.is_admin,
      };
    } catch (error) {
      console.error("Database error during token validation:", error);
      return {
        valid: false,
        error: "Authentication service temporarily unavailable",
        errorCode: "INTERNAL_ERROR",
      };
    }
  }

  return {
    valid: false,
    error: "Invalid token",
    errorCode: "AUTH_INVALID_KEY",
  };
}
