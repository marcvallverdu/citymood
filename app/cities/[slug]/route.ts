import { NextRequest, NextResponse } from "next/server";
import { validateTokenFromQuery } from "@/lib/auth";
import { getWeatherForCity } from "@/lib/weather";
import { getCachedImage } from "@/lib/gemini";
import {
  getCachedWidgetImage,
  generateWeatherHash,
  formatOverlayText,
} from "@/lib/widget-image";
import { triggerVideoGeneration } from "@/lib/widget-job";

/**
 * GET /cities/{city}.png?token=xxx
 *
 * Returns an image of the city with weather overlay.
 * Progressive enhancement (no FFmpeg during request):
 * 1. Cached APNG (animated) - best quality, instant
 * 2. Redirect to static image - fallback when APNG not ready
 * 3. 202 JSON response - when nothing cached, triggers generation
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
    const weatherHash = generateWeatherHash(weather);

    // 4. Check for cached APNG first (best quality, instant response)
    const cachedWidget = await getCachedWidgetImage(city, weatherHash);
    if (cachedWidget) {
      const apngResponse = await fetch(cachedWidget.apng_url);
      if (apngResponse.ok) {
        const apngBuffer = await apngResponse.arrayBuffer();
        return new NextResponse(apngBuffer, {
          status: 200,
          headers: {
            "Content-Type": "image/apng",
            "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
            "X-Weather-Hash": weatherHash,
            "X-Cached": "true",
            "X-Image-Type": "apng",
          },
        });
      }
    }

    // 5. Check for cached city image/video
    const cached = await getCachedImage(city, weather.category, timeOfDay);
    const imageUrl = cached?.image_url || null;

    // 6. If we have a static image, redirect to it (no FFmpeg needed)
    // Video generation will create the APNG in the background
    if (imageUrl) {
      // Trigger video/APNG generation in background
      triggerVideoGeneration(apiKey, city).catch((error) => {
        console.error("Failed to trigger video generation:", error);
      });

      // Redirect to the static image
      return NextResponse.redirect(imageUrl, {
        status: 302,
        headers: {
          "Cache-Control": "public, max-age=60",
          "X-Image-Type": "static-redirect",
          "X-Generating": "true",
        },
      });
    }

    // 7. Nothing cached - trigger full generation
    try {
      await triggerVideoGeneration(apiKey, city);
    } catch (error) {
      console.error("Failed to trigger generation:", error);
    }

    // Return JSON with overlay info (no FFmpeg placeholder)
    return new NextResponse(
      JSON.stringify({
        status: "generating",
        city: city,
        message: "Image is being generated. Please retry in 2 minutes.",
        overlay: formatOverlayText(city, weather),
      }),
      {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "120",
          "X-Status": "generating",
          "X-City": city,
        },
      }
    );
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
