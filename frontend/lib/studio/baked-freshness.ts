// baked-freshness.ts — single source of truth for "is the rendered MP4
// at `state.videoUrl` still in sync with the current script?". Both the
// unified <StudioPlayer/> (to choose baked-vs-live source) and the
// Publish-to-* buttons (to label "Publish" vs "Re-render & publish")
// read this — per the DRY rule the freshness rule lives in one place
// so player and button can never disagree.
//
// The hash is intentionally narrow: it covers only the parts that
// actually affect what a render would output (scene content, durations,
// theme, audio, captions, voiceover binding, branding). UI-only fields
// like `script._meta.savePipelineDisabled` are excluded so toggling
// "skip generate" doesn't pretend the baked video is stale.
//
// Hash is written by the render pipeline on successful upload (see
// `withBakedHash`) and read here. A miss means stale, not corrupt: the
// UI degrades gracefully to the live canvas path.
//
// NOTE on asset-URL-content drift: if a scene references an R2 image
// whose contents change at the same URL the hash won't notice and a
// stale baked video would be served. Tracked in the Gap Register.

import type { StudioProjectState } from "@/types/studio";
import type {
  AudioClip,
  CaptionConfig,
  SceneScript,
  VideoAudio,
  VideoScript,
  VoiceoverConfig,
} from "@/types/video-script";

/** Stable, render-affecting projection of a VideoScript. Only fields in
 *  here participate in the hash — adding a new render-affecting field
 *  here is the same checklist item as adding it to the renderer. */
interface HashableShape {
  v: number;
  video: {
    duration: number;
    fps: number;
    resolution: string;
    aspect: string;
    codec?: string;
    container?: string;
    audioCodec?: string;
    videoBitrate?: number;
    audioBitrate?: number;
    theme: {
      colors: string[];
      font: string;
      motion: string;
      transition: string;
      background: string;
      customBg?: string;
      customBgType?: string;
      filters?: Record<string, number>;
    };
    audio?: HashableAudio;
  };
  scenes: HashableScene[];
  voiceover: HashableVoiceover | null;
  captions: HashableCaptions | null;
  /** Pro-only "no intro/outro/watermark" toggle changes the rendered
   *  output, so it has to participate. Lives on the project state, not
   *  the script — passed in alongside the script. */
  removeBranding: boolean;
}

interface HashableAudio {
  track: string;
  label: string;
  volume: number;
  mix?: unknown;
  clips?: Array<Pick<AudioClip, "id" | "track" | "label" | "startSec" | "endSec" | "volume">>;
}

interface HashableScene {
  id: string;
  start: number;
  duration: number;
  type: string;
  inPoint?: number;
  outPoint?: number;
  sourceDuration?: number;
  transitionIn?: string;
  title?: string;
  subtitle?: string;
  text?: string | string[];
  items?: string[];
  skills?: string[];
  accentColor?: string;
  textColor?: string;
  cardBackgroundColor?: string;
  cardBorderColor?: string;
  backgroundImage?: string;
  backgroundMediaType?: string;
  overlayMediaUrl?: string;
  overlayMediaType?: string;
  overlayMediaPosition?: string;
  overlayMediaAnimation?: string;
  sceneAudio?: string;
  textAlign?: string;
  contentPosition?: string;
  imageAnimation?: string;
  effects?: Array<{ kind: string; params: Record<string, unknown> }>;
  sceneElements?: unknown[];
  animation?: unknown;
}

interface HashableVoiceover {
  enabled: boolean;
  engine?: string;
  voiceId: string;
  voiceName: string;
  speed: number;
  /** Per-scene audio URLs — when these change the rendered audio track
   *  changes too. Word timestamps are excluded (they're a side-product
   *  of synthesis, not an input). */
  sceneAudioUrls: Record<string, string | null>;
}

interface HashableCaptions {
  enabled: boolean;
  style: string;
  cues: Array<{ start: number; end: number; text: string }>;
}

const HASH_VERSION = 1;

/** djb2 — small, fast, stable across browsers. We don't need cryptographic
 *  strength: a freshness check just needs collision-resistance among the
 *  realistic distribution of script edits a single user makes. */
function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  // Mix with input length so a single-char trim still flips the hash.
  return `${HASH_VERSION}-${(hash >>> 0).toString(36)}-${input.length.toString(36)}`;
}

function projectAudio(audio: VideoAudio | undefined): HashableAudio | undefined {
  if (!audio) return undefined;
  return {
    track: audio.track,
    label: audio.label,
    volume: audio.volume,
    mix: audio.mix,
    clips: audio.clips?.map((c) => ({
      id: c.id,
      track: c.track,
      label: c.label,
      startSec: c.startSec,
      endSec: c.endSec,
      volume: c.volume,
    })),
  };
}

