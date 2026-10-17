// Generate an image via the shared `studioService.generateImage` port
// — same Cloudflare SDXL-lightning / SD-v1.5 img2img path the studio
// surfaces use (per the cross-studio first-class image-AI rollout).
// The route writes the PNG to R2 under `uploads/{userId}/ai-images/`,
// which IS the user's media library (listed by `GET /api/upload/images`),
// so the result is automatically available in the MediaPicker's
// Library tab afterwards — no separate "save to library" step.

import { studioService } from "@/lib/services/studio-service";
import type { NormalizedToolRunResult, ToolRunContext } from "../types";
import { asString } from "./shared";

export async function runGenerateImage(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const prompt = asString(ctx.args.prompt);
  if (!prompt) {
    throw new Error("generate_image requires `prompt`.");
  }
  const sourceImageUrl = asString(ctx.args.sourceImageUrl);
  const { data } = await studioService.generateImage(prompt, {
    sourceImageUrl,
  });
  return buildGenerateImageResult({
    imageUrl: data.imageUrl,
    mode: data.mode,
    prompt,
  });
}

/** Build the canonical `NormalizedToolRunResult` for a successful image
 *  generation. Exported so the CHRO Brain's quick-action chip can
 *  synthesize the same tool-run card the model-invoked path produces,
 *  without spending a round-trip + tokens on a chat reply. Both call
 *  sites end up with byte-identical cards (per the DRY rule). */
export function buildGenerateImageResult(args: {
  imageUrl: string;
  mode?: "img2img" | "text2img";
  prompt: string;
}): NormalizedToolRunResult {
  const { imageUrl, mode, prompt } = args;
  return {
    summary: `Generated image${mode === "img2img" ? " (rewrote source)" : ""} and saved to your library.`,
    mediaPreviewUrl: imageUrl,
    extras: [
      { label: "Mode", value: mode ?? "text2img" },
      { label: "Prompt", value: prompt },
    ],
    raw: { kind: "generate_image", imageUrl, mode, prompt },
  };
}
