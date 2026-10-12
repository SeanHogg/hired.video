/**
 * source-upload.ts — the single seam for "an NLE media source just got
 * (re)uploaded; does it want a downscaled scrubbing proxy, and if so go
 * make one."
 *
 * Per the DRY contract written at the top of `proxy-generator.ts`
 * ("every consumer that needs a proxy — the source picker, the bulk
 * import flow, the asset bin — routes through `generateProxy()` rather
 * than re-implementing the decode/scale/encode loop"), the *decision*
 * about when to spend that effort, and the generate→upload glue, live
 * here once. The bin panel and the relink dialog both call in; neither
 * re-derives the policy. A future bulk-import surface gets it for free.
 *
 * Why a proxy at all: scrubbing a 4K master in the editor preview
 * buffers the whole file and stutters. A 720p proxy keyed to the same
 * source id lets `RendererState.useProxies` swap in light pixels for
 * scrubbing while the render/export path always reads the master `url`.
 */

import { nleApi, type NleMediaSourceWithBin } from "./api";
import { generateProxy, isProxyGenerationAvailable } from "./proxy-generator";
import type { MediaKind } from "../../../shared/timeline";

/**
 * Masters taller than this get an auto-proxy. 1080 means 4K / 1440p
 * masters proxy down to 720p (the proxy generator's default target)
 * but ordinary 1080p webcam captures don't pay the encode cost — they
 * already scrub fine. Kept here (not in BinPanel) so every upload
 * surface shares one threshold.
 */
export const AUTO_PROXY_HEIGHT_THRESHOLD = 1080;

export interface ProxySourceInfo {
  /** Probed media kind. Only `video` is ever proxied. */
  kind: MediaKind;
  /** Probed master height in px (null for non-video / unknown). */
  height: number | null;
  /**
   * Force regeneration even for short / at-threshold masters. The relink
   * flow sets this when the source already carried a proxy: the master
   * content just changed underneath that proxy, so the old proxy now
   * renders the *previous* file's pixels and must be replaced even if the
   * new master is small enough that it wouldn't normally warrant one.
   */
  forceRefresh?: boolean;
}

/**
 * Pure policy — does this master warrant a downscaled scrubbing proxy?
 * No I/O and no WebCodecs probing so it's trivially unit-testable; the
 * platform-capability gate lives in the orchestrator below.
 *
 * - Only video sources proxy (audio/image have no proxyUrl scrubbing
 *   semantics in the renderer).
 * - `forceRefresh` always wins (relink invalidating a stale proxy).
 * - Otherwise: only masters taller than the threshold.
 */
export function proxyIsWarranted(info: ProxySourceInfo): boolean {
  if (info.kind !== "video") return false;
  if (info.forceRefresh) return true;
  return (info.height ?? 0) > AUTO_PROXY_HEIGHT_THRESHOLD;
}

/**
 * Generate a scrubbing proxy for an already-persisted source and upload
 * it, returning the patched source row (now carrying `proxyUrl`).
 *
 * Returns `null` when no proxy is warranted, when the browser can't run
 * the WebCodecs pipeline, or when generation/upload fails. Proxies are a
 * scrubbing *optimisation*, never a correctness gate, so failures are
 * logged and swallowed — the editor falls back to scrubbing the master.
 *
 * Caller is responsible for folding the returned row back into local
 * state (the bin list, the relinked row) when it's non-null.
 */
export async function maybeGenerateAndUploadProxy(
  sourceId: string,
  file: File | Blob,
  info: ProxySourceInfo,
): Promise<NleMediaSourceWithBin | null> {
  if (!isProxyGenerationAvailable() || !proxyIsWarranted(info)) return null;
  try {
    const proxy = await generateProxy(file);
    const { source } = await nleApi.uploadProxy(sourceId, proxy.blob);
    return source;
  } catch (err) {
    console.warn("[nle] proxy generation/upload failed for", sourceId, err);
    return null;
  }
}
