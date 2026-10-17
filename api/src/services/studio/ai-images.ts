/**
 * AI image use case behind POST /api/studio/images — ONE port for every
 * Workers AI image call across the app (MediaPicker, the cross-studio AI
 * prompt panel, the Brain `generate_image` tool, drawing inpaint/outpaint).
 *
 * Modes (body `mode`):
 *   • generate — text→image (SDXL-Lightning, 4 steps) or, when a source
 *     image is supplied, image→image (SD-v1.5 img2img; `strength` 0..1,
 *     default 0.8 keeps coarse shape, replaces detail). Result mode
 *     "text2img" / "img2img".
 *   • inpaint — mask-aware regeneration (#1109): SD-v1.5 inpainting with
 *     (image, mask, prompt); un-masked pixels are preserved.
 *   • outpaint — canvas expansion (#940): img2img at low strength (0.6) so
 *     the model keeps composition while extending into the margin.
 *
 * Every call goes through `runWorkersAi` with a flat 10K-token meter (image
 * models report no usage) after `tokenLedger.ensureBudget`. The PNG lands
 * in R2 under `uploads/{userId}/ai-images/` — that namespace IS the user's
 * media library (`GET /api/upload/images`), so generated images show up in
 * the MediaPicker's Library tab for free.
 */
import type { JwtPayload } from "../../types/index.js";
import { DomainError, isDomainError } from "../../domains/errors.js";
import { tokenLedger } from "../../domains/billing/token-ledger.js";
import { resolveWorkersAi, runWorkersAi } from "../adapters/workers-ai.js";
import { getVideoBucket, putObject } from "../storage/object-store.js";
import { cdnUrl } from "../../utils/cdn.js";

/** Flat per-image charge — image models report no token usage. */
export const AI_IMAGE_FIXED_TOKENS = 10_000;

const SDXL_LIGHTNING = "@cf/bytedance/stable-diffusion-xl-lightning";
const SD15_IMG2IMG = "@cf/runwayml/stable-diffusion-v1-5-img2img";
const SD15_INPAINTING = "@cf/runwayml/stable-diffusion-v1-5-inpainting";

export const AI_IMAGE_MODES = ["generate", "inpaint", "outpaint"] as const;
export type AiImageMode = (typeof AI_IMAGE_MODES)[number];

export type AiImageRequest =
  | { mode: "generate"; prompt: string; sourceImageUrl: string | null; sourceImageDataUrl: string | null; strength: number }
  | { mode: "inpaint"; prompt: string; sourceImageDataUrl: string; maskImageDataUrl: string; strength: number }
  | { mode: "outpaint"; prompt: string; sourceImageDataUrl: string; strength: number; expand: { top: number; right: number; bottom: number; left: number } };

export type AiImageResult =
  | { imageUrl: string; mode: "text2img" | "img2img" | "inpaint" }
  | { imageUrl: string; mode: "outpaint"; expand: { top: number; right: number; bottom: number; left: number } };

const invalid = (message: string) => new DomainError(400, "VALIDATION_ERROR", message);
const isDataImage = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/");
const expandPx = (v: unknown) => Math.max(0, Math.floor(Number(v ?? 0)));

function isAiImageMode(v: unknown): v is AiImageMode {
  return typeof v === "string" && (AI_IMAGE_MODES as readonly string[]).includes(v);
}

/** Validate a POST /images body into a typed request (per-mode messages
 *  identical to the retired /generate-image, /inpaint-image and
 *  /outpaint-image routes). Throws a 400 DomainError. */
export function parseAiImageRequest(body: Record<string, unknown> | null): AiImageRequest {
  const mode = body?.mode;
  if (!isAiImageMode(mode)) throw invalid("mode must be one of: generate, inpaint, outpaint");
  const prompt = body?.prompt;
  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) throw invalid("prompt is required");

  if (mode === "generate") {
    // URL takes precedence when both source shapes are present.
    const rawUrl = body?.sourceImageUrl;
    const rawDataUrl = body?.sourceImageDataUrl;
    const rawStrength = body?.strength;
    const sourceImageUrl = typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : null;
    const sourceImageDataUrl = !sourceImageUrl && isDataImage(rawDataUrl) ? rawDataUrl : null;
    const strength = typeof rawStrength === "number" && rawStrength > 0 && rawStrength <= 1 ? rawStrength : 0.8;
    return { mode, prompt, sourceImageUrl, sourceImageDataUrl, strength };
  }

  const sourceImageDataUrl = body?.sourceImageDataUrl;
  const rawStrength = body?.strength;
  if (mode === "inpaint") {
    const maskImageDataUrl = body?.maskImageDataUrl;
    if (!isDataImage(sourceImageDataUrl)) throw invalid("sourceImageDataUrl is required (data: URL)");
    if (!isDataImage(maskImageDataUrl)) throw invalid("maskImageDataUrl is required (data: URL — white = inpaint)");
    const strength = typeof rawStrength === "number" ? rawStrength : 0.85;
    return { mode, prompt, sourceImageDataUrl, maskImageDataUrl, strength };
  }

  const expand = {
    top: expandPx(body?.expandTop),
    right: expandPx(body?.expandRight),
    bottom: expandPx(body?.expandBottom),
    left: expandPx(body?.expandLeft),
  };
  if (!isDataImage(sourceImageDataUrl)) throw invalid("sourceImageDataUrl is required (data: URL)");
  if (expand.top + expand.right + expand.bottom + expand.left === 0) {
    throw invalid("At least one expand direction must be > 0");
  }
  const strength = typeof rawStrength === "number" ? rawStrength : 0.6;
  return { mode, prompt, sourceImageDataUrl, strength, expand };
}

