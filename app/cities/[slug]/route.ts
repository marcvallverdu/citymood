import { NextRequest, NextResponse } from "next/server";
import { validateTokenFromQuery } from "@/lib/auth";
import { getWeatherForCity } from "@/lib/weather";
import { getCachedImage } from "@/lib/gemini";
import { formatOverlayText } from "@/lib/widget-image";
import { generateWeatherPlaceholderPng } from "@/lib/placeholder";
import { triggerVideoGeneration } from "@/lib/widget-job";

/**
 * GET /cities/{city}?token=xxx
 *
 * Returns city content with weather-appropriate visuals.
 * Progressive enhancement - always returns content, never redirects:
 * 1. Video cached - return MP4 directly (best quality)
 * 2. Image cached - return PNG, trigger video generation
 * 3. Nothing cached - return placeholder PNG, trigger full generation
 *
 * Suitable for iOS widgets and other clients.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // 1. Parse city name from slug (no extension required)
  // Support both "london" and "london.png" for backwards compatibility
  const city = decodeURIComponent(slug.replace(/\.png$/i, "")).trim();

  if (!city) {
    return new NextResponse(
      JSON.stringify({
        error: "Invalid city",
        message: "City name cannot be empty",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 2. Validate token from query parameter
  const token = request.nextUrl.searchParams.get("token");
  const authResult = await validateTokenFromQuery(token);

  if (!authResult.valid) {
    return new NextResponse(
      JSON.stringify({
        error: "Unauthorized",
        message: authResult.error,
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const apiKey = authResult.apiKey!;

  try {
    // 3. Fetch weather data (uses 1-hour cache)
    const weather = await getWeatherForCity(city);
    const timeOfDay = weather.isDay ? "day" : "night";
    const overlayText = formatOverlayText(city, weather);

    // 4. Check for cached city image/video
    const cached = await getCachedImage(city, weather.category, timeOfDay);

    // 5. If we have a video, serve MP4 directly (best quality)
    if (cached?.video_url) {
      try {
        const videoResponse = await fetch(cached.video_url);
        if (videoResponse.ok) {
          const videoBuffer = await videoResponse.arrayBuffer();
          return new NextResponse(videoBuffer, {
            status: 200,
            headers: {
              "Content-Type": "video/mp4",
              "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
              "X-City": city,
              "X-Weather": weather.category,
              "X-Content-Type": "video",
            },
          });
        }
      } catch (videoFetchError) {
        console.error("Failed to fetch video:", videoFetchError);
        // Fall through to static image
      }
    }

    // 6. If we have a static image, serve it and trigger video generation
    if (cached?.image_url) {
      // Trigger video generation in background (deduped - won't create duplicate jobs)
      triggerVideoGeneration(apiKey, city).catch((error) => {
        console.error("Failed to trigger video generation:", error);
      });

      try {
        const imageResponse = await fetch(cached.image_url);
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=60",
              "X-City": city,
              "X-Weather": weather.category,
              "X-Content-Type": "image",
              "X-Generating": "true",
            },
          });
        }
      } catch (imageFetchError) {
        console.error("Failed to fetch static image:", imageFetchError);
        // Fall through to placeholder
      }
    }

    // 7. Nothing cached - trigger full generation and return placeholder
    triggerVideoGeneration(apiKey, city).catch((error) => {
      console.error("Failed to trigger generation:", error);
    });

    // Generate placeholder with weather overlay
    const placeholderBuffer = await generateWeatherPlaceholderPng(overlayText);
    return new NextResponse(new Uint8Array(placeholderBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-City": city,
        "X-Weather": weather.category,
        "X-Content-Type": "placeholder",
        "X-Generating": "true",
      },
    });
  } catch (error) {
    console.error("Widget endpoint error:", error);

    // Check if it's a weather API error (city not found)
    if (error instanceof Error && error.message.includes("No matching location")) {
      return new NextResponse(
        JSON.stringify({
          error: "City not found",
          message: `Could not find weather data for "${city}"`,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new NextResponse(
      JSON.stringify({
        error: "Internal error",
        message: "Failed to generate widget content",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
