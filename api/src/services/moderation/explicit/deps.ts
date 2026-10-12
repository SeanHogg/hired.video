/**
 * Wires the explicit scan's ports to this environment's adapters: the text
 * classifier (gateway → Workers AI, via the shared AiTextCaller), the image
 * classifier chain (gateway vision → Workers AI vision) and the Cloudflare
 * Images downscaler for large / unsupported images. Use cases take the
 * resulting deps object, so tests pass fakes instead of an env.
 */
import { createAiTextCaller, hasAiTextProvider } from "../../adapters/ai-text-caller.js";
import { createImageClassifiers, type ImageClassifier, type ImageScanEnv } from "./imageClassifier.js";
import { createImageDownscaler, type ImageDownscaler } from "./imageDownscaler.js";
import type { TextClassifier } from "./textScan.js";

export interface ExplicitScanEnv extends ImageScanEnv {
  IMAGES?: unknown;
}

export interface ExplicitScanDeps {
  classifyText: TextClassifier | null;
  classifiers: readonly ImageClassifier[];
  downscale?: ImageDownscaler | null;
  fetchImpl?: typeof fetch;
}

export function createExplicitScanDeps(env: ExplicitScanEnv | undefined): ExplicitScanDeps {
  return {
    classifyText: hasAiTextProvider(env)
      ? createAiTextCaller(env, null, { label: "explicit_text_scan", useCase: "explicit_text_scan", maxInputChars: 8000 })
      : null,
    classifiers: createImageClassifiers(env),
    downscale: createImageDownscaler(env),
  };
}
