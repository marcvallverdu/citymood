import { NextRequest, NextResponse } from "next/server";
import { validateTokenFromQuery } from "@/lib/auth";
import { getWeatherForCity } from "@/lib/weather";
import { getCachedImage } from "@/lib/gemini";
import {
  getOrGenerateWidgetImage,
  generateWeatherHash,
  formatOverlayText,
} from "@/lib/widget-image";
import { triggerVideoGeneration } from "@/lib/widget-job";
import { generateWeatherPlaceholderPng } from "@/lib/placeholder";

/**
 * GET /cities/{city}.png?token=xxx
 *
 * Returns an image of the city with weather overlay.
 * Progressive enhancement:
 * 1. APNG (animated) - when video is available
 * 2. Static PNG with overlay - when static image exists but no video
 * 3. Placeholder with weather info - when generating
 *
 * Suitable for iOS widgets.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // 1. Parse city name from slug (e.g., "london.png" -> "london")
  const match = slug.match(/^(.+)\.png$/i);
  if (!match) {
    return new NextResponse(
      JSON.stringify({
        error: "Invalid format",
        message: "Use: /cities/{city}.png?token=xxx",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const city = decodeURIComponent(match[1]).trim();
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

    // 4. Check for cached image/video
    const cached = await getCachedImage(city, weather.category, timeOfDay);
    const videoUrl = cached?.video_url || null;
    const imageUrl = cached?.image_url || null;

    // 5. Get or generate widget image (progressive enhancement)
    const result = await getOrGenerateWidgetImage(city, weather, videoUrl, imageUrl);

    // 6. Return APNG if available (best quality - animated)
    if (result.type === "apng" && result.url) {
      const apngResponse = await fetch(result.url);
      if (apngResponse.ok) {
        const apngBuffer = await apngResponse.arrayBuffer();

        return new NextResponse(apngBuffer, {
          status: 200,
          headers: {
            "Content-Type": "image/apng",
            "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
            "X-Weather-Hash": generateWeatherHash(weather),
            "X-Cached": result.cached ? "true" : "false",
            "X-Image-Type": "apng",
          },
        });
      }
    }

    // 7. Return static image with overlay (good quality - static)
    if (result.type === "static" && result.buffer) {
      // Trigger video generation in the background if needed
      if (result.needsVideoGeneration) {
        triggerVideoGeneration(apiKey, city).catch((error) => {
          console.error("Failed to trigger video generation:", error);
        });
      }

      return new NextResponse(new Uint8Array(result.buffer), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
          "X-Weather-Hash": generateWeatherHash(weather),
          "X-Image-Type": "static",
          "X-Video-Generating": result.needsVideoGeneration ? "true" : "false",
        },
      });
    }

    // 8. Return placeholder with weather info (generating state)
    if (result.needsGeneration) {
      // Trigger full generation (image + video)
      try {
        await triggerVideoGeneration(apiKey, city);
      } catch (error) {
        console.error("Failed to trigger generation:", error);
      }

      // Return placeholder with weather overlay
      const placeholder = await generateWeatherPlaceholderPng(overlayText);
      return new NextResponse(new Uint8Array(placeholder), {
        status: 202,
        headers: {
          "Content-Type": "image/png",
          "Retry-After": "120",
          "X-Status": "generating",
          "X-City": city,
          "X-Image-Type": "placeholder",
        },
      });
    }

    // 9. Something went wrong - return placeholder with weather info
    const placeholder = await generateWeatherPlaceholderPng(overlayText);
    return new NextResponse(new Uint8Array(placeholder), {
      status: 503,
      headers: {
        "Content-Type": "image/png",
        "Retry-After": "60",
        "X-Status": "error",
        "X-Image-Type": "placeholder",
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
        message: "Failed to generate widget image",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
