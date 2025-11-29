import { NextRequest } from "next/server";

const API_SECRET_KEY = process.env.API_SECRET_KEY!;

export interface AuthResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate API key from Authorization header
 * Expected format: "Bearer <api_key>"
 */
export function validateApiKey(request: NextRequest): AuthResult {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return { valid: false, error: "Missing Authorization header" };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return { valid: false, error: "Invalid Authorization format. Use: Bearer <api_key>" };
  }

  const providedKey = authHeader.substring(7); // Remove "Bearer " prefix

  if (providedKey !== API_SECRET_KEY) {
    return { valid: false, error: "Invalid API key" };
  }

  return { valid: true };
}
