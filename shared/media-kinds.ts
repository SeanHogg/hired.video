/**
 * Studio Media Kinds — single source of truth for the OUTPUT axis of every
 * studio project / template.
 *
 * Distinct from the existing `studio_projects.kind: 'scene' | 'nle'` field,
 * which is a STORAGE discriminator (which editor surface, which JSONB
 * column). `mediaKind` answers the orthogonal question: "what does the
 * finished project become?" — a video file, a podcast episode, a voice
 * clip, or a looping animation.
 *
 * Used in five places that must agree:
 *   • Frontend templates/catalog: per-template `mediaKind` field
 *   • Frontend StudioSaveMenuV2: gates which Export / Publish rows render
 *   • Frontend render facade: derives container + mime from output profile
 *   • API: studio_projects.media_kind column + zod request validation
 *   • Marketing landing pages (#900/#901): "Exports as MP4 / MP3+RSS / GIF"
 *
 * Per the standing DRY rule (`feedback_extract_on_duplication`): every
 * consumer reads from this module. NEVER prop-drill a `canPublishToYouTube`
 * boolean — components self-gate by calling `outputProfilesFor(mediaKind)`
 * and `publishDestinationsFor(mediaKind)` directly.
 *
 * Adding a new mediaKind means editing this one record; the zod schema,
 * the TypeScript type, the export menu, and the render facade all derive
 * from it automatically.
 */

