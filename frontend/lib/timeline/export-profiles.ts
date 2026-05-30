/**
 * Platform / social export presets (#342).
 *
 * Distinct from `lib/studio/codec-presets.ts` (which lists codecs and
 * containers) and `lib/studio/video-formats.ts` (which lists authoring
 * canvases). This catalog binds the three together for delivery:
 *
 *   "YouTube 1080p60" = h264 + mp4 + 1920x1080 + 60fps + 12 Mbps + AAC 192k
 *
 * One-click "export for TikTok" / "export for LinkedIn" reads this
 * map. Distinct from #285's "Custom Formats" (user-defined saves) —
 * these are first-party canonical presets that match the public spec
 * sheets each platform publishes.
 *
 * Bitrates follow each platform's recommended-upload range so the
 * encoded master stays inside the re-encoding sweet spot (sending a
 * bitrate too low forces YouTube/TikTok to re-quantize aggressively;
 * sending too high wastes bandwidth and gets compressed back anyway).
 */

import type { Codec, Container, AudioCodec } from "../studio/codec-presets";

export interface PlatformExportProfile {
  id: string;
  /** Display label in the picker. */
  label: string;
  /** Short hint shown below the label ("YouTube / LinkedIn / CTV"). */
  hint: string;
  /** Channel group — used to group presets in the picker UI. */
  group: "youtube" | "tiktok" | "instagram" | "linkedin" | "x" | "vimeo" | "broadcast";
  /** Output container. */
  container: Container;
  /** Output codec. */
  codec: Codec;
  /** Output audio codec. */
  audioCodec: AudioCodec;
  /** Output resolution in pixels. */
  width: number;
  height: number;
  /** Output frame rate. */
  fps: number;
  /** Recommended video bitrate (bits/second). */
  videoBitrate: number;
  /** Recommended audio bitrate (bits/second). */
  audioBitrate: number;
  /** Pro tier required (drives the lock badge + #283 4K gate). */
  proOnly: boolean;
}

const M = 1_000_000;
const K = 1_000;

