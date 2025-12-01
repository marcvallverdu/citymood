"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { DeviceDetail as DeviceDetailType } from "@/lib/dashboard-types";
import StatusBadge from "./StatusBadge";

const ADMIN_KEY_STORAGE_KEY = "citymood_admin_key";

interface DeviceDetailProps {
  keyHash: string;
}

export default function DeviceDetail({ keyHash }: DeviceDetailProps) {
  const [adminKey, setAdminKey] = useState("");
  const [device, setDevice] = useState<DeviceDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "video">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "failed" | "pending" | "processing">("all");

  // Load admin key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem(ADMIN_KEY_STORAGE_KEY);
    if (savedKey) {
      setAdminKey(savedKey);
    }
  }, []);

  // Fetch device when admin key is available
  useEffect(() => {
    if (adminKey && keyHash) {
      fetchDevice();
    }
  }, [adminKey, keyHash]);

  const fetchDevice = async () => {
    if (!adminKey) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/devices/${keyHash}`, {
        headers: {
          Authorization: `Bearer ${adminKey}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to fetch device");
      }

      setDevice(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setDevice(null);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number | null): string => {
    if (seconds === null) return "-";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const filteredJobs = device?.jobs.filter((job) => {
    if (filter !== "all" && job.jobType !== filter) return false;
    if (statusFilter !== "all" && job.status !== statusFilter) return false;
    return true;
  }) || [];

  if (!adminKey) {
    return (
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-amber-600 dark:text-amber-400">
          Please enter your admin API key on the{" "}
          <Link href="/admin" className="underline hover:text-amber-700 dark:hover:text-amber-300">
            dashboard
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin"
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin"
          className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400">Device not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/admin"
        className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline"
      >
        ← Back to Dashboard
      </Link>

      {/* Device Info Card */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {device.deviceName || "Unknown Device"}
            </h1>
            <p className="mt-1 text-gray-500 dark:text-gray-400 font-mono text-sm">
              {device.deviceId}
            </p>
          </div>
          <StatusBadge status={device.isActive ? "active" : "inactive"} />
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">App Version</span>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {device.appVersion || "Unknown"}
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Total Requests</span>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {device.requestCount.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Jobs</span>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {device.jobCount} ({device.imageCount} images, {device.videoCount} videos)
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Last Used</span>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {device.lastUsedAt ? formatDate(device.lastUsedAt) : "Never"}
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Registered</span>
            <p className="text-gray-900 dark:text-white">{formatDate(device.createdAt)}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">Expires</span>
            <p className="text-gray-900 dark:text-white">{formatDate(device.expiresAt)}</p>
          </div>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Job History ({filteredJobs.length})
          </h2>
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-900 dark:text-white"
            >
              <option value="all">All Types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-900 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                  Job ID
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                  Type
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                  City
                </th>
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                  Status
                </th>
                <th className="text-center py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                  Cached
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                  Duration
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-gray-100 dark:border-gray-700/50"
                >
                  <td className="py-3 px-4 font-mono text-xs text-gray-600 dark:text-gray-400">
                    {job.id}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        job.jobType === "video"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                      }`}
                    >
                      {job.jobType === "video" ? "Video" : "Image"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white capitalize">
                    {job.city}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={job.status as "pending" | "processing" | "completed" | "failed"} />
                  </td>
                  <td className="py-3 px-4 text-center">
                    {job.cached ? (
                      <span className="text-green-600 dark:text-green-400">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                    {formatDuration(job.durationSeconds)}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500 dark:text-gray-400 text-xs">
                    {formatDate(job.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredJobs.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No jobs found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
