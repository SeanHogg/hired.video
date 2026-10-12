/**
 * The home-wall gate: the explicit scan of a public video.
 *
 *   evaluateVideoForPublic  run whenever a video becomes (or stays) public
 *                           and on the wall: title, description, the owner's
 *                           name + headline, script / captions / on-screen
 *                           text, the thumbnail, every image asset, and the
 *                           frames the client sampled from the render.
 *   scanVideoFrames         the client's sampled frames of one render, in
 *                           one vision call; re-evaluates the video.
 *
 * The verdict is stored once (`video` row). The public feed only shows
 * videos whose effective verdict is `pass`, so anything unscanned,
 * unscreened (classifier down, frames missing) or blocked stays off the wall
 * while remaining private-usable. The feed is invalidated whenever a video's
 * wall eligibility flips.
 */
import {
  isPubliclyVisible,
  mergeVerdicts,
  unscreenedVerdict,
  type ExplicitVerdict,
} from "../../../../../shared/moderation/explicit.js";
import { invalidatePublicVideoFeed } from "../../studio/public-video-feed.js";
import { classifyImages, type ImageInput } from "./imageClassifier.js";
import { sha256Hex } from "./bytes.js";
import { adoptInputHash, getScan, touchScan, upsertScan, type StoredScan } from "./contentScanRepository.js";
import { verdictForImageUrl } from "./imageScan.js";
import { scanTextExplicit } from "./textScan.js";
import { collectVideoScanInputs } from "./videoScanInputs.js";
import { loadVideoScanContext } from "./videoScanContext.js";
import type { ExplicitScanDeps } from "./deps.js";

/** Migration 0509 approves pre-gate wall videos with this system reason and
 *  an input_hash marker of their render (no reviewer). Keep in sync with
 *  api/drizzle/0509_content_scans_legacy_approve.sql. */
export const LEGACY_APPROVAL_REASON = "legacy-approved-2026-10-10";
export function legacyInputHash(r2Key: string | null): string {
  return `legacy:${r2Key ?? ""}`;
}

/** A legacy approval survives a rescan only while nothing on the video
 *  (text, image assets) blocks. Legacy renders have no sampled frames, so
 *  frames are not part of this check. */
export function keepsLegacyApproval(parts: readonly ExplicitVerdict[]): boolean {
  return parts.every((p) => p.verdict !== "block");
}

/** Bounded fan-out over image assets (most are cache hits from upload). */
const IMAGE_CONCURRENCY = 4;

async function mapLimited<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** The frames verdict that belongs to the CURRENT render, if any. */
function framesVerdict(frames: StoredScan | null, r2Key: string | null): ExplicitVerdict {
  if (!r2Key) return mergeVerdicts([]); // not a hosted render (e.g. YouTube) — nothing to sample
  if (!frames || frames.inputHash !== r2Key) return unscreenedVerdict("video frames not submitted for this render");
  return { verdict: frames.verdict, categories: frames.categories, reason: frames.reason };
}

export async function evaluateVideoForPublic(videoId: string, deps: ExplicitScanDeps): Promise<StoredScan | null> {
  const ctx = await loadVideoScanContext(videoId);
  // Only public videos on the wall are gated (and paid for); a private
  // video is never blocked from its owner's private use.
  if (!ctx || ctx.privacyStatus !== "public" || !ctx.showOnHome) return null;

  const inputs = collectVideoScanInputs(ctx);
  const frames = await getScan("video_frames", videoId);
  const framesPart = framesVerdict(frames, ctx.r2Key);
  const inputHash = await sha256Hex(JSON.stringify({
    text: inputs.text,
    images: inputs.imageUrls,
    render: ctx.r2Key,
    frames: frames ? `${frames.inputHash}:${frames.verdict}:${frames.scannedAt.toISOString()}` : null,
  }));

  const before = await getScan("video", videoId);
  // Legacy approval (migration 0509) of the SAME render. The render is
  // unchanged, but the text / images may not be — so they are still scanned.
  const legacy = !!before?.overrideVerdict && before.inputHash === legacyInputHash(ctx.r2Key);
  if (!legacy && before && before.inputHash === inputHash && before.verdict !== "unscreened") {
    // Unchanged content: keep the verdict, but record the re-check so the
    // scheduled backfill (videos.updated_at > scanned_at) moves on.
    await touchScan("video", videoId);
    return before;
  }

  const textPart = await scanTextExplicit(inputs.text, deps.classifyText);
  const imageParts = await mapLimited(inputs.imageUrls, IMAGE_CONCURRENCY, (url) =>
    verdictForImageUrl(url, ctx.ownerUserId, deps),
  );
  if (legacy && before && keepsLegacyApproval([textPart, ...imageParts])) {
    // Nothing on it blocks: keep the approval, re-keyed to the real content
    // hash (a later content change then clears it like any override).
    await adoptInputHash("video", videoId, inputHash);
    return { ...before, inputHash };
  }
  // Otherwise the normal verdict below; the new input hash differs from the
  // legacy marker, so upsertScan clears the override.
  const verdict = mergeVerdicts([
    textPart,
    ...imageParts,
    framesPart,
    ...(inputs.imagesTruncated ? [unscreenedVerdict("more image assets than the scan covers")] : []),
  ]);

  const after = await upsertScan({ subjectType: "video", subjectId: videoId, ownerUserId: ctx.ownerUserId, verdict, inputHash });
  if (isPubliclyVisible(before) !== isPubliclyVisible(after)) invalidatePublicVideoFeed();
  return after;
}

/** Most frames a client may send for one render. */
export const MAX_FRAMES = 12;

export async function scanVideoFrames(
  args: { videoId: string; r2Key: string; ownerUserId: string; frames: readonly ImageInput[] },
  deps: ExplicitScanDeps,
): Promise<ExplicitVerdict> {
  const verdict = await classifyImages(args.frames.slice(0, MAX_FRAMES), deps.classifiers);
  await upsertScan({
    subjectType: "video_frames",
    subjectId: args.videoId,
    ownerUserId: args.ownerUserId,
    verdict,
    inputHash: args.r2Key,
  });
  return verdict;
}
