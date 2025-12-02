import { NextRequest, NextResponse } from "next/server";
import { validateTokenFromQuery } from "@/lib/auth";
import { getWeatherForCity } from "@/lib/weather";
import { getCachedImage } from "@/lib/gemini";
import {
  getCachedWidgetImage,
  generateWeatherHash,
  formatOverlayText,
  generateWidgetApng,
  generateStaticImageWithOverlay,
} from "@/lib/widget-image";
import { generateWeatherPlaceholderPng } from "@/lib/placeholder";
import { triggerVideoGeneration } from "@/lib/widget-job";
import { checkFfmpegAvailable } from "@/lib/ffmpeg";

/**
 * GET /cities/{city}.png?token=xxx
 *
 * Returns an image of the city with weather overlay.
 * Progressive enhancement - always returns binary image data, never redirects:
 * 1. Cached APNG (animated) - best quality, instant
 * 2. Video exists - generate APNG on-the-fly, cache, return
 * 3. Static image exists - return PNG with weather overlay
 * 4. Nothing cached - return placeholder with weather overlay
 *
 * Suitable for iOS widgets (stable URL, always returns image).
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
    const overlayText = formatOverlayText(city, weather);

    // 4. Check for cached APNG first (best quality, instant response)
    const cachedWidget = await getCachedWidgetImage(city, weatherHash);
    if (cachedWidget) {
      try {
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
      } catch (fetchError) {
        console.error("Failed to fetch cached APNG:", fetchError);
        // Continue to fallback options
      }
    }

    // 5. Check for cached city image/video
    const cached = await getCachedImage(city, weather.category, timeOfDay);

    // 6. If we have a video, generate APNG on-the-fly and cache it
    if (cached?.video_url) {
      try {
        const apngUrl = await generateWidgetApng(city, weather, cached.video_url);
        // Fetch and return the newly generated APNG
        const apngResponse = await fetch(apngUrl);
        if (apngResponse.ok) {
          const apngBuffer = await apngResponse.arrayBuffer();
          return new NextResponse(apngBuffer, {
            status: 200,
            headers: {
              "Content-Type": "image/apng",
              "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
              "X-Weather-Hash": weatherHash,
              "X-Cached": "false",
              "X-Image-Type": "apng",
            },
          });
        }
      } catch (apngError) {
        console.error("Failed to generate APNG on-the-fly:", apngError);
        // Fall through to static image
      }
    }

    // 7. If we have a static image, return it with weather overlay
    if (cached?.image_url) {
      // Trigger video/APNG generation in background (deduped - won't create duplicate jobs)
      triggerVideoGeneration(apiKey, city).catch((error) => {
        console.error("Failed to trigger video generation:", error);
      });

      // Check if FFmpeg is available for overlay
      const ffmpegAvailable = await checkFfmpegAvailable();
      if (ffmpegAvailable) {
        try {
          const pngBuffer = await generateStaticImageWithOverlay(cached.image_url, overlayText);
          return new NextResponse(new Uint8Array(pngBuffer), {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=60",
              "X-Weather-Hash": weatherHash,
              "X-Cached": "true",
              "X-Image-Type": "static-overlay",
              "X-Generating": "true",
            },
          });
        } catch (overlayError) {
          console.error("Failed to add overlay to static image:", overlayError);
          // Fall through to fetch image without overlay
        }
      }

      // FFmpeg not available or overlay failed - return the raw image
      try {
        const imageResponse = await fetch(cached.image_url);
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          return new NextResponse(imageBuffer, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=60",
              "X-Weather-Hash": weatherHash,
              "X-Cached": "true",
              "X-Image-Type": "static-raw",
              "X-Generating": "true",
            },
          });
        }
      } catch (fetchError) {
        console.error("Failed to fetch static image:", fetchError);
      }
    }

    // 8. Nothing cached - trigger full generation and return placeholder
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
        "X-Weather-Hash": weatherHash,
        "X-Cached": "false",
        "X-Image-Type": "placeholder",
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
        message: "Failed to generate widget image",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