/** Decode the base64 payload of a `data:` URL. */
function decodeDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const bin = atob(dataUrl.slice(comma + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Persist a Workers AI image response to the user's AI-image library;
 *  returns its CDN URL. */
export async function persistAiImage(userId: string, response: unknown): Promise<string> {
  const buffer = await new Response(response as ReadableStream).arrayBuffer();
  const key = `uploads/${userId}/ai-images/${crypto.randomUUID()}.png`;
  await putObject(key, new Uint8Array(buffer), "image/png", undefined, { kind: "ai_image" });
  return cdnUrl(key);
}

const FAILURE: Record<AiImageMode, { code: string; message: string; unavailable: string; tag: string }> = {
  generate: { code: "GENERATION_FAILED", message: "Image generation failed", unavailable: "AI image generation is not configured", tag: "[studio/images:generate]" },
  inpaint: { code: "INPAINT_FAILED", message: "Image inpaint failed", unavailable: "AI is not configured", tag: "[studio/images:inpaint]" },
  outpaint: { code: "OUTPAINT_FAILED", message: "Image outpaint failed", unavailable: "AI is not configured", tag: "[studio/images:outpaint]" },
};

const FEATURE_KEY: Record<AiImageMode, string> = {
  generate: "image_generation",
  inpaint: "image_inpaint",
  outpaint: "image_outpaint",
};

/** The model + inputs for one request. Throws a 400 DomainError for an
 *  unreachable / malformed generate source. */
async function buildModelCall(req: AiImageRequest): Promise<{ model: string; inputs: Record<string, unknown> }> {
  const prompt = req.prompt.trim().slice(0, 500);
  if (req.mode === "inpaint") {
    return {
      model: SD15_INPAINTING,
      inputs: {
        prompt,
        image: Array.from(decodeDataUrl(req.sourceImageDataUrl)),
        mask: Array.from(decodeDataUrl(req.maskImageDataUrl)),
        num_steps: 20,
        strength: req.strength,
      },
    };
  }
  if (req.mode === "outpaint") {
    return {
      model: SD15_IMG2IMG,
      inputs: { prompt, image: Array.from(decodeDataUrl(req.sourceImageDataUrl)), strength: req.strength, num_steps: 20 },
    };
  }
  if (!req.sourceImageUrl && !req.sourceImageDataUrl) {
    return { model: SDXL_LIGHTNING, inputs: { prompt, num_steps: 4 } };
  }
  let sourceBytes: Uint8Array;
  if (req.sourceImageUrl) {
    const fetched = await fetch(req.sourceImageUrl);
    if (!fetched.ok) {
      throw new DomainError(400, "SOURCE_FETCH_FAILED", `Could not fetch source image (${fetched.status})`);
    }
    sourceBytes = new Uint8Array(await fetched.arrayBuffer());
  } else {
    // Reject shapes we can't decode rather than silently mis-rendering.
    if (req.sourceImageDataUrl!.indexOf(",") < 0) throw invalid("Malformed sourceImageDataUrl");
    sourceBytes = decodeDataUrl(req.sourceImageDataUrl!);
  }
  return { model: SD15_IMG2IMG, inputs: { prompt, image: Array.from(sourceBytes), strength: req.strength, num_steps: 20 } };
}

/** Run one image request end to end. Throws DomainError for every non-2xx
 *  outcome (503 AI_UNAVAILABLE / STORAGE_UNAVAILABLE, 400 source errors,
 *  500 per-mode failure code). */
export async function runAiImageRequest(env: unknown, user: JwtPayload, req: AiImageRequest): Promise<AiImageResult> {
  const failure = FAILURE[req.mode];
  const ai = resolveWorkersAi(env);
  if (!ai) throw new DomainError(503, "AI_UNAVAILABLE", failure.unavailable);
  if (!getVideoBucket(env)) throw new DomainError(503, "STORAGE_UNAVAILABLE", "Image storage not configured");

  try {
    await tokenLedger.ensureBudget(user);
    const { model, inputs } = await buildModelCall(req);
    const response = await runWorkersAi(ai, model, inputs, {
      user,
      featureKey: FEATURE_KEY[req.mode],
      fixedTokens: AI_IMAGE_FIXED_TOKENS,
    });
    const imageUrl = await persistAiImage(user.sub, response);
    if (req.mode === "outpaint") return { imageUrl, mode: "outpaint", expand: req.expand };
    if (req.mode === "inpaint") return { imageUrl, mode: "inpaint" };
    return { imageUrl, mode: model === SDXL_LIGHTNING ? "text2img" : "img2img" };
  } catch (err) {
    if (isDomainError(err)) throw err;
    console.error(`${failure.tag} AI error:`, err);
    throw new DomainError(500, failure.code, failure.message);
  }
}
