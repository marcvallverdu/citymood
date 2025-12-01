import { fal } from "@fal-ai/client";

// Initialize fal.ai client with credentials
fal.config({
  credentials: process.env.FAL_KEY,
});

export { fal };
