import { createHash, randomBytes } from "crypto";
import { supabase } from "./supabase";
import { WeatherData } from "./weather";

/**
 * Job status types
 */
export type JobStatus = "pending" | "processing" | "completed" | "failed";

/**
 * Job processing stages
 */
export type JobStage =
  | "fetching_weather"
  | "generating_image"
  | "generating_video"
  | "processing_video";

export type JobType = "image" | "video";

/**
 * Stage metadata for progress reporting
 */
export const STAGE_INFO: Record<JobStage, { step: number; total: number; message: string }> = {
  fetching_weather: { step: 1, total: 4, message: "Fetching weather data..." },
  generating_image: { step: 2, total: 4, message: "Generating city image..." },
  generating_video: { step: 3, total: 4, message: "Generating video animation..." },
  processing_video: { step: 4, total: 4, message: "Processing video (adding loop)..." },
};

/**
 * Job record from database
 */
export interface VideoJob {
  id: string;
  api_key_hash: string;
  status: JobStatus;
  stage: JobStage | null;
  job_type: JobType;
  city: string;
  country: string | null;
  weather_data: WeatherData | null;
  image_url: string | null;
  video_url: string | null;
  error_message: string | null;
  cached: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * Generate a unique job ID
 */
export function generateJobId(): string {
  const bytes = randomBytes(8);
  return `job_${bytes.toString("hex")}`;
}

/**
 * Hash an API key for storage (we don't store raw keys)
 */
export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Create a new job in the database
 */
export async function createJob(
  apiKey: string,
  city: string,
  country?: string,
  jobType: JobType = "video"
): Promise<string> {
  const jobId = generateJobId();
  const apiKeyHash = hashApiKey(apiKey);

  const { error } = await supabase.from("video_jobs").insert({
    id: jobId,
    api_key_hash: apiKeyHash,
    status: "pending",
    job_type: jobType,
    city,
    country: country || null,
  });

  if (error) {
    throw new Error(`Failed to create job: ${error.message}`);
  }

  return jobId;
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<VideoJob | null> {
  const { data, error } = await supabase
    .from("video_jobs")
    .select("*")
    .eq("id", jobId)
    .single<VideoJob>();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows returned
      return null;
    }
    throw new Error(`Failed to get job: ${error.message}`);
  }

  return data;
}

/**
 * Check if an API key has an active job (for rate limiting)
 * Returns the active job ID if one exists
 */
export async function getActiveJobForApiKey(apiKey: string): Promise<string | null> {
  const apiKeyHash = hashApiKey(apiKey);

  const { data, error } = await supabase
    .from("video_jobs")
    .select("id")
    .eq("api_key_hash", apiKeyHash)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single<{ id: string }>();

  if (error) {
    if (error.code === "PGRST116") {
      // No active jobs
      return null;
    }
    throw new Error(`Failed to check active jobs: ${error.message}`);
  }

  return data?.id || null;
}

/**
 * Validate that an API key owns a job
 */
export function validateJobOwnership(job: VideoJob, apiKey: string): boolean {
  const apiKeyHash = hashApiKey(apiKey);
  return job.api_key_hash === apiKeyHash;
}

/**
 * Check if there's an active job for a specific city
 * Returns the active job ID if one exists (prevents duplicate generation)
 */
export async function getActiveJobForCity(
  city: string,
  jobType: JobType = "video"
): Promise<string | null> {
  const normalizedCity = city.toLowerCase().trim();

  const { data, error } = await supabase
    .from("video_jobs")
    .select("id")
    .ilike("city", normalizedCity)
    .eq("job_type", jobType)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single<{ id: string }>();

  if (error) {
    if (error.code === "PGRST116") {
      // No active jobs for this city
      return null;
    }
    console.error("Failed to check active jobs for city:", error.message);
    return null; // Don't block on error, just allow new job
  }

  return data?.id || null;
}

/**
 * Update job status to processing and set initial stage
 */
export async function startJob(jobId: string): Promise<void> {
  const { error } = await supabase
    .from("video_jobs")
    .update({
      status: "processing",
      stage: "fetching_weather",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to start job: ${error.message}`);
  }
}

/**
 * Update job stage
 */
export async function updateJobStage(
  jobId: string,
  stage: JobStage,
  additionalData?: Partial<VideoJob>
): Promise<void> {
  const updateData: Record<string, unknown> = {
    stage,
    updated_at: new Date().toISOString(),
    ...additionalData,
  };

  const { error } = await supabase
    .from("video_jobs")
    .update(updateData)
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to update job stage: ${error.message}`);
  }
}

/**
 * Mark job as completed with result
 */
export async function completeJob(
  jobId: string,
  videoUrl: string,
  weatherData: WeatherData,
  imageUrl: string,
  cached: boolean = false
): Promise<void> {
  const { error } = await supabase
    .from("video_jobs")
    .update({
      status: "completed",
      stage: null,
      video_url: videoUrl,
      weather_data: weatherData,
      image_url: imageUrl,
      cached,
      updated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to complete job: ${error.message}`);
  }
}

/**
 * Mark job as failed with error message
 */
export async function failJob(jobId: string, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from("video_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to fail job: ${error.message}`);
  }
}