export const MEDIA_KINDS = [
  "video",
  "podcast",
  "voice",
  "animation",
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

export const DEFAULT_MEDIA_KIND: MediaKind = "video";

/** Whether the kind produces audible output (vs. silent animation export). */
export function mediaKindHasAudio(kind: MediaKind): boolean {
  return kind === "video" || kind === "podcast" || kind === "voice";
}

/** Whether the kind produces visible frames (vs. audio-only). */
export function mediaKindHasVideo(kind: MediaKind): boolean {
  return kind === "video" || kind === "animation";
}

/** Whether the kind permits both audio + video tracks (a podcast may
 *  optionally carry a video feed — the "video podcast" branch). */
export function mediaKindCanHaveBoth(kind: MediaKind): boolean {
  return kind === "video" || kind === "podcast";
}

// ─── Output profiles ─────────────────────────────────────────────────────────
//
// An OutputProfile describes one concrete "Export as…" choice the user
// can pick in the save menu. The render facade reads container + audioCodec
// + (optionally) videoCodec to drive ffmpeg.wasm / WebCodecs / gif.js.
//
// Profiles are grouped by mediaKind. Adding a new export format is one
// entry in this table and every picker / exporter picks it up.

export type AudioCodecId = "aac" | "mp3" | "opus" | "pcm";
export type VideoCodecId =
  | "h264"
  | "h265"
  | "prores"
  | "dnxhd"
  | "vp9"
  | "gif"
  | "webp"
  | "apng";

export type ContainerId =
  | "mp4"
  | "mov"
  | "webm"
  | "mp3"
  | "m4a"
  | "wav"
  | "ogg"
  | "gif"
  | "webp"
  | "apng";

export interface OutputProfile {
  /** Stable id — referenced by `studio_projects.timeline_spec.outputProfile`
   *  and by the editor's saved last-used-codec setting. */
  id: string;
  label: string;
  /** One-line picker hint. */
  hint: string;
  /** Media kind this profile belongs to. The save menu filters by this. */
  mediaKind: MediaKind;
  container: ContainerId;
  /** Output mime — the render facade tags Blob results with this. */
  mime: string;
  /** Set when the profile encodes video frames. Null for audio-only. */
  videoCodec: VideoCodecId | null;
  /** Set when the profile encodes audio. Null for silent animation. */
  audioCodec: AudioCodecId | null;
  /** Pro-tier gate — read via `useSubscription().isPro`. */
  proOnly: boolean;
  /** Default download file extension (with dot). */
  fileExt: string;
}

export const OUTPUT_PROFILES: OutputProfile[] = [
  // ─── Video ─────────────────────────────────────────────────────────────────
  {
    id: "video-h264-mp4",
    label: "H.264 (MP4)",
    hint: "Fast · universal",
    mediaKind: "video",
    container: "mp4",
    mime: "video/mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    proOnly: false,
    fileExt: ".mp4",
  },
  {
    id: "video-h265-mp4",
    label: "H.265 / HEVC (MP4)",
    hint: "Smaller file · Pro",
    mediaKind: "video",
    container: "mp4",
    mime: "video/mp4",
    videoCodec: "h265",
    audioCodec: "aac",
    proOnly: true,
    fileExt: ".mp4",
  },
  {
    id: "video-prores-mov",
    label: "ProRes 422 (MOV)",
    hint: "Mastering · Pro",
    mediaKind: "video",
    container: "mov",
    mime: "video/quicktime",
    videoCodec: "prores",
    audioCodec: "pcm",
    proOnly: true,
    fileExt: ".mov",
  },
  {
    id: "video-dnxhd-mov",
    label: "DNxHD (MOV)",
    hint: "Avid workflow · Pro",
    mediaKind: "video",
    container: "mov",
    mime: "video/quicktime",
    videoCodec: "dnxhd",
    audioCodec: "pcm",
    proOnly: true,
    fileExt: ".mov",
  },
  {
    id: "video-vp9-webm",
    label: "VP9 (WebM)",
    hint: "Open codec · Pro",
    mediaKind: "video",
    container: "webm",
    mime: "video/webm",
    videoCodec: "vp9",
    audioCodec: "opus",
    proOnly: true,
    fileExt: ".webm",
  },

  // ─── Podcast ───────────────────────────────────────────────────────────────
  {
    id: "podcast-mp3",
    label: "MP3 (with chapters)",
    hint: "Apple / Spotify / RSS standard",
    mediaKind: "podcast",
    container: "mp3",
    mime: "audio/mpeg",
    videoCodec: null,
    audioCodec: "mp3",
    proOnly: false,
    fileExt: ".mp3",
  },
  {
    id: "podcast-m4a",
    label: "M4A / AAC",
    hint: "Higher quality at the same bitrate",
    mediaKind: "podcast",
    container: "m4a",
    mime: "audio/mp4",
    videoCodec: null,
    audioCodec: "aac",
    proOnly: false,
    fileExt: ".m4a",
  },
  {
    id: "podcast-opus-ogg",
    label: "Opus (OGG)",
    hint: "Open codec · smaller files · Pro",
    mediaKind: "podcast",
    container: "ogg",
    mime: "audio/ogg",
    videoCodec: null,
    audioCodec: "opus",
    proOnly: true,
    fileExt: ".ogg",
  },
  {
    id: "podcast-wav",
    label: "WAV (lossless)",
    hint: "Mastering · Pro",
    mediaKind: "podcast",
    container: "wav",
    mime: "audio/wav",
    videoCodec: null,
    audioCodec: "pcm",
    proOnly: true,
    fileExt: ".wav",
  },
  // Video-podcast branch — same Timeline carries v1-v3 tracks. Encoder
  // path is the same as the video kind, but the publish destinations on
  // top of it are the podcast set (RSS / Apple / Spotify).
  {
    id: "podcast-video-h264-mp4",
    label: "Video podcast (MP4)",
    hint: "Talking-head episode · YouTube + RSS",
    mediaKind: "podcast",
    container: "mp4",
    mime: "video/mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    proOnly: false,
    fileExt: ".mp4",
  },

  // ─── Voice ─────────────────────────────────────────────────────────────────
  {
    id: "voice-mp3",
    label: "MP3",
    hint: "Universal · embeddable",
    mediaKind: "voice",
    container: "mp3",
    mime: "audio/mpeg",
    videoCodec: null,
    audioCodec: "mp3",
    proOnly: false,
    fileExt: ".mp3",
  },
  {
    id: "voice-wav",
    label: "WAV (lossless)",
    hint: "Mastering · sample-accurate",
    mediaKind: "voice",
    container: "wav",
    mime: "audio/wav",
    videoCodec: null,
    audioCodec: "pcm",
    proOnly: false,
    fileExt: ".wav",
  },
  {
    id: "voice-opus-ogg",
    label: "Opus (OGG)",
    hint: "Smallest file · Pro",
    mediaKind: "voice",
    container: "ogg",
    mime: "audio/ogg",
    videoCodec: null,
    audioCodec: "opus",
    proOnly: true,
    fileExt: ".ogg",
  },

  // ─── Animation ─────────────────────────────────────────────────────────────
  {
    id: "animation-gif",
    label: "GIF",
    hint: "Looping · universal · no audio",
    mediaKind: "animation",
    container: "gif",
    mime: "image/gif",
    videoCodec: "gif",
    audioCodec: null,
    proOnly: false,
    fileExt: ".gif",
  },
  {
    id: "animation-webp",
    label: "Animated WebP",
    hint: "Smaller than GIF · same browsers",
    mediaKind: "animation",
    container: "webp",
    mime: "image/webp",
    videoCodec: "webp",
    audioCodec: null,
    proOnly: false,
    fileExt: ".webp",
  },
  {
    id: "animation-apng",
    label: "APNG",
    hint: "True-color animated PNG · Pro",
    mediaKind: "animation",
    container: "apng",
    mime: "image/apng",
    videoCodec: "apng",
    audioCodec: null,
    proOnly: true,
    fileExt: ".apng",
  },
  {
    id: "animation-mp4-alpha",
    label: "MP4 (transparent)",
    hint: "VP9 / HEVC alpha channel · Pro",
    mediaKind: "animation",
    container: "mp4",
    mime: "video/mp4",
    videoCodec: "h265",
    audioCodec: null,
    proOnly: true,
    fileExt: ".mp4",
  },
];

/** Every profile registered for a given mediaKind, in declaration order. */
export function outputProfilesFor(kind: MediaKind): OutputProfile[] {
  return OUTPUT_PROFILES.filter((p) => p.mediaKind === kind);
}

/** Lookup by stable id. Returns null for unknown ids — caller decides
 *  whether to fall back to the kind's default. */
export function findOutputProfile(id: string | null | undefined): OutputProfile | null {
  if (!id) return null;
  return OUTPUT_PROFILES.find((p) => p.id === id) ?? null;
}

/** The default profile every kind ships with — used when the user hasn't
 *  picked one explicitly. First entry per kind, by convention. */
export function defaultOutputProfile(kind: MediaKind): OutputProfile {
  const first = OUTPUT_PROFILES.find((p) => p.mediaKind === kind);
  if (!first) {
    throw new Error(`No output profiles registered for mediaKind=${kind}`);
  }
  return first;
}

// ─── Publish destinations ────────────────────────────────────────────────────
//
// Where a finished project can be published. The save menu reads
// `publishDestinationsFor(kind)` to render the dropdown. Each destination
// is a stable id — the editor maps id → callback at the call site.
//
// NEVER pass `canPublishToX` booleans down through the component tree
// (`feedback_extract_on_duplication`): the menu calls this function and
// the dropdown self-gates per-row.

export type PublishDestinationId =
  // Video
  | "youtube"
  | "linkedin"
  | "profile"
  // Podcast
  | "rss"
  | "apple-podcasts"
  | "spotify-creators"
  // Voice
  | "voice-marketplace"
  | "profile-audio-embed"
  // Animation
  | "giphy"
  | "tenor"
  | "r2-host";

export interface PublishDestination {
  id: PublishDestinationId;
  label: string;
  /** Visible only when the project's mediaKind is in this set. */
  mediaKinds: readonly MediaKind[];
  /** Becomes enabled once the project has a baked output (i.e. has been
   *  rendered at least once). The editor decides what "baked" means per
   *  destination; this flag just declares the dependency. */
  requiresRender: boolean;
}

export const PUBLISH_DESTINATIONS: PublishDestination[] = [
  // Video — the existing surfaces.
  { id: "youtube",              label: "YouTube",                 mediaKinds: ["video", "podcast"], requiresRender: true  },
  { id: "linkedin",             label: "LinkedIn",                mediaKinds: ["video", "podcast"], requiresRender: true  },
  { id: "profile",              label: "Profile",                 mediaKinds: ["video", "podcast", "voice", "animation"], requiresRender: false },
  // Podcast.
  { id: "rss",                  label: "RSS feed",                mediaKinds: ["podcast"],          requiresRender: true  },
  { id: "apple-podcasts",       label: "Apple Podcasts Connect",  mediaKinds: ["podcast"],          requiresRender: true  },
  { id: "spotify-creators",     label: "Spotify for Creators",    mediaKinds: ["podcast"],          requiresRender: true  },
  // Voice.
  { id: "voice-marketplace",    label: "Voice marketplace",       mediaKinds: ["voice"],            requiresRender: true  },
  { id: "profile-audio-embed",  label: "Profile audio embed",     mediaKinds: ["voice"],            requiresRender: true  },
  // Animation.
  { id: "giphy",                label: "Giphy",                   mediaKinds: ["animation"],        requiresRender: true  },
  { id: "tenor",                label: "Tenor",                   mediaKinds: ["animation"],        requiresRender: true  },
  { id: "r2-host",              label: "Hosted CDN link",         mediaKinds: ["animation"],        requiresRender: true  },
];

export function publishDestinationsFor(kind: MediaKind): PublishDestination[] {
  return PUBLISH_DESTINATIONS.filter((d) => d.mediaKinds.includes(kind));
}

// ─── Per-kind editor + save labels ───────────────────────────────────────────
//
// Tiny per-kind labels the UI surfaces in two places: the save menu's
// "Export …" verb and the project-card "kind" badge. Living here keeps
// the catalog free of `if mediaKind === "podcast"` string surgery.

export interface MediaKindUiHints {
  /** Verb the export item uses, e.g. "Export MP4" / "Export episode". */
  exportVerb: string;
  /** Short noun the project-card badge displays. */
  badgeLabel: string;
  /** Single-letter scoring icon hint for sparse-UI surfaces. */
  shortLabel: string;
}

export const MEDIA_KIND_UI: Record<MediaKind, MediaKindUiHints> = {
  video:     { exportVerb: "Export video",   badgeLabel: "Video",     shortLabel: "V" },
  podcast:   { exportVerb: "Export episode", badgeLabel: "Podcast",   shortLabel: "P" },
  voice:     { exportVerb: "Export audio",   badgeLabel: "Voice",     shortLabel: "A" },
  animation: { exportVerb: "Export loop",    badgeLabel: "Animation", shortLabel: "G" },
};
