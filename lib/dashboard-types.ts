/**
 * Dashboard types for the admin observability dashboard
 */

export interface DashboardStats {
  devices: {
    total: number;
    active: number;
    recentlyUsed: number; // last 7 days
    expired: number;
  };
  jobs: {
    totalImages: number;
    totalVideos: number;
    byStatus: Record<"pending" | "processing" | "completed" | "failed", number>;
    cachedCount: number;
    cacheHitRate: number;
  };
  topDevices: DeviceSummary[];
  topCities: CitySummary[];
  jobsOverTime: TimeSeriesPoint[];
  avgGenerationTime: number; // seconds
}

export interface DeviceSummary {
  keyHash: string; // for drill-down link
  deviceName: string | null;
  deviceId: string; // truncated for privacy
  appVersion: string | null;
  isActive: boolean;
  requestCount: number;
  lastUsedAt: string | null;
  jobCount: number;
  imageCount: number;
  videoCount: number;
}

export interface CitySummary {
  city: string;
  count: number;
}

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  images: number;
  videos: number;
  cached: number;
}

export interface DeviceDetail extends DeviceSummary {
  createdAt: string;
  expiresAt: string;
  jobs: JobSummary[];
}

export interface JobSummary {
  id: string;
  jobType: "image" | "video";
  status: string;
  city: string;
  cached: boolean;
  createdAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
}

export type JobStatus = "pending" | "processing" | "completed" | "failed";
