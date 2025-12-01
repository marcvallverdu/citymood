"use client";

import { useState, useEffect } from "react";
import type { CityMoodResponse, ErrorResponse } from "@/app/api/city-mood/route";
import type { CachedCity } from "@/app/api/cached-cities/route";
import type { AnimationStatus } from "@/lib/supabase";
import { IMAGE_MODELS, VIDEO_MODELS, type ImageModel, type VideoModel } from "@/lib/models";

const API_KEY_STORAGE_KEY = "citymood_api_key";

export default function CityMoodForm() {
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CityMoodResponse | null>(null);
  const [cachedCities, setCachedCities] = useState<CachedCity[]>([]);
  const [showAnimation, setShowAnimation] = useState(true);
  const [animationFormat, setAnimationFormat] = useState<"apng" | "mp4">("apng");
  const [generatingAnimation, setGeneratingAnimation] = useState(false);
  const [imageModel, setImageModel] = useState<ImageModel>("nano-banana");
  const [videoModel, setVideoModel] = useState<VideoModel>("seedance");

  // API key state
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveApiKey, setSaveApiKey] = useState(true);

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  // Save/remove API key from localStorage when saveApiKey changes
  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    if (saveApiKey && value) {
      localStorage.setItem(API_KEY_STORAGE_KEY, value);
    }
  };

  const handleSaveToggle = (checked: boolean) => {
    setSaveApiKey(checked);
    if (checked && apiKey) {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  };

  const clearApiKey = () => {
    setApiKey("");
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  };

  // Fetch cached cities when API key is available
  useEffect(() => {
    if (apiKey) {
      fetchCachedCities();
    }
  }, [apiKey]);

  const fetchCachedCities = async () => {
    if (!apiKey) return;
    try {
      const response = await fetch("/api/cached-cities", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setCachedCities(data);
      }
    } catch {
      // Ignore errors fetching cached cities
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const response = await fetch("/api/city-mood", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ city, imageModel }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error((data as ErrorResponse).error || "Request failed");
      }

      setResult(data as CityMoodResponse);
      // Refresh cached cities list
      fetchCachedCities();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCachedClick = async (cached: CachedCity) => {
    // Set initial result with cached image
    setResult({
      city: cached.city,
      normalizedCity: cached.city,
      weather: {
        category: cached.weather_category,
        description: cached.weather_category,
        temperature: 0, // Will be updated with fresh weather
        temperatureF: 0,
        humidity: 0,
        windKph: 0,
        isDay: cached.time_of_day === "day",
        timeOfDay: cached.time_of_day,
        cached: true,
      },
      imageUrl: cached.image_url,
      imageCached: true,
      animationUrl: cached.animation_url,
      videoUrl: cached.video_url,
      animationStatus: cached.animation_status || "none",
    });
    setError(null);

    // Fetch fresh weather data for display
    try {
      const response = await fetch("/api/city-mood", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ city: cached.city }),
      });

      if (response.ok) {
        const data = await response.json() as CityMoodResponse;
        // Update just the weather data, keep the cached image
        setResult(prev => prev ? {
          ...prev,
          weather: data.weather,
        } : null);
      }
    } catch {
      // Ignore errors - we still have the cached image
    }
  };

  const handleDeleteCached = async (cached: CachedCity, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the parent button click

    try {
      const response = await fetch("/api/cached-cities", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          city: cached.city,
          weather_category: cached.weather_category,
          time_of_day: cached.time_of_day,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete");
      }

      // Refresh the cached cities list
      fetchCachedCities();

      // Clear result if it was showing this cached city
      if (result?.normalizedCity === cached.city &&
          result?.weather.category === cached.weather_category &&
          result?.weather.timeOfDay === cached.time_of_day) {
        setResult(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete cached city");
    }
  };

  const handleGenerateAnimation = async () => {
    if (!result) return;

    setGeneratingAnimation(true);
    try {
      const response = await fetch("/api/generate-animation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          city: result.city,
          weatherCategory: result.weather.category,
          timeOfDay: result.weather.timeOfDay,
          imageUrl: result.imageUrl,
          videoModel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Animation generation failed");
      }

      // Update result with animation data
      setResult({
        ...result,
        animationUrl: data.animationUrl,
        videoUrl: data.videoUrl,
        animationStatus: data.animationStatus,
      });

      // Refresh cached cities
      fetchCachedCities();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Animation generation failed");
    } finally {
      setGeneratingAnimation(false);
    }
  };

  const getTimeIcon = (timeOfDay: string) => {
    return timeOfDay === "day" ? "☀️" : "🌙";
  };

  const getWeatherIcon = (category: string) => {
    const icons: Record<string, string> = {
      sunny: "☀️",
      cloudy: "☁️",
      foggy: "🌫️",
      drizzle: "🌧️",
      rainy: "🌧️",
      snowy: "❄️",
      sleet: "🌨️",
      stormy: "⛈️",
    };
    return icons[category] || "🌤️";
  };

  const getAnimationStatusBadge = (status: AnimationStatus) => {
    const badges: Record<AnimationStatus, { text: string; color: string }> = {
      none: { text: "No Animation", color: "bg-gray-500" },
      pending: { text: "Pending", color: "bg-yellow-500" },
      processing: { text: "Processing...", color: "bg-blue-500" },
      completed: { text: "Animated", color: "bg-green-500" },
      failed: { text: "Failed", color: "bg-red-500" },
    };
    return badges[status] || badges.none;
  };

  const hasAnimation = result?.animationStatus === "completed" && (result?.animationUrl || result?.videoUrl);
  const displayUrl = result
    ? showAnimation && hasAnimation
      ? animationFormat === "mp4" && result.videoUrl
        ? result.videoUrl
        : result.animationUrl || result.imageUrl
      : result.imageUrl
    : null;
  const isVideoDisplay = showAnimation && hasAnimation && animationFormat === "mp4" && result?.videoUrl;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* API Key Section */}
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="apiKey"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            API Key
          </label>
          {apiKey && (
            <button
              type="button"
              onClick={clearApiKey}
              className="text-xs text-red-500 hover:text-red-600 dark:text-red-400"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showApiKey ? "text" : "password"}
              id="apiKey"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="Enter your API key"
              className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              title={showApiKey ? "Hide API key" : "Show API key"}
            >
              {showApiKey ? "🙈" : "👁️"}
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="saveApiKey"
            checked={saveApiKey}
            onChange={(e) => handleSaveToggle(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          <label htmlFor="saveApiKey" className="text-xs text-gray-500 dark:text-gray-400">
            Save to browser (localStorage)
          </label>
        </div>
        {!apiKey && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            ⚠️ API key required to use the app
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="city"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            City Name
          </label>
          <input
            type="text"
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g., Barcelona, Spain or Tokyo, Japan"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="imageModel"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Image Model
            </label>
            <select
              id="imageModel"
              value={imageModel}
              onChange={(e) => setImageModel(e.target.value as ImageModel)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
            >
              {Object.entries(IMAGE_MODELS).map(([key, model]) => (
                <option key={key} value={key}>
                  {model.name} ({model.cost})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="videoModel"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Video Model
            </label>
            <select
              id="videoModel"
              value={videoModel}
              onChange={(e) => setVideoModel(e.target.value as VideoModel)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
            >
              {Object.entries(VIDEO_MODELS).map(([key, model]) => (
                <option key={key} value={key}>
                  {model.name} ({model.cost})
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !city.trim() || !apiKey}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors duration-200"
        >
          {loading ? "Generating..." : !apiKey ? "Enter API Key" : "Get City Mood"}
        </button>
      </form>

      {cachedCities.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Cached Cities
          </h3>
          <div className="flex flex-wrap gap-2">
            {cachedCities.map((cached, index) => (
              <div key={index} className="flex items-center gap-0.5">
                <button
                  onClick={() => handleCachedClick(cached)}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-l-full capitalize transition-colors flex items-center gap-1"
                >
                  {getTimeIcon(cached.time_of_day)} {cached.city} ({cached.weather_category})
                  {cached.animation_status === "completed" && " 🎬"}
                </button>
                <button
                  onClick={(e) => handleDeleteCached(cached, e)}
                  className="px-2 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded-r-full transition-colors"
                  title="Delete cached image"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6">
          <div className="relative aspect-square w-full overflow-hidden rounded-xl shadow-lg">
            {isVideoDisplay ? (
              <video
                src={displayUrl || result.imageUrl}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={displayUrl || result.imageUrl}
                alt={`${result.city} in ${result.weather.category} weather (${result.weather.timeOfDay})`}
                className="w-full h-full object-cover"
              />
            )}

            {/* Weather overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
              <h3 className="text-xl font-bold text-white capitalize mb-2">
                {result.city}
              </h3>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full flex items-center gap-1 capitalize">
                  {getWeatherIcon(result.weather.category)} {result.weather.category}
                </span>
                <span className="px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full flex items-center gap-1 capitalize">
                  {getTimeIcon(result.weather.timeOfDay)} {result.weather.timeOfDay}
                </span>
                {result.weather.description && result.weather.description !== result.weather.category && (
                  <span className="px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full">
                    {result.weather.description}
                  </span>
                )}
                {(result.weather.temperature !== 0 || !result.weather.cached) && (
                  <span className="px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full flex items-center gap-1">
                    🌡️ {Math.round(result.weather.temperature)}°C
                  </span>
                )}
              </div>
            </div>

            {/* Badges at top right */}
            <div className="absolute top-3 right-3 flex flex-col gap-2">
              {result.imageCached && (
                <span className="px-2 py-1 bg-green-500 text-white text-xs font-medium rounded">
                  Cached
                </span>
              )}
              {result.animationStatus && result.animationStatus !== "none" && (
                <span className={`px-2 py-1 ${getAnimationStatusBadge(result.animationStatus).color} text-white text-xs font-medium rounded`}>
                  {getAnimationStatusBadge(result.animationStatus).text}
                </span>
              )}
            </div>

            {/* Animation toggle at top left */}
            {hasAnimation && (
              <div className="absolute top-3 left-3 flex gap-2">
                <button
                  onClick={() => setShowAnimation(!showAnimation)}
                  className="px-3 py-1.5 bg-black/50 backdrop-blur-sm text-white text-sm font-medium rounded-full hover:bg-black/70 transition-colors"
                >
                  {showAnimation ? "📷 Static" : "🎬 Animated"}
                </button>
                {showAnimation && result.videoUrl && result.animationUrl && (
                  <button
                    onClick={() => setAnimationFormat(animationFormat === "apng" ? "mp4" : "apng")}
                    className="px-3 py-1.5 bg-black/50 backdrop-blur-sm text-white text-sm font-medium rounded-full hover:bg-black/70 transition-colors"
                  >
                    {animationFormat === "apng" ? "🎞️ MP4" : "🖼️ APNG"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Generate Animation button */}
          {result.animationStatus === "none" && (
            <button
              onClick={handleGenerateAnimation}
              disabled={generatingAnimation}
              className="mt-4 w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors duration-200"
            >
              {generatingAnimation ? "Generating Animation..." : "🎬 Generate Animation"}
            </button>
          )}

          {result.animationStatus === "failed" && (
            <button
              onClick={handleGenerateAnimation}
              disabled={generatingAnimation}
              className="mt-4 w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors duration-200"
            >
              {generatingAnimation ? "Retrying..." : "🔄 Retry Animation"}
            </button>
          )}

          {generatingAnimation && (
            <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                <div>
                  <p className="text-purple-600 dark:text-purple-400 font-medium">
                    Generating animation...
                  </p>
                  <p className="text-sm text-purple-500 dark:text-purple-500">
                    This may take up to 2-3 minutes
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="mt-6 flex flex-col items-center justify-center p-8">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Fetching weather and generating image...
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            This may take up to 30 seconds for new images
          </p>
        </div>
      )}
    </div>
  );
}
