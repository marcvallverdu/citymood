/**
 * In-memory rate limiting for API requests
 * Tracks active requests per API key to enforce 1 concurrent request limit
 */

const activeRequests = new Map<string, boolean>();

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

export interface RateLimitResult {
  allowed: boolean;
  error?: string;
}

/**
 * Check if an API key is allowed to make a request
 * Admin keys bypass rate limiting entirely
 */
export function checkRateLimit(apiKey: string): RateLimitResult {
  // Admin key has unlimited access
  if (ADMIN_API_KEY && apiKey === ADMIN_API_KEY) {
    return { allowed: true };
  }

  // Check if this key already has an active request
  if (activeRequests.get(apiKey)) {
    return {
      allowed: false,
      error: "Rate limit exceeded. Please wait for your current request to complete.",
    };
  }

  return { allowed: true };
}

/**
 * Mark the start of a request for rate limiting
 */
export function startRequest(apiKey: string): void {
  // Don't track admin requests
  if (ADMIN_API_KEY && apiKey === ADMIN_API_KEY) {
    return;
  }
  activeRequests.set(apiKey, true);
}

/**
 * Mark the end of a request, releasing the rate limit lock
 */
export function endRequest(apiKey: string): void {
  activeRequests.delete(apiKey);
}

/**
 * Check if a key is the admin key (for logging/debugging)
 */
export function isAdminKey(apiKey: string): boolean {
  return Boolean(ADMIN_API_KEY && apiKey === ADMIN_API_KEY);
}
