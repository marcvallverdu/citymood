import {
  completeJob as dbCompleteJob,
  failJob as dbFailJob,
  startJob as dbStartJob,
  updateJobStage,
  JobStage,
} from "@/lib/jobs";
import { WeatherData } from "@/lib/weather";

export async function startJobStep(jobId: string): Promise<void> {
  "use step";
  await dbStartJob(jobId);
}

export async function updateJobStageStep(
  jobId: string,
  stage: JobStage,
  additionalData?: Record<string, unknown>
): Promise<void> {
  "use step";
  await updateJobStage(jobId, stage, additionalData);
}

export async function completeImageJobStep(
  jobId: string,
  imageUrl: string,
  weatherData: WeatherData,
  cached: boolean = false
): Promise<void> {
  "use step";

  // For image-only jobs, we complete with the image URL in the video_url field
  // This maintains backwards compatibility with the existing job status endpoint
  await dbCompleteJob(jobId, imageUrl, weatherData, imageUrl, cached);
}

export async function completeVideoJobStep(
  jobId: string,
  videoUrl: string,
  weatherData: WeatherData,
  imageUrl: string,
  cached: boolean = false
): Promise<void> {
  "use step";
  await dbCompleteJob(jobId, videoUrl, weatherData, imageUrl, cached);
}

export async function failJobStep(
  jobId: string,
  errorMessage: string
): Promise<void> {
  "use step";
  await dbFailJob(jobId, errorMessage);
}
