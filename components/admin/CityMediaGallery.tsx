"use client";

import { useState, useMemo } from "react";
import type { CityImageEntry } from "@/app/api/admin/gallery/route";

interface CityMediaGalleryProps {
  images: CityImageEntry[];
  adminKey: string;
  onDelete: (id: string) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  none: {
    label: "No Video",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
  pending: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  completed: {
    label: "Video Ready",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
};

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

interface CityGroup {
  city: string;
  displayName: string;
  images: CityImageEntry[];
  hasApng: boolean;
  hasVideo: boolean;
}

export default function CityMediaGallery({ images, adminKey, onDelete }: CityMediaGalleryProps) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set());

  const filteredImages = images.filter((img) => {
    if (filter === "all") return true;
    if (filter === "with-video") return img.animation_status === "completed";
    if (filter === "with-apng") return !!img.apng_url;
    if (filter === "no-video") return img.animation_status !== "completed";
    return true;
  });

  // Group images by city
  const cityGroups = useMemo(() => {
    const groups: Record<string, CityGroup> = {};

    for (const image of filteredImages) {
      const cityKey = image.city.toLowerCase();
      if (!groups[cityKey]) {
        groups[cityKey] = {
          city: cityKey,
          displayName: capitalizeCity(image.city),
          images: [],
          hasApng: false,
          hasVideo: false,
        };
      }
      groups[cityKey].images.push(image);
      if (image.apng_url) groups[cityKey].hasApng = true;
      if (image.animation_status === "completed") groups[cityKey].hasVideo = true;
    }

    // Sort groups by city name
    return Object.values(groups).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [filteredImages]);

  const toggleCity = (city: string) => {
    setExpandedCities((prev) => {
      const next = new Set(prev);
      if (next.has(city)) {
        next.delete(city);
      } else {
        next.add(city);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedCities(new Set(cityGroups.map((g) => g.city)));
  };

  const collapseAll = () => {
    setExpandedCities(new Set());
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this city image and all associated files?")) {
      return;
    }

    setDeleting(id);
    try {
      const response = await fetch("/api/admin/gallery", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify({ id }),
      });

      if (response.ok) {
        onDelete(id);
      } else {
        const data = await response.json();
        alert(`Failed to delete: ${data.error?.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete image");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">
            City Images ({filteredImages.length} in {cityGroups.length} cities)
          </h2>
          <div className="flex gap-2 text-xs">
            <button
              onClick={expandAll}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Expand all
            </button>
            <span className="text-gray-400">|</span>
            <button
              onClick={collapseAll}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Collapse all
            </button>
          </div>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
        >
          <option value="all">All</option>
          <option value="with-video">With Video</option>
          <option value="with-apng">With APNG</option>
          <option value="no-video">No Video</option>
        </select>
      </div>

      {cityGroups.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No city images found</div>
      ) : (
        <div className="space-y-4">
          {cityGroups.map((group) => {
            const isExpanded = expandedCities.has(group.city);

            return (
              <div
                key={group.city}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* City Header */}
                <button
                  onClick={() => toggleCity(group.city)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold">{group.displayName}</span>
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs font-medium">
                      {group.images.length} version{group.images.length !== 1 ? "s" : ""}
                    </span>
                    {group.hasVideo && (
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 rounded text-xs font-medium">
                        Video
                      </span>
                    )}
                    {group.hasApng && (
                      <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400 rounded text-xs font-medium">
                        APNG
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400 text-sm">{isExpanded ? "▼" : "▶"}</span>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {group.images.map((image) => {
                        const status = statusConfig[image.animation_status] || statusConfig.none;
                        const isDeleting = deleting === image.id;

                        return (
                          <div
                            key={image.id}
                            className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
                          >
                            {/* Preview */}
                            <div className="aspect-square relative bg-gray-100 dark:bg-gray-900">
                              {image.video_url && image.animation_status === "completed" ? (
                                <video
                                  src={image.video_url}
                                  className="w-full h-full object-cover"
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={image.image_url}
                                  alt={`${image.city} - ${image.weather_category}`}
                                  className="w-full h-full object-cover"
                                />
                              )}
                              <span
                                className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-medium ${status.className}`}
                              >
                                {status.label}
                              </span>
                            </div>

                            {/* Info */}
                            <div className="p-3">
                              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                                <div className="flex justify-between">
                                  <span>Weather:</span>
                                  <span className="capitalize">{image.weather_category}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Time:</span>
                                  <span className="capitalize">{image.time_of_day}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Created:</span>
                                  <span>{formatDate(image.created_at)}</span>
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="mt-3 flex gap-2 flex-wrap">
                                <a
                                  href={image.image_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 text-center text-xs px-2 py-1.5 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                                >
                                  Image
                                </a>
                                {image.video_url && (
                                  <a
                                    href={image.video_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 text-center text-xs px-2 py-1.5 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                                  >
                                    Video
                                  </a>
                                )}
                                {image.apng_url && (
                                  <a
                                    href={image.apng_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 text-center text-xs px-2 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded hover:bg-purple-200 dark:hover:bg-purple-900/50 transition"
                                  >
                                    APNG
                                  </a>
                                )}
                                <button
                                  onClick={() => handleDelete(image.id)}
                                  disabled={isDeleting}
                                  className="text-xs px-2 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition disabled:opacity-50"
                                >
                                  {isDeleting ? "..." : "Delete"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
