/**
 * Image classifier port for the explicit scan + its two adapters:
 *
 *   1. gateway vision  — Claude Sonnet 5.5 through the Builderforce gateway
 *                        (BUILDERFORCE_API_KEY). Batches every image of a
 *                        request into ONE call.
 *   2. Workers AI      — @cf/meta/llama-3.2-11b-vision-instruct through the
 *                        `AI` binding, one image per call. Meta's licence has
 *                        been accepted by the owner; if the model still answers
 *                        "licence not accepted" (error 5016), the adapter sends
 *                        the prompt "agree" once per isolate and retries.
 *
 * Each adapter picks the variant of an image it can take cheaply
 * (gatewaySource / workersAiSource): the stored public URL, the raw bytes
 * when small, or the downscaled scan copy the server makes (Cloudflare
 * Images) of large / unsupported images. Nothing multi-MB is ever base64-encoded or
 * expanded into a number array inside the Worker (10 ms CPU on Free).
 *
 * `classifyImages` walks the chain; when every adapter is missing or fails —
 * or an image has no variant any adapter can take — the verdict is
 * `unscreened`: public reach fails CLOSED, private use is never blocked.
 */
import {
  mergeVerdicts,
  unscreenedVerdict,
  type ExplicitVerdict,
} from "../../../../../shared/moderation/explicit.js";
import { createLLMClient, hasAnyLLMProviderKey, type LLMClient, type LLMContentPart, type LLMEnv } from "../../adapters/llm-client.js";
import {
  WORKERS_AI_VISION_MODEL,
  resolveWorkersAi,
  runWorkersAi,
  type WorkersAiBinding,
} from "../../adapters/workers-ai.js";
import { IMAGE_SYSTEM_PROMPT, parseClassifierVerdict } from "./classifierPrompt.js";
import { bytesToBase64 } from "../../../utils/crypto.js";
import { logger } from "../../../lib/logger.js";

export interface ImageVariant {
  bytes: Uint8Array;
  mime: string;
}

export interface ImageInput extends ImageVariant {
  /** Public URL serving the same bytes, when stored — the gateway reads it
   *  by URL instead of the Worker base64-encoding the bytes. */
  url?: string;
  /** Server-made downscaled JPEG (≤ 1600 px, Cloudflare Images — see
   *  imageDownscaler.ts) of a large or unsupported original. */
  scanCopy?: ImageVariant;
}

export interface ImageClassifier {
  readonly name: string;
  /** Throws when the adapter is unavailable or its answer is unusable. */
  classify(images: readonly ImageInput[]): Promise<ExplicitVerdict>;
}

/** Types every adapter accepts. SVG / HEIC / etc. need a scan copy. */
const SCANNABLE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** Vision APIs cap an image at ~5 MB base64 (≈3.7 MB raw). */
export const MAX_SCAN_IMAGE_BYTES = 3_700_000;
/** Largest variant handed to Workers AI (it takes a byte array). */
export const WORKERS_AI_MAX_BYTES = 1_000_000;
/** Largest variant the gateway gets inline (base64) when there is no URL. */
export const INLINE_MAX_BYTES = 1_500_000;

/** A plain boolean, not a type guard: `ImageInput` extends `ImageVariant`,
 *  so a guard would narrow a failed check on the original to `never`. */
function fits(v: ImageVariant | undefined, max: number): boolean {
  return !!v && SCANNABLE_MIMES.has(v.mime) && v.bytes.byteLength > 0 && v.bytes.byteLength <= max;
}

/** What the gateway is sent: the URL of a scannable original, a small
 *  original inline, or the scan copy inline. Null = nothing it can take. */
export function gatewaySource(img: ImageInput): string | null {
  if (fits(img, MAX_SCAN_IMAGE_BYTES) && img.url) return img.url;
  if (fits(img, INLINE_MAX_BYTES)) return `data:${img.mime};base64,${bytesToBase64(img.bytes)}`;
  const copy = img.scanCopy;
  if (copy && fits(copy, INLINE_MAX_BYTES)) return `data:${copy.mime};base64,${bytesToBase64(copy.bytes)}`;
  return null;
}

/** What Workers AI is sent: the scan copy, else a small original. */
export function workersAiSource(img: ImageInput): ImageVariant | null {
  if (img.scanCopy && fits(img.scanCopy, WORKERS_AI_MAX_BYTES)) return img.scanCopy;
  if (fits(img, WORKERS_AI_MAX_BYTES)) return img;
  return null;
}

/** Can ANY adapter take this image? */
export function isScannableImage(img: ImageInput): boolean {
  return (fits(img, MAX_SCAN_IMAGE_BYTES) && !!img.url) || fits(img, INLINE_MAX_BYTES) || fits(img.scanCopy, INLINE_MAX_BYTES);
}

/** The gateway may substitute a model; only a vision model's answer counts. */
export function isVisionModel(model: string | undefined): boolean {
  return !!model && /claude|gpt-4o|gpt-4\.1|gpt-5|gemini|vision|llava|pixtral|qwen[\w.-]*vl/i.test(model);
}

