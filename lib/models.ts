// Model definitions for testing different fal.ai models

export type ImageModel = "nano-banana" | "seedream" | "imagen4";
export type VideoModel = "seedance";

export const IMAGE_MODELS: Record<ImageModel, { id: string; name: string; cost: string }> = {
  "nano-banana": {
    id: "fal-ai/nano-banana-pro",
    name: "Nano Banana Pro",
    cost: "$0.15",
  },
  seedream: {
    id: "fal-ai/seedream-4.0",
    name: "Seedream 4.0",
    cost: "$0.03",
  },
  imagen4: {
    id: "fal-ai/imagen4/ultra/preview",
    name: "Imagen 4 Ultra",
    cost: "$0.10",
  },
};

export const VIDEO_MODELS: Record<VideoModel, { id: string; name: string; cost: string }> = {
  seedance: {
    id: "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video",
    name: "Seedance Pro Fast",
    cost: "$0.24",
  },
};
