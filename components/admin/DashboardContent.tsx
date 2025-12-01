"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { DashboardStats } from "@/lib/dashboard-types";
import StatCard from "./StatCard";
import StatusBadge from "./StatusBadge";
import JobsLineChart from "./charts/JobsLineChart";
import StatusPieChart from "./charts/StatusPieChart";
import TopCitiesBarChart from "./charts/TopCitiesBarChart";

const ADMIN_KEY_STORAGE_KEY = "citymood_admin_key";

export default function DashboardContent() {
  const [adminKey, setAdminKey] = useState("");
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load admin key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem(ADMIN_KEY_STORAGE_KEY);
    if (savedKey) {
      setAdminKey(savedKey);
    }
  }, []);

  // Fetch stats when admin key is available
  useEffect(() => {
    if (adminKey) {
      fetchStats();
    }
  }, [adminKey]);

  const handleAdminKeyChange = (value: string) => {
    setAdminKey(value);
    if (value) {
      localStorage.setItem(ADMIN_KEY_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
    }
  };

  const fetchStats = async () => {
    if (!adminKey) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/stats", {
        headers: {
          Authorization: `Bearer ${adminKey}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to fetch stats");
      }

      setStats(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  const formatTimeAgo = (dateStr: string | null): string => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Admin Key Input */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="adminKey"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Admin API Key
          </label>
          {adminKey && (
            <button
              type="button"
              onClick={() => handleAdminKeyChange("")}
              className="text-xs text-red-500 hover:text-red-600 dark:text-red-400"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showAdminKey ? "text" : "password"}
              id="adminKey"
              value={adminKey}
              onChange={(e) => handleAdminKeyChange(e.target.value)}
              placeholder="Enter admin API key"
              className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowAdminKey(!showAdminKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {showAdminKey ? "Hide" : "Show"}
            </button>
          </div>
          <button
            onClick={fetchStats}
            disabled={!adminKey || loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
        {!adminKey && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Admin API key required to view dashboard
          </p>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && !stats && (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      )}

      {/* Dashboard Content */}
      {stats && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Devices"
              value={stats.devices.total}
              subtitle={`${stats.devices.active} active, ${stats.devices.recentlyUsed} recent`}
              icon="📱"
              color="blue"
            />
            <StatCard
              title="API Keys"
              value={stats.devices.active}
              subtitle={`${stats.devices.expired} expired`}
              icon="🔑"
              color="green"
            />
            <StatCard
              title="Images Generated"
              value={stats.jobs.totalImages}
              subtitle={`${stats.jobs.cachedCount} from cache`}
              icon="🖼️"
              color="purple"
            />
            <StatCard
              title="Videos Generated"
              value={stats.jobs.totalVideos}
              subtitle={`Avg: ${formatDuration(stats.avgGenerationTime)}`}
              icon="🎬"
              color="orange"
            />
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Jobs Over Time (30 days)
              </h3>
              <JobsLineChart data={stats.jobsOverTime} />
            </div>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Job Status Distribution
              </h3>
              <StatusPieChart data={stats.jobs.byStatus} />
            </div>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Top Cities
              </h3>
              <TopCitiesBarChart data={stats.topCities} />
            </div>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Performance Metrics
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-400">Cache Hit Rate</span>
                  <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {stats.jobs.cacheHitRate.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-400">Avg Generation Time</span>
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {formatDuration(stats.avgGenerationTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-400">Success Rate</span>
                  <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {(
                      (stats.jobs.byStatus.completed /
                        Math.max(
                          1,
                          stats.jobs.byStatus.completed + stats.jobs.byStatus.failed
                        )) *
                      100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Devices Table */}
          <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Top Devices
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                      Device
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                      Status
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                      Requests
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                      Jobs
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                      Images
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                      Videos
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-400">
                      Last Used
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topDevices.map((device) => (
                    <tr
                      key={device.keyHash}
                      className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link
                          href={`/admin/devices/${device.keyHash}`}
                          className="hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <div className="font-medium text-gray-900 dark:text-white">
                            {device.deviceName || "Unknown Device"}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500">
                            {device.deviceId}
                            {device.appVersion && ` • v${device.appVersion}`}
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={device.isActive ? "active" : "inactive"} />
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                        {device.requestCount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                        {device.jobCount}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                        {device.imageCount}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
                        {device.videoCount}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-500 dark:text-gray-400">
                        {formatTimeAgo(device.lastUsedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.topDevices.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No devices registered yet
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
