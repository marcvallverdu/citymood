"use client";

import { useState } from "react";
import type { FailedJobEntry } from "@/app/api/admin/failed-jobs/route";

interface FailedJobsTableProps {
  jobs: FailedJobEntry[];
  adminKey: string;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function capitalizeCity(city: string): string {
  return city
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatStage(stage: string | null): string {
  if (!stage) return "Unknown";
  return stage
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function FailedJobsTable({ jobs, adminKey, onRetry, onDelete }: FailedJobsTableProps) {
  const [retrying, setRetrying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleRetry = async (jobId: string) => {
    if (!confirm("Are you sure you want to retry this job?")) {
      return;
    }

    setRetrying(jobId);
    try {
      const response = await fetch("/api/admin/failed-jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify({ jobId }),
      });

      if (response.ok) {
        onRetry(jobId);
      } else {
        const data = await response.json();
        alert(`Failed to retry: ${data.error?.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Retry error:", error);
      alert("Failed to retry job");
    } finally {
      setRetrying(null);
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm("Are you sure you want to delete this failed job?")) {
      return;
    }

    setDeleting(jobId);
    try {
      const response = await fetch("/api/admin/failed-jobs", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify({ jobId }),
      });

      if (response.ok) {
        onDelete(jobId);
      } else {
        const data = await response.json();
        alert(`Failed to delete: ${data.error?.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete job");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Failed Jobs ({jobs.length})</h2>

      {jobs.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          No failed jobs
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  City
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Failed At
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Stage
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Error
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {jobs.map((job) => {
                const isRetrying = retrying === job.id;
                const isDeleting = deleting === job.id;

                return (
                  <tr key={job.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                      {capitalizeCity(job.city)}
                      {job.country && (
                        <span className="text-gray-500 dark:text-gray-400 ml-1">
                          ({job.country})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        {job.job_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(job.updated_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatStage(job.stage)}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 max-w-xs truncate" title={job.error_message || ""}>
                      {job.error_message || "Unknown error"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => handleRetry(job.id)}
                        disabled={isRetrying || isDeleting}
                        className="text-green-600 dark:text-green-400 hover:underline disabled:opacity-50 mr-3"
                      >
                        {isRetrying ? "Retrying..." : "Retry"}
                      </button>
                      <button
                        onClick={() => handleDelete(job.id)}
                        disabled={isRetrying || isDeleting}
                        className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      >
                        {isDeleting ? "..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
