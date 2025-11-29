import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { getOrGenerateAnimation } from "@/lib/gemini";
import { WeatherCategory } from "@/lib/weather-categories";
import { TimeOfDay, AnimationStatus } from "@/lib/supabase";

export interface GenerateAnimationRequest {
  city: string;
  weatherCategory: WeatherCategory;
  timeOfDay: TimeOfDay;
  imageUrl: string;
}

export interface GenerateAnimationResponse {
  animationUrl: string | null;
  animationStatus: AnimationStatus;
}

export interface ErrorResponse {
  error: string;
}

export async function POST(request: NextRequest) {
  // Validate API key
  const authResult = validateApiKey(request);
  if (!authResult.valid) {
    return NextResponse.json<ErrorResponse>(
      { error: authResult.error! },
      { status: 401 }
    );
  }

  // Parse request body
  let body: GenerateAnimationRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorResponse>(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate parameters
  if (!body.city || typeof body.city !== "string") {
    return NextResponse.json<ErrorResponse>(
      { error: "Missing or invalid 'city' parameter" },
      { status: 400 }
    );
  }

  if (!body.weatherCategory || typeof body.weatherCategory !== "string") {
    return NextResponse.json<ErrorResponse>(
      { error: "Missing or invalid 'weatherCategory' parameter" },
      { status: 400 }
    );
  }

  if (!body.timeOfDay || !["day", "night"].includes(body.timeOfDay)) {
    return NextResponse.json<ErrorResponse>(
      { error: "Missing or invalid 'timeOfDay' parameter" },
      { status: 400 }
    );
  }

  if (!body.imageUrl || typeof body.imageUrl !== "string") {
    return NextResponse.json<ErrorResponse>(
      { error: "Missing or invalid 'imageUrl' parameter" },
      { status: 400 }
    );
  }

  try {
    const { animationUrl, animationStatus } = await getOrGenerateAnimation(
      body.city,
      body.weatherCategory,
      body.timeOfDay,
      body.imageUrl
    );

    const response: GenerateAnimationResponse = {
      animationUrl,
      animationStatus,
    };

    return NextResponse.json<GenerateAnimationResponse>(response);
  } catch (error) {
    console.error("Animation generation error:", error);

    const message =
      error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json<ErrorResponse>({ error: message }, { status: 500 });
  }
}
