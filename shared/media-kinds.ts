/**
 * Studio Media Kinds — single source of truth for the CANVAS-RUNTIME axis
 * of every studio project / template.
 *
 * The studio is a canvas product. `mediaKind` is the first-class
 * extensibility hook — it picks (1) which canvas runtime mounts in the
 * editor, (2) the toolset that runtime exposes, (3) the project-row
 * metadata, and (4) the save / export / publish pipeline. The Timeline
 * (`shared/timeline.ts`) happens to be the canvas runtime for every
 * shipping kind today (video / podcast / voice / animation) because
 * they're all time-based composition — but `image`, `cad`, `game`,
 * `interactive_comic`, `animated_film`, `xr_scene`, `3d_model` are all
 * legitimate kinds with their own canvas runtimes on the roadmap (see
 * Consolidated Gap Register entries #927 / #929 / #930 / #931 / #932).
 *
 * Distinct from `studio_projects.kind: 'scene' | 'nle'` which is a STORAGE
 * discriminator (which JSONB column to read for the Timeline runtime
 * today; future canvas runtimes add their own kind values pointing at
 * `game_state` / `cad_state` / `image_state` / etc. columns).
 *
 * Scene shape varies per runtime — time-based kinds use N scenes for N
 * time slices; static-output kinds (image, cad) are single-scene (the
 * workspace IS the scene); interactive kinds (game, comic) use scenes
 * as state-graph nodes. The shared editor shell (title / save / export /
 * AI assistant / layers chrome) stays — the center canvas swaps.
 *
 * Used everywhere the editor / template catalog / save menu / API need
 * a per-kind decision:
 *   • Frontend templates/catalog: per-template `mediaKind` field
 *   • Frontend StudioSaveMenuV2: gates which Export / Publish rows render
 *   • Frontend `deriveKindDefaults`: which editor tab / panel auto-opens
 *   • Frontend render facade: derives container + mime from output profile
 *   • Future `<CanvasRouter mediaKind/>` (#931): dispatches to the right runtime
 *   • API: studio_projects.media_kind column + zod request validation
 *   • Marketing landing pages (#900/#901): "Exports as MP4 / MP3+RSS / GIF / STL / PNG"
 *
 * Per the standing DRY rule (`feedback_extract_on_duplication`): every
 * consumer reads from this module. NEVER prop-drill a `canPublishToYouTube`
 * boolean — components self-gate by calling `outputProfilesFor(mediaKind)`
 * and `publishDestinationsFor(mediaKind)` directly.
 *
 * Adding a new mediaKind means: (1) edit this one record (enum + UI hints
 * + output profiles + publish destinations); (2) ALTER the CHECK constraint
 * migration on `studio_projects.media_kind`; (3) ship a canvas runtime
 * (or extend the Timeline runtime if the kind is time-based); (4) wire
 * the new JSONB state column. The zod schema, the TypeScript type, the
 * export menu, and the canvas router all derive from #1 automatically.
 */

