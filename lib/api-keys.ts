import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use service role for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * API key prefix for easy identification
 */
const API_KEY_PREFIX = "cm_live_";

/**
 * Hash an API key for secure storage/lookup
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Key expiration duration (1 year in milliseconds)
 */
const KEY_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * API key record from database
 */
export interface ApiKey {
  id: string;
  key_hash: string;
  device_id: string;
  device_name: string | null;
  app_version: string | null;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_used_at: string | null;
  request_count: number;
  expires_at: string;
}

/**
 * Generate a new API key with the cm_live_ prefix
 */
export function generateApiKey(): string {
  const randomPart = crypto.randomBytes(16).toString("hex");
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Check if a string looks like a CityMood API key
 */
export function isCityMoodApiKey(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX);
}

/**
 * Get an API key by device ID (for registration)
 * Returns the existing key if device is already registered
 */
export async function getApiKeyByDeviceId(
  deviceId: string
): Promise<ApiKey | null> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("device_id", deviceId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found
    console.error("Error fetching API key by device ID:", error);
    throw error;
  }

  return data as ApiKey | null;
}

/**
 * Create a new API key for a device
 * Returns the key record with the plaintext key in the 'id' field
 * IMPORTANT: The plaintext key is only available at creation time
 */
export async function createApiKey(
  deviceId: string,
  deviceName?: string,
  appVersion?: string
): Promise<ApiKey> {
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const expiresAt = new Date(Date.now() + KEY_EXPIRY_MS).toISOString();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      id: apiKey, // Store plaintext for backward compatibility (will be removed in future)
      key_hash: keyHash,
      device_id: deviceId,
      device_name: deviceName || null,
      app_version: appVersion || null,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating API key:", error);
    throw error;
  }

  return data as ApiKey;
}

/**
 * Validate an API key from the database
 * Returns the key record if valid, active, and not expired
 * Looks up by hash for security (doesn't expose plaintext in queries)
 */
export async function validateApiKeyFromDb(
  apiKey: string
): Promise<ApiKey | null> {
  const keyHash = hashApiKey(apiKey);

  // Try looking up by hash first (new method)
  let { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  // Fallback to id lookup for backward compatibility during migration
  if (error && error.code === "PGRST116") {
    const fallback = await supabase
      .from("api_keys")
      .select("*")
      .eq("id", apiKey)
      .eq("is_active", true)
      .single();

    if (!fallback.error) {
      data = fallback.data;
      error = null;
    }
  }

  if (error && error.code !== "PGRST116") {
    console.error("Error validating API key:", error);
    throw error;
  }

  if (!data) {
    return null;
  }

  const keyRecord = data as ApiKey;

  // Check if key has expired
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    console.log(`API key expired: ${apiKey.substring(0, 15)}...`);
    return null;
  }

  return keyRecord;
}

/**
 * Record API key usage (update last_used_at and increment request_count)
 * This is fire-and-forget, errors are logged but not thrown
 */
export async function recordApiKeyUsage(apiKey: string): Promise<void> {
  const { error } = await supabase.rpc("increment_api_key_usage", {
    key_id: apiKey,
  });

  if (error) {
    // Try fallback update if RPC doesn't exist
    const { error: updateError } = await supabase
      .from("api_keys")
      .update({
        last_used_at: new Date().toISOString(),
        request_count: supabase.rpc("increment", { x: 1 }),
      })
      .eq("id", apiKey);

    if (updateError) {
      console.error("Error recording API key usage:", updateError);
    }
  }
}

/**
 * Simple usage tracking - updates last_used_at, increments counter, and auto-renews expiration
 */
export async function trackApiKeyUsage(apiKey: string): Promise<void> {
  try {
    const keyHash = hashApiKey(apiKey);

    // Get current count using hash lookup
    const { data } = await supabase
      .from("api_keys")
      .select("request_count")
      .eq("key_hash", keyHash)
      .single();

    const currentCount = data?.request_count || 0;

    // Calculate new expiration (1 year from now)
    const newExpiry = new Date(Date.now() + KEY_EXPIRY_MS).toISOString();

    // Update with incremented count and renewed expiration (using hash)
    await supabase
      .from("api_keys")
      .update({
        last_used_at: new Date().toISOString(),
        request_count: currentCount + 1,
        expires_at: newExpiry, // Auto-renew on each use
      })
      .eq("key_hash", keyHash);
  } catch (error) {
    // Don't throw - this is fire-and-forget
    console.error("Error tracking API key usage:", error);
  }
}

/**
 * Check if a device is already registered
 */
export async function isDeviceRegistered(deviceId: string): Promise<boolean> {
  const existing = await getApiKeyByDeviceId(deviceId);
  return existing !== null;
}

/**
 * Register a device or return existing API key
 * This is the main function for the /register endpoint
 */
export async function registerDevice(
  deviceId: string,
  deviceName?: string,
  appVersion?: string
): Promise<{ apiKey: ApiKey; isNew: boolean }> {
  // Check if device already registered
  const existing = await getApiKeyByDeviceId(deviceId);

  if (existing) {
    // Update app version if provided
    if (appVersion && appVersion !== existing.app_version) {
      await supabase
        .from("api_keys")
        .update({ app_version: appVersion })
        .eq("id", existing.id);
      existing.app_version = appVersion;
    }
    return { apiKey: existing, isNew: false };
  }

  // Create new API key
  const apiKey = await createApiKey(deviceId, deviceName, appVersion);
  return { apiKey, isNew: true };
}
