"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CityMediaGallery from "@/components/admin/CityMediaGallery";
import WidgetCacheTable from "@/components/admin/WidgetCacheTable";
import WeatherCacheTable from "@/components/admin/WeatherCacheTable";
import FailedJobsTable from "@/components/admin/FailedJobsTable";
import type { CityImageEntry } from "@/app/api/admin/gallery/route";
import type { WidgetCacheEntry } from "@/app/api/admin/widget-cache/route";
import type { WeatherCacheEntry } from "@/app/api/admin/weather-cache/route";
import type { FailedJobEntry } from "@/app/api/admin/failed-jobs/route";

type Tab = "gallery" | "widget-cache" | "weather-cache" | "failed-jobs";

export default function GalleryPage() {
  const [adminKey, setAdminKey] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("gallery");

  const [images, setImages] = useState<CityImageEntry[]>([]);
  const [widgetCache, setWidgetCache] = useState<WidgetCacheEntry[]>([]);
  const [weatherCache, setWeatherCache] = useState<WeatherCacheEntry[]>([]);
  const [failedJobs, setFailedJobs] = useState<FailedJobEntry[]>([]);

  useEffect(() => {
    const savedKey = localStorage.getItem("citymood_admin_key");
    if (savedKey) {
      setAdminKey(savedKey);
    }
  }, []);

  useEffect(() => {
    if (adminKey) {
      fetchData();
    }
  }, [adminKey]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [galleryRes, widgetRes, weatherRes, failedRes] = await Promise.all([
        fetch("/api/admin/gallery", {
          headers: { Authorization: `Bearer ${adminKey}` },
        }),
        fetch("/api/admin/widget-cache", {
          headers: { Authorization: `Bearer ${adminKey}` },
        }),
        fetch("/api/admin/weather-cache", {
          headers: { Authorization: `Bearer ${adminKey}` },
        }),
        fetch("/api/admin/failed-jobs", {
          headers: { Authorization: `Bearer ${adminKey}` },
        }),
      ]);

      if (!galleryRes.ok || !widgetRes.ok || !weatherRes.ok || !failedRes.ok) {
        const errorData = await galleryRes.json().catch(() => ({}));
        throw new Error(errorData.error?.message || "Failed to fetch data");
      }

      const [galleryData, widgetData, weatherData, failedData] = await Promise.all([
        galleryRes.json(),
        widgetRes.json(),
        weatherRes.json(),
        failedRes.json(),
      ]);

      setImages(galleryData.data?.images || []);
      setWidgetCache(widgetData.data?.entries || []);
      setWeatherCache(weatherData.data?.entries || []);
      setFailedJobs(failedData.data?.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = (e.target as HTMLFormElement).querySelector("input") as HTMLInputElement;
    const key = input.value.trim();
    if (key) {
      localStorage.setItem("citymood_admin_key", key);
      setAdminKey(key);
    }
  };

  const handleImageDelete = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleWidgetCacheDelete = (id: string) => {
    setWidgetCache((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleFailedJobRetry = (id: string) => {
    setFailedJobs((prev) => prev.filter((job) => job.id !== id));
  };

  const handleFailedJobDelete = (id: string) => {
    setFailedJobs((prev) => prev.filter((job) => job.id !== id));
  };

  if (!adminKey) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-md">
          <h1 className="text-xl font-bold mb-4">Admin Gallery</h1>
          <form onSubmit={handleKeySubmit}>
            <input
              type="password"
              placeholder="Enter admin API key"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 mb-4"
            />
            <button
              type="submit"
              className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count: number; highlight?: boolean }[] = [
    { id: "gallery", label: "City Images", count: images.length },
    { id: "widget-cache", label: "Widget Cache", count: widgetCache.length },
    { id: "weather-cache", label: "Weather Cache", count: weatherCache.length },
    { id: "failed-jobs", label: "Failed Jobs", count: failedJobs.length, highlight: failedJobs.length > 0 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
            >
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold">Media Gallery</h1>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-50 text-sm"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {tab.label}
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  tab.highlight
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-gray-100 dark:bg-gray-800"
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : (
          <>
            {activeTab === "gallery" && (
              <CityMediaGallery
                images={images}
                adminKey={adminKey}
                onDelete={handleImageDelete}
              />
            )}
            {activeTab === "widget-cache" && (
              <WidgetCacheTable
                entries={widgetCache}
                adminKey={adminKey}
                onDelete={handleWidgetCacheDelete}
              />
            )}
            {activeTab === "weather-cache" && (
              <WeatherCacheTable entries={weatherCache} />
            )}
            {activeTab === "failed-jobs" && (
              <FailedJobsTable
                jobs={failedJobs}
                adminKey={adminKey}
                onRetry={handleFailedJobRetry}
                onDelete={handleFailedJobDelete}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
