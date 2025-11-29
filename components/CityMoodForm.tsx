"use client";

import { useState, useEffect } from "react";
import type { CityMoodResponse, ErrorResponse } from "@/app/api/city-mood/route";
import type { CachedCity } from "@/app/api/cached-cities/route";
import type { AnimationStatus } from "@/lib/supabase";

export default function CityMoodForm() {
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CityMoodResponse | null>(null);
  const [cachedCities, setCachedCities] = useState<CachedCity[]>([]);
  const [showAnimation, setShowAnimation] = useState(true);
  const [generatingAnimation, setGeneratingAnimation] = useState(false);

  useEffect(() => {
    fetchCachedCities();
  }, []);

  const fetchCachedCities = async () => {
    try {
      const response = await fetch("/api/cached-cities");
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
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_SECRET_KEY}`,
        },
        body: JSON.stringify({ city }),
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

  const handleCachedClick = (cached: CachedCity) => {
    setResult({
      city: cached.city,
      normalizedCity: cached.city,
      weather: {
        category: cached.weather_category,
        description: cached.weather_category,
        temperature: 0,
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
      animationStatus: cached.animation_status || "none",
    });
    setError(null);
  };

  const handleGenerateAnimation = async () => {
    if (!result) return;

    setGeneratingAnimation(true);
    try {
      const response = await fetch("/api/generate-animation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_SECRET_KEY}`,
        },
        body: JSON.stringify({
          city: result.city,
          weatherCategory: result.weather.category,
          timeOfDay: result.weather.timeOfDay,
          imageUrl: result.imageUrl,
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

  const displayUrl = result
    ? showAnimation && result.animationUrl && result.animationStatus === "completed"
      ? result.animationUrl
      : result.imageUrl
    : null;

  return (
    <div className="w-full max-w-2xl mx-auto">
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
            placeholder="e.g., Barcelona, Tokyo, New York"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !city.trim()}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors duration-200"
        >
          {loading ? "Generating..." : "Get City Mood"}
        </button>
      </form>

      {cachedCities.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Cached Cities
          </h3>
          <div className="flex flex-wrap gap-2">
            {cachedCities.map((cached, index) => (
              <button
                key={index}
                onClick={() => handleCachedClick(cached)}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full capitalize transition-colors flex items-center gap-1"
              >
                {getTimeIcon(cached.time_of_day)} {cached.city} ({cached.weather_category})
                {cached.animation_status === "completed" && " 🎬"}
              </button>
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
            <img
              src={displayUrl || result.imageUrl}
              alt={`${result.city} in ${result.weather.category} weather (${result.weather.timeOfDay})`}
              className="w-full h-full object-cover"
            />

            {/* Weather overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
              <h3 className="text-xl font-bold text-white capitalize mb-2">
                {result.city}
              </h3>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full flex items-center gap-1">
                  {getWeatherIcon(result.weather.category)} {result.weather.category}
                </span>
                <span className="px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full flex items-center gap-1">
                  {getTimeIcon(result.weather.timeOfDay)} {result.weather.timeOfDay}
                </span>
                {result.weather.description && result.weather.description !== result.weather.category && (
                  <span className="px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full">
                    {result.weather.description}
                  </span>
                )}
                {result.weather.temperature !== 0 && (
                  <span className="px-2 py-1 bg-white/20 backdrop-blur-sm text-white text-sm font-medium rounded-full flex items-center gap-1">
                    🌡️ {result.weather.temperature}°C
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
            {result.animationUrl && result.animationStatus === "completed" && (
              <div className="absolute top-3 left-3">
                <button
                  onClick={() => setShowAnimation(!showAnimation)}
                  className="px-3 py-1.5 bg-black/50 backdrop-blur-sm text-white text-sm font-medium rounded-full hover:bg-black/70 transition-colors"
                >
                  {showAnimation ? "📷 Static" : "🎬 Animated"}
                </button>
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