export const MEDIA_KINDS = [
  "video",
  "podcast",
  "voice",
  "animation",
  "game",
  "comic",
  "interactive_comic",
  "image",
  "cad",
  "cad_3d",
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

export const DEFAULT_MEDIA_KIND: MediaKind = "video";

/** Whether the kind produces audible output. Games are runtime-rendered
 *  and almost always have sound — counted as `true` so the editor
 *  surfaces the audio asset workflow alongside sprite / level work.
 *  Comics carry optional narration / motion-comic voiceover so the same
 *  voiceover dialog the editor already ships works on them. `image` is
 *  a still raster — never audible. */
export function mediaKindHasAudio(kind: MediaKind): boolean {
  return (
    kind === "video" ||
    kind === "podcast" ||
    kind === "voice" ||
    kind === "game" ||
    kind === "comic" ||
    kind === "interactive_comic"
  );
}

/** Whether the kind produces visible frames. Games render visually so
 *  this is `true`; only audio-only kinds (`podcast` without a video
 *  branch, `voice`) return `false`. Comics render visually (pages of
 *  panels) — the rasterized export is a sequence of frames. `image` is
 *  visible but static — a single frame, not a sequence — so it is NOT
 *  in this set; downstream code that gates on `hasVideo` is asking
 *  about time-based visual frames (video-track UI, scrubber, playhead),
 *  none of which apply to a single still raster. */
export function mediaKindHasVideo(kind: MediaKind): boolean {
  return (
    kind === "video" ||
    kind === "animation" ||
    kind === "game" ||
    kind === "comic" ||
    kind === "interactive_comic"
  );
}

/** Whether the kind permits both audio + video tracks (a podcast may
 *  optionally carry a video feed — the "video podcast" branch). Games
 *  are NOT in this set because game audio doesn't live on Timeline a1/a2
 *  tracks — it's runtime-loaded asset playback via the game engine. */
export function mediaKindCanHaveBoth(kind: MediaKind): boolean {
  return kind === "video" || kind === "podcast";
}

/** Whether the kind's canvas runtime is the Timeline (the default for
 *  time-based composition kinds). Game / comic / image / cad return
 *  `false` because they mount their own canvas runtime via the
 *  `<CanvasRouter mediaKind/>` dispatch — see PRD §1.2. Comics reuse
 *  the V2 editor's `CanvasState` for authoring (scenes = pages) but the
 *  preview / reader / export pipeline is a non-Timeline runtime (panel
 *  reveals on scroll, page turns, static-strip rasterizer).
 *
 *  @deprecated The name conflates the export-pipeline question with the
 *  authoring-surface question (#936). Use `mediaKindUsesTimelineExport`
 *  for the former and `mediaKindUsesCanvasStateAuthoring` for the
 *  latter. Kept as a thin alias for the existing call sites until they
 *  migrate. */
export function mediaKindUsesTimelineRuntime(kind: MediaKind): boolean {
  return mediaKindUsesTimelineExport(kind);
}

/** Whether the kind's render facade emits a Timeline-shaped output
 *  (frames per second + audio track → MP4 / MP3 / GIF / WebM). Closes
 *  the export-pipeline half of the predicate split tracked in #936:
 *  game / comic / image / animation bundle their own export pipelines
 *  (HTML5 ZIP, PDF / CBZ / PNG strip, PNG / JPG / SVG, GIF89a / APNG /
 *  WebP) — they do NOT ride the ffmpeg.wasm / WebCodecs path the
 *  Timeline runtime uses. */
export function mediaKindUsesTimelineExport(kind: MediaKind): boolean {
  return (
    kind !== "game" &&
    kind !== "comic" &&
    kind !== "interactive_comic" &&
    kind !== "image" &&
    kind !== "animation" &&
    kind !== "cad" &&
    kind !== "cad_3d"
  );
}

/** Whether the kind authors via the v2 editor's `CanvasState` shape
 *  (scenes + widgets) and therefore needs the v2 editor's Timeline-
 *  shaped chrome: ScenesRail, WidgetPalette, TimelineDock, playback
 *  scrubber + Preview overlay, Properties panel. Closes the authoring-
 *  surface half of the predicate split tracked in #936.
 *
 *  Returns:
 *   - `true`  for video / podcast / voice / comic — comics author via
 *               CanvasState (pages = scenes, panels = widgets) even
 *               though their export pipeline is non-Timeline. This is
 *               the asymmetry that motivated #936.
 *   - `false` for game / image / animation — these kinds mount their
 *               own canvas runtimes (`<GameStage>` / `<DrawingStage>`
 *               / `<AnimationStage>`) which own their own state shape,
 *               inspectors, and toolbars. The Timeline shell is
 *               irrelevant chrome and was confusing users (Scene 1 /
 *               Duration / Widgets palette / Timeline scrubber all
 *               surfaced for a memory-match game).
 *  Future runtimes (cad / 3d_model) → false. */
export function mediaKindUsesCanvasStateAuthoring(kind: MediaKind): boolean {
  return (
    kind !== "game" &&
    kind !== "image" &&
    kind !== "animation" &&
    kind !== "cad" &&
    kind !== "cad_3d"
  );
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
  | "apng"
  // Game runtime bundles — not media containers per se, but they ride
  // the same OutputProfile shape so the save-menu doesn't need a
  // per-kind branch. The export facade reads the profile id to
  // dispatch to the game-export pipeline.
  | "html5-bundle"
  | "web-embed"
  // Comic exports — same OutputProfile shape so the save-menu code path
  // stays uniform. `png-strip` is a tall vertical strip (one PNG, every
  // page stacked); `pdf` is a paginated PDF; `cbz` is the comic-archive
  // ZIP format readers understand. Motion comics also export to the
  // existing animation containers (gif/webp/mp4) via separate profiles.
  | "png-strip"
  | "pdf"
  | "cbz"
  // Image runtime — Photoshop-shaped raster authoring (#932). Single-
  // frame static exports; the same OutputProfile shape lets the save
  // menu render them without a per-kind branch.
  | "png"
  | "jpg"
  | "svg"
  // CAD runtime — 2D vector drafting (#930). Standard CAD exchange
  // formats. DXF + DWG are the AutoCAD-family lingua franca; STL +
  // STEP land alongside the future 3D modeling branch.
  | "dxf"
  | "dwg"
  | "stl"
  | "step"
  // Photoshop round-trip via ag-psd (#940 Phase 2).
  | "psd";

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

  // ─── Game ──────────────────────────────────────────────────────────────────
  // Container/codec fields don't map onto game outputs — they're runtime
  // bundles, not media files. We still expose them via the same
  // `OutputProfile` shape so the save-menu and publish surfaces don't
  // need a per-kind branch; videoCodec/audioCodec stay null and the
  // container carries the bundle format. The render facade reads the
  // `id` to dispatch to the game-export pipeline once it ships.
  {
    id: "game-html5-bundle",
    label: "HTML5 bundle (ZIP)",
    hint: "Self-contained · drop on any web host",
    mediaKind: "game",
    container: "html5-bundle",
    mime: "application/zip",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".zip",
  },
  {
    id: "game-itch-zip",
    label: "itch.io ZIP",
    hint: "Pre-formatted for itch.io HTML5 upload",
    mediaKind: "game",
    container: "html5-bundle",
    mime: "application/zip",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".zip",
  },
  {
    id: "game-web-embed",
    label: "Web embed (iframe URL)",
    hint: "Hosted on hired.video · embeddable anywhere",
    mediaKind: "game",
    container: "web-embed",
    mime: "text/html",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: "",
  },

  // ─── Comic ─────────────────────────────────────────────────────────────────
  // Comics render as a sequence of pages of panels. The static exports
  // are the canonical artefacts (PNG strip / PDF / CBZ); motion-comic
  // exports reuse the animation containers (MP4 / GIF / WebP) since the
  // page-reveal pipeline is structurally an animation.
  {
    id: "comic-png-strip",
    label: "PNG strip",
    hint: "Tall vertical · social-ready · scrollable",
    mediaKind: "comic",
    container: "png-strip",
    mime: "image/png",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".png",
  },
  {
    id: "comic-pdf",
    label: "PDF (paginated)",
    hint: "One page per comic page · printable",
    mediaKind: "comic",
    container: "pdf",
    mime: "application/pdf",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".pdf",
  },
  {
    id: "comic-cbz",
    label: "CBZ archive",
    hint: "Comic-reader format · Pro",
    mediaKind: "comic",
    container: "cbz",
    mime: "application/vnd.comicbook+zip",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".cbz",
  },
  {
    id: "comic-motion-mp4",
    label: "Motion comic (MP4)",
    hint: "Panel reveals + narration · share on socials",
    mediaKind: "comic",
    container: "mp4",
    mime: "video/mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    proOnly: false,
    fileExt: ".mp4",
  },
  {
    id: "comic-motion-gif",
    label: "Motion comic (GIF)",
    hint: "Looping reveal · no audio · universal",
    mediaKind: "comic",
    container: "gif",
    mime: "image/gif",
    videoCodec: "gif",
    audioCodec: null,
    proOnly: false,
    fileExt: ".gif",
  },

  // ─── Image (Photoshop-shaped raster authoring — #932) ──────────────────────
  // Single static frame; no time axis, no audio. The DrawingStage
  // composites the layered `ImageState` to a flat raster at export time
  // via the standard browser canvas-2D → Blob path (no ffmpeg).
  {
    id: "image-png",
    label: "PNG",
    hint: "Lossless · transparent",
    mediaKind: "image",
    container: "png",
    mime: "image/png",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".png",
  },
  {
    id: "image-jpg",
    label: "JPEG",
    hint: "Smaller · no transparency",
    mediaKind: "image",
    container: "jpg",
    mime: "image/jpeg",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".jpg",
  },
  {
    id: "image-webp",
    label: "WebP",
    hint: "Smaller than PNG · supports alpha",
    mediaKind: "image",
    container: "webp",
    mime: "image/webp",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".webp",
  },
  {
    id: "image-psd",
    label: "PSD",
    hint: "Photoshop · layers preserved",
    mediaKind: "image",
    container: "psd",
    mime: "image/vnd.adobe.photoshop",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".psd",
  },

  // ─── CAD (2D drafting MVP — #930) ──────────────────────────────────────────
  // Vector drafting; no time axis, no audio. The CadStage emits SVG +
  // PDF directly from the shape list. DXF + DWG + STL + STEP are
  // industry-standard CAD exchange formats — initial scaffold registers
  // the slots; the encoder bodies ship behind these ids when the
  // CAD-export pipeline matures past the Phase 1 scaffold.
  {
    id: "cad-svg",
    label: "SVG",
    hint: "Vector · widest support",
    mediaKind: "cad",
    container: "svg",
    mime: "image/svg+xml",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".svg",
  },
  {
    id: "cad-pdf",
    label: "PDF",
    hint: "Print-ready · paginated",
    mediaKind: "cad",
    container: "pdf",
    mime: "application/pdf",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".pdf",
  },
  {
    id: "cad-dxf",
    label: "DXF",
    hint: "AutoCAD exchange · Pro",
    mediaKind: "cad",
    container: "dxf",
    mime: "application/dxf",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".dxf",
  },
  {
    id: "cad-png",
    label: "PNG",
    hint: "Raster preview · social-share",
    mediaKind: "cad",
    container: "png",
    mime: "image/png",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".png",
  },
  {
    id: "cad-stl",
    label: "STL",
    hint: "3D-printable · ASCII",
    mediaKind: "cad",
    container: "stl",
    mime: "model/stl",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".stl",
  },
  {
    id: "cad-step",
    label: "STEP",
    hint: "ISO 10303 · interoperable",
    mediaKind: "cad",
    container: "step",
    mime: "model/step",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".step",
  },
  // Interactive Comic (#929) — same exporters as linear comic (CBZ /
  // PDF / PNG-strip) plus a JSON bundle that captures the page graph
  // for the reader runtime. The reader resolves branches at runtime;
  // print-style exports walk a deterministic "first valid branch"
  // path so the static artefact still renders the comic as a strip.
  {
    id: "interactive-comic-cbz",
    label: "CBZ",
    hint: "Comic archive · linear flatten",
    mediaKind: "interactive_comic",
    container: "cbz",
    mime: "application/vnd.comicbook+zip",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".cbz",
  },
  {
    id: "interactive-comic-pdf",
    label: "PDF",
    hint: "Print-ready · linear flatten",
    mediaKind: "interactive_comic",
    container: "pdf",
    mime: "application/pdf",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".pdf",
  },
  // CAD 3D (#930 follow-on) — STL / STEP / glTF. The 3D runtime
  // emits STL today via its triangulated mesh, STEP for downstream
  // BREP-aware tools, and PNG renders for thumbnails.
  {
    id: "cad-3d-stl",
    label: "STL",
    hint: "3D-printable · binary",
    mediaKind: "cad_3d",
    container: "stl",
    mime: "model/stl",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".stl",
  },
  {
    id: "cad-3d-step",
    label: "STEP",
    hint: "ISO 10303 · interoperable",
    mediaKind: "cad_3d",
    container: "step",
    mime: "model/step",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".step",
  },
  {
    id: "cad-3d-png",
    label: "PNG",
    hint: "Render · social-share",
    mediaKind: "cad_3d",
    container: "png",
    mime: "image/png",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".png",
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
  | "r2-host"
  // Game
  | "itch-io"
  | "github-pages"
  | "game-web-embed"
  // Comic
  | "comic-reader"
  | "webtoon-feed"
  | "tapas-feed"
  // Image (#932) — once exported the raster also lands in the creator's
  // R2 asset library so it's one click away from any other studio
  // project (the closed-loop interop tracked in #933). `profile-gallery`
  // is the creator's public image gallery surface.
  | "profile-gallery"
  | "asset-library"
  // CAD (#930) — `cad-gallery` is the no-render-required gallery
  // surface; `cad-asset-library` writes the flattened SVG/PDF into
  // R2 so other projects can reference it via MediaPicker.
  | "cad-gallery"
  | "cad-asset-library"
  // Training / e-learning (#160) — attaches the project to a course
  // as `sourceType: studio_video`. Available for every time-based kind.
  | "course-lesson";

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
  { id: "profile",              label: "Profile",                 mediaKinds: ["video", "podcast", "voice", "animation", "comic"], requiresRender: false },
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
  // Game.
  { id: "itch-io",              label: "itch.io",                 mediaKinds: ["game"],             requiresRender: true  },
  { id: "github-pages",         label: "GitHub Pages",            mediaKinds: ["game"],             requiresRender: true  },
  { id: "game-web-embed",       label: "Embed on hired.video",    mediaKinds: ["game"],             requiresRender: true  },
  // Comic — `comic-reader` hosts a scrollable reader on hired.video and
  // is the no-render-required default (the live canvas IS the reader).
  // The Webtoon / Tapas rows ride the same publish pipeline as the
  // social-share surfaces; the editor maps each id to its destination
  // adapter at the call site.
  { id: "comic-reader",         label: "Hired.video reader",      mediaKinds: ["comic"],            requiresRender: false },
  { id: "webtoon-feed",         label: "Webtoon (manual upload)", mediaKinds: ["comic"],            requiresRender: true  },
  { id: "tapas-feed",           label: "Tapas (manual upload)",   mediaKinds: ["comic"],            requiresRender: true  },
  // Image (#932) — the gallery is the no-render-required default (the
  // live canvas already renders); asset-library writes the flattened
  // PNG into R2 under the creator's namespace so it can be picked up
  // by any other studio project via MediaPicker (#933).
  { id: "profile-gallery",      label: "Profile gallery",         mediaKinds: ["image"],            requiresRender: false },
  { id: "asset-library",        label: "Save to asset library",   mediaKinds: ["image"],            requiresRender: true  },
  // CAD (#930) — gallery is the no-render default (live canvas);
  // `cad-asset-library` writes the rendered drawing to R2 so it can
  // be picked up by other studio projects via MediaPicker.
  { id: "cad-gallery",          label: "Profile gallery",         mediaKinds: ["cad"],              requiresRender: false },
  { id: "cad-asset-library",    label: "Save to asset library",   mediaKinds: ["cad"],              requiresRender: true  },
  // Training / e-learning (#160). The course picker mounts a list of
  // the author's draft courses; "Save as Course Lesson" attaches the
  // current project as `sourceType: studio_video`. Available for every
  // time-based kind; not for image / cad / game.
  { id: "course-lesson",        label: "Save as Course Lesson",   mediaKinds: ["video", "podcast", "voice", "animation", "comic"], requiresRender: false },
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
  /**
   * Verb the wizard "Done" CTA uses. CanvasState-authoring kinds
   * (video / podcast / comic) say "Generate <noun>" because the wizard
   * actually fires an LLM scene/panel generator; non-CanvasState kinds
   * (voice / animation / game / image / cad) say "Create <noun>" because
   * the wizard just seeds a template — no AI round-trip.
   */
  createVerb: string;
}

export const MEDIA_KIND_UI: Record<MediaKind, MediaKindUiHints> = {
  video:     { exportVerb: "Export video",   badgeLabel: "Video",     shortLabel: "V", createVerb: "Generate video"     },
  podcast:   { exportVerb: "Export episode", badgeLabel: "Podcast",   shortLabel: "P", createVerb: "Generate podcast"   },
  voice:     { exportVerb: "Export audio",   badgeLabel: "Voice",     shortLabel: "A", createVerb: "Create voice clip"  },
  animation: { exportVerb: "Export loop",    badgeLabel: "Animation", shortLabel: "L", createVerb: "Create animation"   },
  game:      { exportVerb: "Export game",    badgeLabel: "Game",      shortLabel: "G", createVerb: "Create game"        },
  comic:     { exportVerb: "Export comic",   badgeLabel: "Comic",     shortLabel: "C", createVerb: "Generate comic"     },
  // `image` is the single-frame canvas runtime (#929) — single scene,
  // no time axis, exports as PNG/JPG/SVG. The hint lives here so
  // `Record<MediaKind, …>` typing is total even before the runtime ships.
  image:     { exportVerb: "Export image",   badgeLabel: "Image",     shortLabel: "I", createVerb: "Create image"       },
  // `cad` is the 2D drafting runtime (#930). Static vector output;
  // exports as SVG/PDF/DXF/PNG.
  cad:       { exportVerb: "Export drawing", badgeLabel: "CAD",       shortLabel: "D", createVerb: "Create drawing"     },
  // `cad_3d` is the 3D modelling runtime (#930 follow-on). Triangulated
  // mesh exports as STL / STEP / PNG. BREP analytic surfaces land when
  // the replicad kernel is wired through the editor.
  cad_3d:    { exportVerb: "Export model",   badgeLabel: "3D",        shortLabel: "M", createVerb: "Create 3D model"    },
  // `interactive_comic` is the branching comic runtime (#929). Pages
  // are CanvasState scenes; the branching graph rides in
  // interactiveComicState. Exports CBZ / PDF via a "first valid branch"
  // linear walk; reader runtime resolves choices live.
  interactive_comic: { exportVerb: "Export comic", badgeLabel: "Comic+", shortLabel: "B", createVerb: "Create interactive comic" },
};
