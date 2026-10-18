// AI generation endpoints (storyboard, comic, page→video, images) — part of
// the `studioService` facade in studio-service.ts.
import { z } from "zod";
import { apiClient } from "../../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import type { VideoScript } from "../../../types/video-script";
import { VideoScriptSchema } from "./script-schemas";
import type { GenerateStoryboardParams } from "./video-schemas";

export const studioGenerationApi = {
  /**
   * Generate an AI VideoScript from resume text.
   * The API first attempts a real LLM call (OpenRouter); falls back to a mock
   * storyboard if the key is missing or the call fails.
   */
  async generateStoryboard(
    paramsOrText: GenerateStoryboardParams | string,
    resumeId?: string,
  ): Promise<ApiSuccessResponse<VideoScript>> {
    const body: GenerateStoryboardParams =
      typeof paramsOrText === "string"
        ? { resumeText: paramsOrText, ...(resumeId ? { resumeId } : {}) }
        : paramsOrText;
    return apiClient.post("/api/studio/storyboard", body, VideoScriptSchema) as Promise<ApiSuccessResponse<VideoScript>>;
  },

  /**
   * Generate a 6-page pitch comic from the user's intake fields.
   * Single source of truth for the comic AI scaffolder; mounted by the
   * comic template intake form's Generate button and by any external
   * "Re-roll the comic" affordance that ships later. Returns the
   * server's `GenerateComicResponse` envelope so the caller can show
   * which artefact the scaffolder used ("Used your resume", "Used your
   * profile", …).
   */
  async generateComic(params: {
    prompt: string;
    genreId?: string;
    protagonistName?: string;
    sourceKind?: "resume" | "profile" | "services" | "auto";
    resumeId?: string;
  }): Promise<ApiSuccessResponse<import("@shared/comic-spec").GenerateComicResponse>> {
    return apiClient.post(
      "/api/studio/generate-comic",
      params,
    ) as Promise<ApiSuccessResponse<import("@shared/comic-spec").GenerateComicResponse>>;
  },

  /**
   * SuperAdmin page → video scaffolder (#1860). Posts a harvested page
   * (DOM text + images + CTAs + the route's PAGE_SEO copy) and gets back
   * a `PageVideoSpec` the editor hydrates into a CanvasState. Gated to
   * SuperAdmin server-side; the calling tool is hidden from non-SA users.
   */
  async generatePageVideo(
    page: import("@shared/page-video-spec").HarvestedPage,
  ): Promise<ApiSuccessResponse<import("@shared/page-video-spec").GeneratePageVideoResponse>> {
    return apiClient.post("/api/studio/generate-from-page", { page }) as Promise<
      ApiSuccessResponse<import("@shared/page-video-spec").GeneratePageVideoResponse>
    >;
  },

  /**
   * Generate an AI image via Cloudflare Workers AI. Two modes:
   *   • text→image (default) — pass just the prompt
   *   • image→image — pass `sourceImageUrl` to rewrite an existing image
   *     under the prompt. Powers "update this element" across studios.
   * `strength` (0..1) is denoise strength for img2img only; ignored in
   * text→image mode. Defaults to 0.8 server-side.
   */
  async generateImage(
    prompt: string,
    opts?: {
      sourceImageUrl?: string;
      sourceImageDataUrl?: string;
      strength?: number;
    },
  ): Promise<ApiSuccessResponse<{ imageUrl: string; mode?: "img2img" | "text2img" }>> {
    return apiClient.post(
      "/api/studio/images",
      {
        mode: "generate",
        prompt,
        ...(opts?.sourceImageUrl ? { sourceImageUrl: opts.sourceImageUrl } : {}),
        ...(opts?.sourceImageDataUrl && !opts?.sourceImageUrl
          ? { sourceImageDataUrl: opts.sourceImageDataUrl }
          : {}),
        ...(typeof opts?.strength === "number" ? { strength: opts.strength } : {}),
      },
      z.object({
        imageUrl: z.string(),
        mode: z.enum(["img2img", "text2img"]).optional(),
      }),
    );
  },

  /**
   * Mask-aware AI inpaint (#1109). Takes a source image + binary mask
   * (white = inpaint inside, black = preserve outside) + prompt; the
   * SDXL-inpainting model regenerates content only inside the mask
   * with surrounding context informing the new pixels. Produces visually
   * cleaner stitches than the client-side `compositeImageIntoSelection`
   * fallback. Caller is responsible for rasterising the user's marquee
   * selection into a binary mask dataURL the same size as the source.
   */
  async inpaintImage(
    prompt: string,
    sourceImageDataUrl: string,
    maskImageDataUrl: string,
    opts?: { strength?: number },
  ): Promise<ApiSuccessResponse<{ imageUrl: string; mode?: "inpaint" }>> {
    return apiClient.post(
      "/api/studio/images",
      {
        mode: "inpaint",
        prompt,
        sourceImageDataUrl,
        maskImageDataUrl,
        ...(typeof opts?.strength === "number" ? { strength: opts.strength } : {}),
      },
      z.object({
        imageUrl: z.string(),
        mode: z.enum(["inpaint"]).optional(),
      }),
    );
  },

  /** Canvas-expanding AI outpaint (#940). Same model pool as inpaint;
   *  the route adds expansion deltas + builds the outer mask
   *  server-side. The client passes the source image data URL + the
   *  per-edge expansion in pixels. */
  async outpaintImage(
    prompt: string,
    sourceImageDataUrl: string,
    expand: { top: number; right: number; bottom: number; left: number },
    opts?: { strength?: number },
  ): Promise<ApiSuccessResponse<{
    imageUrl: string;
    mode?: "outpaint";
    expand: { top: number; right: number; bottom: number; left: number };
  }>> {
    return apiClient.post(
      "/api/studio/images",
      {
        mode: "outpaint",
        prompt,
        sourceImageDataUrl,
        expandTop: expand.top,
        expandRight: expand.right,
        expandBottom: expand.bottom,
        expandLeft: expand.left,
        ...(typeof opts?.strength === "number" ? { strength: opts.strength } : {}),
      },
      z.object({
        imageUrl: z.string(),
        mode: z.enum(["outpaint"]).optional(),
        expand: z.object({
          top: z.number(),
          right: z.number(),
          bottom: z.number(),
          left: z.number(),
        }),
      }),
    );
  },
};
