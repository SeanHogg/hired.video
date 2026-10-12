/**
 * Per-network delivery presets for posting a rendered video (#2045) — the
 * aspect ratios, duration window and codec each network accepts — and the
 * variant planner that turns "post to these networks" into the fewest
 * distinct cuts.
 *
 * Distinct from the export picker's catalog (frontend/lib/timeline/
 * export-profiles.ts — resolution, fps and bitrate per one-click export):
 * these are the network's ACCEPTANCE rules, which the Post dock checks a
 * video against before it is sent.
 *
 * De-duplication: a variant is keyed by what changes its pixels — aspect
 * and trim point (every posted cut is H.264 MP4, the POSTING RULE in
 * shared/timeline) — so every network that accepts the same cut shares
 * one variant (one 9:16 cut feeds TikTok, Reels, Shorts and a vertical
 * LinkedIn post). A baked variant is stored once per (project, variant key,
 * content revision) in studio_project_render_variants (#2045), so
 * re-posting the same content never re-renders or re-uploads it.
 */
import type { VideoPublishPlatform } from "./social-platforms.js";

export type PresetAspect = "16:9" | "9:16" | "1:1" | "4:5";

export interface PublishPlatformPreset {
  /** Accepted aspect ratios, preferred first. */
  aspects: readonly PresetAspect[];
  /** Shortest and longest video the network takes through its API (seconds). */
  minDurationSec: number;
  maxDurationSec: number;
  codec: "h264";
  container: "mp4";
  audioCodec: "aac";
}

const H264_MP4 = { codec: "h264", container: "mp4", audioCodec: "aac" } as const;

/** Limits as each network documents them for API uploads (2026). */
export const PUBLISH_PLATFORM_PRESETS: Record<VideoPublishPlatform, PublishPlatformPreset> = {
  // Verified channels take up to 12 h; vertical ≤ 3 min is filed as a Short.
  youtube: { aspects: ["16:9", "9:16", "1:1"], minDurationSec: 1, maxDurationSec: 12 * 60 * 60, ...H264_MP4 },
  // Content Posting API; the account's own cap (creator_info) can be lower.
  tiktok: { aspects: ["9:16", "1:1", "16:9"], minDurationSec: 3, maxDurationSec: 10 * 60, ...H264_MP4 },
  // Reels via the Graph API.
  instagram: { aspects: ["9:16", "4:5", "1:1"], minDurationSec: 3, maxDurationSec: 15 * 60, ...H264_MP4 },
  // Media upload for non-premium posts.
  x: { aspects: ["16:9", "1:1", "9:16"], minDurationSec: 1, maxDurationSec: 140, ...H264_MP4 },
  facebook: { aspects: ["16:9", "9:16", "1:1", "4:5"], minDurationSec: 1, maxDurationSec: 4 * 60 * 60, ...H264_MP4 },
  linkedin: { aspects: ["16:9", "1:1", "9:16", "4:5"], minDurationSec: 3, maxDurationSec: 15 * 60, ...H264_MP4 },
};

/** YouTube files a vertical upload this long or shorter as a Short. */
export const YOUTUBE_SHORTS_MAX_SEC = 180;

const ASPECT_RATIOS: Record<PresetAspect, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1, "4:5": 4 / 5 };
const ASPECT_TOLERANCE = 0.03;

/** The preset aspect a frame matches (within 3%), or null for an odd frame. */
export function aspectOf(width: number, height: number): PresetAspect | null {
  if (!(width > 0) || !(height > 0)) return null;
  const ratio = width / height;
  for (const [aspect, target] of Object.entries(ASPECT_RATIOS) as Array<[PresetAspect, number]>) {
    if (Math.abs(ratio - target) / target <= ASPECT_TOLERANCE) return aspect;
  }
  return null;
}

export interface VideoShape {
  /** Null when the frame matches no preset aspect. */
  aspect: PresetAspect | null;
  durationSec: number;
}

/** Vertical and ≤ 3 min → YouTube files it as a Short. */
export function isYouTubeShort({ aspect, durationSec }: VideoShape): boolean {
  return aspect === "9:16" && durationSec > 0 && durationSec <= YOUTUBE_SHORTS_MAX_SEC;
}

/** How a video of this shape fits one network. */
export interface PublishFit {
  aspect: PresetAspect;
  codec: PublishPlatformPreset["codec"];
  /** The source frame isn't one this network takes — it needs reframing to `aspect`. */
  reframe: boolean;
  /** Needs cutting down to this length (null = full length). */
  trimToSec: number | null;
  /** Shorter than this network accepts — it would be rejected. */
  tooShort: boolean;
}

/** The cut one network needs for a video of this shape. */
export function publishFitFor(platform: VideoPublishPlatform, source: VideoShape): PublishFit {
  return fitForPreset(PUBLISH_PLATFORM_PRESETS[platform], source);
}

function fitForPreset(preset: PublishPlatformPreset, source: VideoShape): PublishFit {
  const keepsFrame = source.aspect !== null && preset.aspects.includes(source.aspect);
  return {
    aspect: keepsFrame ? (source.aspect as PresetAspect) : preset.aspects[0],
    codec: preset.codec,
    reframe: !keepsFrame,
    trimToSec: source.durationSec > preset.maxDurationSec ? preset.maxDurationSec : null,
    tooShort: source.durationSec > 0 && source.durationSec < preset.minDurationSec,
  };
}

