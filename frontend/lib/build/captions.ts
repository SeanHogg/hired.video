/**
 * Captions — the pure half of the video's Captions track.
 *
 * Captions come from each scene's voiceover (`plan.scenes[id].voiceover`):
 * the words are cut into short chunks (`chunkCaptionText`) and timed across
 * the scene's narration — the voiceover clip's real length when one is laid
 * on the canvas, else the scene's length (`timeCaptionChunks`). The TTS path
 * returns no word timings, so chunks are timed by their share of the words.
 *
 * `withCaptions` lays the chunks onto the canvas as timed text widgets (and
 * mirrors them as `canvas.captions` cues), so the frame, the Preview and the
 * exported / posted video all show the same captions. The plan helpers
 * record the switch, the style and a reworded chunk (`plan.captions`).
 */
import {
  CAPTION_TEXT_MAX,
  VIDEO_SCENE_IDS,
  type CaptionPosition,
  type CaptionSize,
  type CaptionsPlan,
  type VideoPlan,
  type VideoSceneId,
} from "@shared/video-plan";
import type { CanvasCaptionCue, CanvasState, Widget } from "@/lib/studio/editor-v2/canvas-state";
import { canvasSceneId, voiceoverLayerId } from "./scene-voiceover";

/** A chunk reads in one glance: a short line, a handful of words. */
export const CAPTION_MAX_CHARS = 42;
export const CAPTION_MAX_WORDS = 7;
/** A scene without a clip: captions end this long before the cut. */
const SCENE_TAIL = 0.4;
/** Each chunk's share of the time: its characters plus a breath. */
const CHUNK_PAUSE_WEIGHT = 6;

export interface CaptionChunk {
  index: number;
  /** The derived wording (what an edit is keyed by). */
  from: string;
  /** What shows: the owner's rewording, else `from`. */
  text: string;
  edited: boolean;
  /** Seconds from the scene's start. */
  start: number;
  end: number;
}

export type SceneCaptions = Partial<Record<VideoSceneId, CaptionChunk[]>>;

/** Words → caption chunks: break at sentence ends (and at a comma once a
 *  chunk has a few words), else when a chunk would grow past the limits. */
export function chunkCaptionText(text: string, maxChars = CAPTION_MAX_CHARS, maxWords = CAPTION_MAX_WORDS): string[] {
  const words = text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.slice(0, CAPTION_TEXT_MAX));
  const chunks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) chunks.push(current.join(" "));
    current = [];
  };
  for (const word of words) {
    const length = current.length > 0 ? current.join(" ").length + 1 + word.length : word.length;
    if (current.length > 0 && (length > maxChars || current.length >= maxWords)) flush();
    current.push(word);
    if (/[.!?;:]["')\]]?$/.test(word) || (/,$/.test(word) && current.length >= 3)) flush();
  }
  flush();
  return chunks;
}

/** Chunks timed back to back across `span` seconds starting at `lead`,
 *  each for its share of the characters. */
export function timeCaptionChunks(chunks: readonly string[], span: number, lead = 0): Array<{ start: number; end: number }> {
  const weights = chunks.map((c) => c.length + CHUNK_PAUSE_WEIGHT);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || span <= 0) return chunks.map(() => ({ start: lead, end: lead }));
  let cursor = lead;
  return weights.map((w) => {
    const start = cursor;
    cursor += (w / total) * span;
    return { start: round(start), end: round(cursor) };
  });
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The words a scene's captions are made from, or null (switched off, no
 *  voiceover, or one uploaded file carries a voice we have no words for). */
function captionSource(plan: VideoPlan, id: VideoSceneId): string | null {
  if (plan.voice?.source === "upload") return null;
  const scene = plan.scenes?.[id];
  if (scene?.off) return null;
  return scene?.voiceover?.trim() || null;
}

/** Where a scene's narration plays: its clip (offset + length) when one is
 *  on the canvas, else the scene minus a short tail. */
function narrationWindow(canvas: CanvasState, id: VideoSceneId, sceneSeconds: number): { lead: number; span: number } {
  const clip = canvas.audioLayers.find((l) => l.id === voiceoverLayerId(id));
  if (clip && clip.durationSeconds > 0) {
    const lead = Math.max(0, Math.min(sceneSeconds, clip.startOffsetSec ?? 0));
    return { lead, span: Math.max(0, Math.min(clip.durationSeconds, sceneSeconds - lead)) };
  }
  return { lead: 0, span: Math.max(1, sceneSeconds - SCENE_TAIL) };
}

/** Every scene's caption chunks, timed and with the owner's edits applied. */
export function sceneCaptions(plan: VideoPlan, canvas: CanvasState): SceneCaptions {
  const out: SceneCaptions = {};
  for (const id of VIDEO_SCENE_IDS) {
    const text = captionSource(plan, id);
    const scene = canvas.scenes.find((s) => s.id === canvasSceneId(id));
    if (!text || !scene) continue;
    const chunks = chunkCaptionText(text);
    const { lead, span } = narrationWindow(canvas, id, scene.durationSeconds);
    const times = timeCaptionChunks(chunks, span, lead);
    const edits = [...(plan.captions?.edits?.[id] ?? [])];
    out[id] = chunks.map((from, index) => {
      const at = edits.findIndex((e) => e.from === from);
      const edit = at >= 0 ? edits.splice(at, 1)[0] : null;
      return { index, from, text: edit?.text ?? from, edited: edit !== null, ...times[index] };
    });
  }
  return out;
}