export const PLATFORM_PRESETS: PlatformExportProfile[] = [
  // YouTube — recommended upload encoding spec (Google).
  {
    id: "youtube-1080p60",
    label: "YouTube 1080p60",
    hint: "1080p60 · H.264 · 12 Mbps",
    group: "youtube",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    fps: 60,
    videoBitrate: 12 * M,
    audioBitrate: 192 * K,
    proOnly: false,
  },
  {
    id: "youtube-1080p30",
    label: "YouTube 1080p30",
    hint: "1080p30 · H.264 · 8 Mbps",
    group: "youtube",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 8 * M,
    audioBitrate: 192 * K,
    proOnly: false,
  },
  {
    id: "youtube-4k60",
    label: "YouTube 4K 60",
    hint: "2160p60 · H.264 · 53 Mbps · Pro",
    group: "youtube",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 3840,
    height: 2160,
    fps: 60,
    videoBitrate: 53 * M,
    audioBitrate: 384 * K,
    proOnly: true,
  },
  {
    id: "youtube-shorts",
    label: "YouTube Shorts",
    hint: "1080×1920 · 30 fps · H.264",
    group: "youtube",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1080,
    height: 1920,
    fps: 30,
    videoBitrate: 8 * M,
    audioBitrate: 192 * K,
    proOnly: false,
  },

  // TikTok — 9:16 vertical, MP4 / MOV, H.264. Spec from the TikTok
  // Ads Creative Catalog (consumer max upload bitrate).
  {
    id: "tiktok-vertical",
    label: "TikTok 9:16",
    hint: "1080×1920 · 30 fps · H.264 · 8 Mbps",
    group: "tiktok",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1080,
    height: 1920,
    fps: 30,
    videoBitrate: 8 * M,
    audioBitrate: 128 * K,
    proOnly: false,
  },

  // Instagram — Reels (9:16), Feed (1:1 or 4:5), Stories. Bitrate per
  // current Instagram help-centre spec.
  {
    id: "instagram-reels",
    label: "Instagram Reels",
    hint: "1080×1920 · 30 fps · H.264 · 9 Mbps",
    group: "instagram",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1080,
    height: 1920,
    fps: 30,
    videoBitrate: 9 * M,
    audioBitrate: 128 * K,
    proOnly: false,
  },
  {
    id: "instagram-feed-square",
    label: "Instagram Feed (1:1)",
    hint: "1080×1080 · 30 fps · H.264",
    group: "instagram",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1080,
    height: 1080,
    fps: 30,
    videoBitrate: 5 * M,
    audioBitrate: 128 * K,
    proOnly: false,
  },
  {
    id: "instagram-feed-portrait",
    label: "Instagram Feed (4:5)",
    hint: "1080×1350 · 30 fps · H.264",
    group: "instagram",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1080,
    height: 1350,
    fps: 30,
    videoBitrate: 5 * M,
    audioBitrate: 128 * K,
    proOnly: false,
  },

  // LinkedIn — recommended max 5 GB / 10 min for native upload.
  {
    id: "linkedin-feed",
    label: "LinkedIn Feed",
    hint: "1920×1080 · 30 fps · H.264 · 10 Mbps",
    group: "linkedin",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 10 * M,
    audioBitrate: 192 * K,
    proOnly: false,
  },
  {
    id: "linkedin-square",
    label: "LinkedIn Square",
    hint: "1080×1080 · 30 fps · H.264",
    group: "linkedin",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1080,
    height: 1080,
    fps: 30,
    videoBitrate: 5 * M,
    audioBitrate: 192 * K,
    proOnly: false,
  },

  // X / Twitter — max 1080p, MP4 H.264 with AAC LC.
  {
    id: "x-landscape",
    label: "X / Twitter 16:9",
    hint: "1920×1080 · 30 fps · H.264 · 6 Mbps",
    group: "x",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 6 * M,
    audioBitrate: 128 * K,
    proOnly: false,
  },

  // Vimeo — accepts ProRes masters for higher quality at the same fps.
  {
    id: "vimeo-1080p",
    label: "Vimeo 1080p",
    hint: "1920×1080 · 30 fps · H.264 · 20 Mbps",
    group: "vimeo",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 20 * M,
    audioBitrate: 320 * K,
    proOnly: false,
  },
  {
    id: "vimeo-prores-master",
    label: "Vimeo ProRes 422",
    hint: "1920×1080 · ProRes · Pro",
    group: "vimeo",
    container: "mov",
    codec: "prores",
    audioCodec: "pcm",
    width: 1920,
    height: 1080,
    fps: 30,
    // ProRes is constant-bitrate per pixel; this is the 422 standard
    // rate (~147 Mbps for 1080p). Caller can override per render.
    videoBitrate: 147 * M,
    audioBitrate: 1536 * K,
    proOnly: true,
  },

  // Broadcast — 1080i59.94 H.264, the classic ATSC bundle. Useful for
  // teams cutting promos that have to hit a real broadcast spec sheet.
  {
    id: "broadcast-1080i",
    label: "Broadcast 1080i",
    hint: "1920×1080 · 30 fps · H.264 · 16 Mbps",
    group: "broadcast",
    container: "mp4",
    codec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitrate: 16 * M,
    audioBitrate: 384 * K,
    proOnly: true,
  },
];

export function findPlatformPreset(
  id: string | null | undefined,
): PlatformExportProfile | null {
  if (!id) return null;
  return PLATFORM_PRESETS.find((p) => p.id === id) ?? null;
}

export interface PlatformGroup {
  id: PlatformExportProfile["group"];
  label: string;
  presets: PlatformExportProfile[];
}

const GROUP_LABELS: Record<PlatformExportProfile["group"], string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X / Twitter",
  vimeo: "Vimeo",
  broadcast: "Broadcast",
};

/**
 * Group presets by destination for the picker. Order matches
 * GROUP_LABELS so the picker stays stable. Groups without presets are
 * skipped — adding a new group means listing it in GROUP_LABELS plus
 * one entry in PLATFORM_PRESETS.
 */
export function groupPlatformPresets(): PlatformGroup[] {
  const byGroup = new Map<PlatformExportProfile["group"], PlatformExportProfile[]>();
  for (const p of PLATFORM_PRESETS) {
    const existing = byGroup.get(p.group);
    if (existing) existing.push(p);
    else byGroup.set(p.group, [p]);
  }
  return (Object.keys(GROUP_LABELS) as PlatformExportProfile["group"][])
    .map((id) => ({ id, label: GROUP_LABELS[id], presets: byGroup.get(id) ?? [] }))
    .filter((g) => g.presets.length > 0);
}