/** One distinct cut and the networks it feeds. */
export interface PublishVariant {
  /** Dedup key (`variantKeyFor`, or MASTER_VARIANT_KEY for the as-is cut). Same key → same cut. */
  key: string;
  aspect: PresetAspect;
  codec: PublishPlatformPreset["codec"];
  reframe: boolean;
  trimToSec: number | null;
  platforms: VideoPublishPlatform[];
}

/**
 * The fewest cuts that cover `platforms`, in first-use order. Networks that
 * accept the source frame at full length share the as-is variant; a network
 * that needs a different frame or a shorter cut gets (or shares) its own.
 * This is the bake list the renderer works through (one render + one
 * content-hashed upload per variant).
 */
export function planPublishVariants(platforms: readonly VideoPublishPlatform[], source: VideoShape): PublishVariant[] {
  const byKey = new Map<string, PublishVariant>();
  for (const platform of new Set(platforms)) {
    const { aspect, codec, reframe, trimToSec } = publishFitFor(platform, source);
    const key = variantKeyFor(PUBLISH_PLATFORM_PRESETS[platform], source) ?? MASTER_VARIANT_KEY;
    const existing = byKey.get(key);
    if (existing) existing.platforms.push(platform);
    else byKey.set(key, { key, aspect, codec, reframe, trimToSec, platforms: [platform] });
  }
  return [...byKey.values()];
}

// ─── Fitted cuts (#2045) ────────────────────────────────────────────────────

/** The key of the master render itself — the cut every fitting network posts. */
export const MASTER_VARIANT_KEY = "master";

/** Upper bound on a variant key's length (the DB column is varchar(32)). */
export const VARIANT_KEY_MAX = 32;

const ASPECT_SLUG: Record<PresetAspect, string> = { "16:9": "16x9", "9:16": "9x16", "1:1": "1x1", "4:5": "4x5" };
const VARIANT_KEY_RE = /^(16x9|9x16|1x1|4x5)-(full|[1-9]\d{0,5})(?:s(\d{1,6}))?$/;

/** What a fitted cut changes: the frame it is reframed to, where it is cut
 *  (null = full length), and an optional start offset in seconds. Agent clips
 *  key as `9x16-30s45` (30s long, starting at 45s). */
export interface VariantSpec {
  key: string;
  aspect: PresetAspect;
  trimToSec: number | null;
  /** Start offset in the master; omitted / 0 = from the beginning. */
  startSec?: number;
}

/**
 * The fitted cut a network with this preset needs from a master of this
 * shape, as a stable key (`"9x16-60"`, `"16x9-140"`, `"9x16-full"`) — or
 * null when the master already fits (right frame, not too long). Networks
 * with the same needs get the same key, so one render serves them all.
 * A too-short master gets no key: no cut can lengthen it.
 */
export function variantKeyFor(preset: PublishPlatformPreset, master: VideoShape): string | null {
  const { aspect, reframe, trimToSec } = fitForPreset(preset, master);
  if (!reframe && trimToSec === null) return null;
  return `${ASPECT_SLUG[aspect]}-${trimToSec ?? "full"}`;
}

/** The cut a key names, or null for anything that isn't a well-formed variant key. */
export function parseVariantKey(key: string): VariantSpec | null {
  const m = VARIANT_KEY_RE.exec(key);
  if (!m) return null;
  const aspect = (Object.keys(ASPECT_SLUG) as PresetAspect[]).find((a) => ASPECT_SLUG[a] === m[1])!;
  const startSec = m[3] != null ? Number(m[3]) : undefined;
  return {
    key,
    aspect,
    trimToSec: m[2] === "full" ? null : Number(m[2]),
    ...(startSec ? { startSec } : {}),
  };
}

/** Agent clip key: `{aspect}-{trim}s{start}` e.g. `9x16-30s45`. */
export function variantKeyWithStart(aspect: PresetAspect, trimToSec: number | null, startSec?: number): string {
  const base = `${ASPECT_SLUG[aspect]}-${trimToSec ?? "full"}`;
  return startSec && startSec > 0 ? `${base}s${Math.floor(startSec)}` : base;
}

/** The fitted cut one network needs for this master (null = post the master). */
export function variantSpecFor(platform: VideoPublishPlatform, master: VideoShape): VariantSpec | null {
  const key = variantKeyFor(PUBLISH_PLATFORM_PRESETS[platform], master);
  return key ? parseVariantKey(key) : null;
}

/** A cut's content revision: the master content's timeline hash (the one the
 *  master render is stamped with) + whether it carries the watermark, since
 *  the same content renders differently with and without it. */
export function variantRevision(masterTimelineHash: string, branded: boolean): string {
  return `${masterTimelineHash}.${branded ? "b" : "u"}`;
}

/** True when a cut was rendered from the content the master is stamped with —
 *  i.e. it still shows what the creator last rendered. */
export function isVariantOfMaster(contentRevision: string, masterTimelineHash: string | null | undefined): boolean {
  const dot = contentRevision.lastIndexOf(".");
  return !!masterTimelineHash && dot > 0 && contentRevision.slice(0, dot) === masterTimelineHash;
}
