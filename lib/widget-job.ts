import { start } from "workflow/api";
import { createJob } from "./jobs";
import { cityVideoWorkflow } from "@/workflows/city-video-workflow";

/**
 * Trigger async video generation for a city if needed
 * This creates a job and starts the workflow
 * Returns the job ID for tracking
 */
export async function triggerVideoGeneration(
  apiKey: string,
  city: string,
  country?: string
): Promise<string> {
  // Create job in database
  const jobId = await createJob(apiKey, city, country, "video");

  // Start the workflow (durable, will survive restarts)
  try {
    await start(cityVideoWorkflow, [{ jobId, city, country }]);
  } catch (error) {
    console.error(`Failed to start workflow for job ${jobId}:`, error);
    // Job is created but workflow didn't start
    // The job will remain in pending state
  }

  return jobId;
}