export function gatewayVisionClassifier(llm: LLMClient): ImageClassifier {
  return {
    name: "gateway-vision",
    async classify(images) {
      const sources = images.map(gatewaySource);
      if (sources.some((s) => s === null)) throw new Error("an image has no variant the gateway can take");
      const parts: LLMContentPart[] = [
        { type: "text", text: `Classify ${images.length === 1 ? "this image" : `these ${images.length} images`}.` },
        ...sources.map((url): LLMContentPart => ({ type: "image_url", image_url: { url: url!, detail: "low" } })),
      ];
      const result = await llm.callMessages(
        "explicit_image_scan",
        {
          useCase: "explicit_image_scan",
          responseFormat: "text",
          messages: [
            { role: "system", content: IMAGE_SYSTEM_PROMPT },
            { role: "user", content: parts },
          ],
        },
        // The scanner is fed the very content it judges — never self-block.
        { skipContentGuard: true, timeoutMs: 45_000 },
      );
      if (!isVisionModel(result.usage.model)) {
        throw new Error(`non-vision model answered (${result.usage.model})`);
      }
      return parseClassifierVerdict(result.content ?? "");
    },
  };
}

// The ONE Workers AI adapter owns the binding type, model ids and metering.
export { WORKERS_AI_VISION_MODEL, type WorkersAiBinding } from "../../adapters/workers-ai.js";

/** Meta's licence-not-accepted answer from Workers AI (code 5016 / "agree"). */
export function isLicenceNotAcceptedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const code = (err as { code?: unknown } | null)?.code;
  return code === 5016 || /\b5016\b/.test(message) || /\bagree\b/i.test(message);
}

/** Bindings that already sent "agree" in this isolate (once per isolate). */
const agreedBindings = new WeakSet<WorkersAiBinding>();

/** Run the vision model; on a licence-not-accepted error, accept Meta's
 *  licence once per isolate (prompt "agree") and retry once. The scan is a
 *  platform cost with no billed user (like the gateway leg, whose client is
 *  built with `user = null`), so `runWorkersAi` is called without a meter. */
async function runVision(ai: WorkersAiBinding, inputs: Record<string, unknown>): Promise<unknown> {
  try {
    return await runWorkersAi(ai, WORKERS_AI_VISION_MODEL, inputs);
  } catch (err) {
    if (!isLicenceNotAcceptedError(err) || agreedBindings.has(ai)) throw err;
    agreedBindings.add(ai);
    await runWorkersAi(ai, WORKERS_AI_VISION_MODEL, { prompt: "agree" }).catch(() => undefined);
    return runWorkersAi(ai, WORKERS_AI_VISION_MODEL, inputs);
  }
}

export function workersAiVisionClassifier(ai: WorkersAiBinding): ImageClassifier {
  return {
    name: "workers-ai-vision",
    async classify(images) {
      const sources = images.map(workersAiSource);
      if (sources.some((s) => s === null)) throw new Error("an image is too large for the Workers AI fallback (no scan copy)");
      const verdicts: ExplicitVerdict[] = [];
      for (const src of sources) {
        const res = (await runVision(ai, {
          messages: [
            { role: "system", content: IMAGE_SYSTEM_PROMPT },
            { role: "user", content: "Classify this image." },
          ],
          image: Array.from(src!.bytes),
          max_tokens: 200,
        })) as { response?: unknown } | null;
        if (typeof res?.response !== "string") throw new Error("Workers AI vision returned no text");
        const verdict = parseClassifierVerdict(res.response);
        verdicts.push(verdict);
        if (verdict.verdict === "block") break;
      }
      return mergeVerdicts(verdicts);
    },
  };
}

export interface ImageScanEnv extends LLMEnv {
  AI?: WorkersAiBinding;
}

/** The adapters this environment can use, in preference order. */
export function createImageClassifiers(env: ImageScanEnv | undefined): ImageClassifier[] {
  const out: ImageClassifier[] = [];
  if (hasAnyLLMProviderKey(env)) out.push(gatewayVisionClassifier(createLLMClient(env, null)));
  const ai = resolveWorkersAi(env);
  if (ai) out.push(workersAiVisionClassifier(ai));
  return out;
}

/**
 * Classify a set of images as ONE item (any block blocks). Images no adapter
 * can take make the item unscreened; so does a chain where every adapter
 * failed. Never throws.
 */
export async function classifyImages(
  images: readonly ImageInput[],
  classifiers: readonly ImageClassifier[],
): Promise<ExplicitVerdict> {
  if (images.length === 0) return mergeVerdicts([]);
  const scannable = images.filter(isScannableImage);
  const skipped = images.length - scannable.length;
  const parts: ExplicitVerdict[] = [];
  if (skipped > 0) parts.push(unscreenedVerdict(`${skipped} image(s) of an unsupported type or size, with no scan copy`));
  if (scannable.length > 0) parts.push(await runChain(scannable, classifiers));
  return mergeVerdicts(parts);
}

async function runChain(images: readonly ImageInput[], classifiers: readonly ImageClassifier[]): Promise<ExplicitVerdict> {
  if (classifiers.length === 0) return unscreenedVerdict("no image classifier configured");
  for (const classifier of classifiers) {
    try {
      return await classifier.classify(images);
    } catch (err) {
      logger.warn("[explicit-scan] classifier failed", { classifier: classifier.name, error: err });
    }
  }
  return unscreenedVerdict("every image classifier failed");
}