function projectScene(scene: SceneScript): HashableScene {
  return {
    id: scene.id,
    start: scene.start,
    duration: scene.duration,
    type: scene.type,
    inPoint: scene.inPoint,
    outPoint: scene.outPoint,
    sourceDuration: scene.sourceDuration,
    transitionIn: scene.transitionIn,
    title: scene.title,
    subtitle: scene.subtitle,
    text: scene.text,
    items: scene.items,
    skills: scene.skills,
    accentColor: scene.accentColor,
    textColor: scene.textColor,
    cardBackgroundColor: scene.cardBackgroundColor,
    cardBorderColor: scene.cardBorderColor,
    backgroundImage: scene.backgroundImage,
    backgroundMediaType: scene.backgroundMediaType,
    overlayMediaUrl: scene.overlayMediaUrl,
    overlayMediaType: scene.overlayMediaType,
    overlayMediaPosition: scene.overlayMediaPosition,
    overlayMediaAnimation: scene.overlayMediaAnimation,
    sceneAudio: scene.sceneAudio,
    textAlign: scene.textAlign,
    contentPosition: scene.contentPosition,
    imageAnimation: scene.imageAnimation,
    effects: scene.effects?.map((e) => ({ kind: e.kind, params: e.params ?? {} })),
    sceneElements: scene.sceneElements,
    animation: scene.animation,
  };
}

function projectVoiceover(vo: VoiceoverConfig | null | undefined): HashableVoiceover | null {
  if (!vo) return null;
  const sceneAudioUrls: Record<string, string | null> = {};
  for (const [sceneId, entry] of Object.entries(vo.scenes ?? {})) {
    sceneAudioUrls[sceneId] = entry?.audioUrl ?? null;
  }
  return {
    enabled: vo.enabled,
    engine: vo.engine,
    voiceId: vo.voiceId,
    voiceName: vo.voiceName,
    speed: vo.speed,
    sceneAudioUrls,
  };
}

function projectCaptions(caps: CaptionConfig | null | undefined): HashableCaptions | null {
  if (!caps) return null;
  return {
    enabled: caps.enabled,
    style: caps.style,
    cues: caps.cues.map((c) => ({ start: c.start, end: c.end, text: c.text })),
  };
}

/** Stable JSON: sorts object keys top-down so insertion-order changes
 *  don't perturb the hash. Arrays preserve order (ordering IS meaningful
 *  for scenes and cues). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${parts.join(",")}}`;
}

export interface HashInput {
  script: VideoScript;
  /** Pro-only branding-removal toggle from project state. Affects the
   *  rendered output, so it has to participate in the hash. */
  removeBranding?: boolean;
  voiceover?: VoiceoverConfig | null;
  captions?: CaptionConfig | null;
}

/** Compute a stable, render-affecting hash of a script. */
export function computeScriptHash(input: HashInput): string {
  const { script } = input;
  const shape: HashableShape = {
    v: HASH_VERSION,
    video: {
      duration: script.video.duration,
      fps: script.video.fps,
      resolution: script.video.resolution,
      aspect: script.video.aspect,
      codec: script.video.codec,
      container: script.video.container,
      audioCodec: script.video.audioCodec,
      videoBitrate: script.video.videoBitrate,
      audioBitrate: script.video.audioBitrate,
      theme: {
        colors: script.video.theme.colorPalette,
        font: script.video.theme.fontFamily,
        motion: script.video.theme.motion,
        transition: script.video.theme.transition,
        background: script.video.theme.background,
        customBg: script.video.theme.customBackground,
        customBgType: script.video.theme.customBackgroundType,
        filters: script.video.theme.filters as Record<string, number> | undefined,
      },
      audio: projectAudio(script.video.audio),
    },
    scenes: script.scenes.map(projectScene),
    voiceover: projectVoiceover(input.voiceover),
    captions: projectCaptions(input.captions),
    removeBranding: input.removeBranding === true,
  };
  return djb2(stableStringify(shape));
}

/** Stamp the hash onto a script's `_meta` so subsequent freshness
 *  checks compare like-with-like. Pure — caller persists. */
export function withBakedHash(script: VideoScript, hash: string): VideoScript {
  return {
    ...script,
    _meta: {
      ...(script._meta ?? {}),
      bakedHash: hash,
    },
  };
}

/** True iff the project has a hosted video URL whose recorded hash
 *  matches the script's current hash. Single source consulted by the
 *  player AND the Publish buttons — UI labels can't drift from what
 *  the player actually mounts. */
export function isBakedFresh(state: Pick<StudioProjectState, "script" | "videoUrl" | "voiceover" | "captions"> & {
  removeBranding?: boolean;
}): boolean {
  if (!state.videoUrl) return false;
  if (!state.script) return false;
  const stamped = state.script._meta?.bakedHash;
  if (!stamped) return false;
  const current = computeScriptHash({
    script: state.script,
    voiceover: state.voiceover,
    captions: state.captions,
    removeBranding: state.removeBranding,
  });
  return stamped === current;
}

/** What the unified <StudioPlayer/> should mount. The player calls this
 *  itself — consumers pass project state, not a `useBaked` boolean. */
export type PlayerSource =
  | { kind: "baked"; url: string }
  | { kind: "live" };

export function pickPlayerSource(
  state: Pick<StudioProjectState, "script" | "videoUrl" | "voiceover" | "captions"> & {
    removeBranding?: boolean;
  },
): PlayerSource {
  if (state.videoUrl && isBakedFresh(state)) {
    return { kind: "baked", url: state.videoUrl };
  }
  return { kind: "live" };
}