/** Type size as a share of the frame's short side. */
const SIZE_SHARE: Record<CaptionSize, number> = { s: 0.036, m: 0.046, l: 0.06 };
const BOX_X = 0.08;
const BOX_W = 0.84;
const BOX_PADDING = 12;
/** A caption sits above the scene's own one-line caption at the bottom. */
const BOTTOM_EDGE = 0.82;
const TOP_EDGE = 0.05;
const CAPTION_Z = 50;

/** Stable widget id, so a caption is never mistaken for scene text. */
export const captionWidgetId = (id: VideoSceneId, index: number): string => `build-${id}-cc-${index}`;
export const isCaptionWidgetId = (widgetId: string): boolean => /^build-[a-z]+-cc-\d+$/.test(widgetId);

export function captionStyle(plan: VideoPlan): { position: CaptionPosition; size: CaptionSize } {
  return { position: plan.captions?.position ?? "bottom", size: plan.captions?.size ?? "m" };
}

function captionWidget(canvas: CanvasState, id: VideoSceneId, chunk: CaptionChunk, plan: VideoPlan): Widget {
  const { position, size } = captionStyle(plan);
  const fontPx = Math.round(Math.min(canvas.width, canvas.height) * SIZE_SHARE[size]);
  const usable = canvas.width * BOX_W - BOX_PADDING * 2;
  const lines = Math.min(2, Math.max(1, Math.ceil((chunk.text.length * fontPx * 0.55) / usable)));
  const height = Math.min(0.3, (lines * fontPx * 1.3 + BOX_PADDING * 2) / canvas.height);
  const y = position === "top" ? TOP_EDGE : position === "middle" ? 0.5 - height / 2 : BOTTOM_EDGE - height;
  return {
    id: captionWidgetId(id, chunk.index),
    kind: "text",
    position: { x: BOX_X, y, width: BOX_W, height, z: CAPTION_Z, rotation: 0 },
    params: {
      kind: "text",
      data: { text: chunk.text, fontPx, color: "#FFFFFF", fontWeight: "bold", align: "center", background: null },
    },
    containerStyle: { backgroundColor: "rgba(0,0,0,0.62)", borderRadius: 14, padding: BOX_PADDING },
    visibleFrom: chunk.start,
    visibleTo: chunk.end,
    motion: null,
  };
}

/** The canvas with the captions on it when they're switched on: a timed
 *  text widget per chunk in its scene, plus the same cues on
 *  `canvas.captions` (a11y audit, subtitle export). The input is untouched. */
export function withCaptions(canvas: CanvasState, plan: VideoPlan): CanvasState {
  if (!plan.captions?.on) return canvas;
  const captions = sceneCaptions(plan, canvas);
  const cues: CanvasCaptionCue[] = [];
  let cursor = 0;
  const scenes = canvas.scenes.map((scene) => {
    const sceneStart = cursor;
    cursor += scene.durationSeconds;
    const id = VIDEO_SCENE_IDS.find((s) => canvasSceneId(s) === scene.id);
    const chunks = id ? captions[id] ?? [] : [];
    if (!id || chunks.length === 0) return scene;
    for (const c of chunks) cues.push({ start: round(sceneStart + c.start), end: round(sceneStart + c.end), text: c.text });
    return { ...scene, widgets: [...scene.widgets, ...chunks.map((c) => captionWidget(canvas, id, c, plan))] };
  });
  return { ...canvas, scenes, captions: { cues, style: "standard", enabled: true } };
}

// ── Plan helpers (one undo step each; an untouched video stores nothing) ──

function withCaptionsPlan(plan: VideoPlan, captions: CaptionsPlan): VideoPlan {
  const pruned: CaptionsPlan = { ...captions };
  if (!pruned.on) delete pruned.on;
  if (pruned.position === "bottom") delete pruned.position;
  if (pruned.size === "m") delete pruned.size;
  if (pruned.edits) {
    const edits = { ...pruned.edits };
    for (const id of VIDEO_SCENE_IDS) if (edits[id]?.length === 0) delete edits[id];
    if (Object.keys(edits).length > 0) pruned.edits = edits;
    else delete pruned.edits;
  }
  const { captions: _old, ...rest } = plan;
  return Object.keys(pruned).length > 0 ? { ...rest, captions: pruned } : rest;
}

export function setCaptionsOn(plan: VideoPlan, on: boolean): VideoPlan {
  return withCaptionsPlan(plan, { ...plan.captions, on });
}

export function setCaptionStyle(plan: VideoPlan, patch: Partial<{ position: CaptionPosition; size: CaptionSize }>): VideoPlan {
  return withCaptionsPlan(plan, { ...plan.captions, ...patch });
}

/** Reword one chunk; typing it back to the derived words (or clearing it)
 *  drops the edit. */
export function setCaptionEdit(plan: VideoPlan, id: VideoSceneId, from: string, text: string): VideoPlan {
  const wording = text.replace(/\s+/g, " ").trim().slice(0, CAPTION_TEXT_MAX);
  const others = (plan.captions?.edits?.[id] ?? []).filter((e) => e.from !== from);
  const list = wording && wording !== from ? [...others, { from, text: wording }] : others;
  return withCaptionsPlan(plan, { ...plan.captions, edits: { ...(plan.captions?.edits ?? {}), [id]: list } });
}
