/**
 * Video plan — the owner's choices for the résumé video, stored WITH the
 * résumé at `content.meta.video` so the page and the video are one project:
 * one save, one undo stack, one draft.
 *
 * The video itself is derived from the résumé (frontend
 * lib/build/video-outline.ts). The plan only records what the owner changed:
 * a scene switched off, its length, its look, the roles the Proof scene
 * shows, or wording that differs from the page (an "unlinked" scene). An
 * empty plan is the default video. Shared because the kit chat model may
 * edit it; the server validates its output against this schema.
 */
import { z } from "zod";
import { VIDEO_ASPECTS, VideoTargetingSchema } from "./video-targeting.js";
import { VIDEO_THEME_IDS, type VideoThemeId } from "./video-themes.js";

/** Scenes in play order. Proof is built from Work Experience and shows the
 *  résumé page beside it (the former separate "Résumé" scene merged in). */
export const VIDEO_SCENE_IDS = ["hook", "who", "proof", "skills", "next"] as const;
export type VideoSceneId = (typeof VIDEO_SCENE_IDS)[number];

/** Colour looks a scene can take (gradients defined in video-composition). */
export const VIDEO_LOOK_IDS = ["violet", "ocean", "ember", "forest", "midnight", "rose"] as const;
export type VideoLookId = (typeof VIDEO_LOOK_IDS)[number];

export const SCENE_SECONDS_MIN = 3;
export const SCENE_SECONDS_MAX = 12;
/** Roles the Proof scene's résumé page has room for. */
export const PROOF_ROLES_MAX = 4;
export const SCENE_LINES_MAX = 3;
const TEXT_MAX = 160;
const VOICEOVER_MAX = 600;
const WIDGET_ID_MAX = 120;
const WIDGET_TEXT_MAX = 400;
/** Widgets the owner may drop into one scene. */
export const ADDED_WIDGETS_MAX = 30;

/** Upper bound on the JSON size of one look edit (params patch / effects),
 *  so a pasted data URL can't bloat the résumé row. */
export const WIDGET_LOOK_JSON_MAX = 4000;
const fitsLookBudget = (value: unknown): boolean => JSON.stringify(value).length <= WIDGET_LOOK_JSON_MAX;

/** Effect chain entry (frontend canvas-state `Widget.effects` / scene `effects`). */
export const WIDGET_EFFECTS_MAX = 12;
const WidgetEffectSchema = z.looseObject({
  kind: z.string().max(60),
  params: z.record(z.string().max(60), z.unknown()),
});

// ── Scene look overrides (scene inspector › Advanced drill-ins, #2351d) ──
// Every field is optional, so plans saved before these existed still parse.
// The option lists mirror the studio catalogs (frontend lib/studio
// visual-themes / video-filters / motion-presets / font-catalog), which the
// drill-ins mount; video-composition applies each one to the scene.

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const hexColor = z.string().regex(HEX_COLOR);

/** The studio's background preset encoding: "kind:#hex[:#hex]". */
export const SCENE_BACKGROUND_PATTERN = /^(solid|gradient|particles|dark-tech-grid):#[0-9a-fA-F]{6}(:#[0-9a-fA-F]{6})?$/;

/** Colour grading (frontend lib/studio/video-filters `VideoFilters`). */
export const SceneFiltersSchema = z
  .object({
    brightness: z.number().min(0).max(2),
    contrast: z.number().min(0).max(2),
    saturation: z.number().min(0).max(2),
    hue: z.number().min(-180).max(180),
    blur: z.number().min(0).max(10),
    warmth: z.number().min(-1).max(1),
  })
  .strict();
export type SceneFilters = z.infer<typeof SceneFiltersSchema>;

/** Transition into a scene (motion-presets `TransitionKind`). */
export const SCENE_TRANSITION_IDS = ["cut", "fade", "slide", "cinematic-fade"] as const;
export type SceneTransitionId = (typeof SCENE_TRANSITION_IDS)[number];
/** How much the scene moves (motion-presets `MotionStyle`). */
export const SCENE_MOTION_IDS = ["minimal", "moderate", "cinematic"] as const;
export type SceneMotionId = (typeof SCENE_MOTION_IDS)[number];
export const SCENE_NOTES_MAX = 1000;

const SCENE_OVERRIDE_FIELDS = {
  /** The scene's ground (a background preset value); absent = its palette's gradient. */
  background: z.string().max(40).regex(SCENE_BACKGROUND_PATTERN).optional(),
  filters: SceneFiltersSchema.optional(),
  effects: z.array(WidgetEffectSchema).max(WIDGET_EFFECTS_MAX).refine(fitsLookBudget).optional(),
  transitionIn: z.enum(SCENE_TRANSITION_IDS).optional(),
  /** Director's notes: never on screen; the AI rewrite follows them. */
  notes: z.string().max(SCENE_NOTES_MAX).optional(),
  /** Colours over the look / theme (any subset). */
  palette: z.object({ from: hexColor.optional(), to: hexColor.optional(), accent: hexColor.optional() }).strict().optional(),
  /** A font-catalog id (unknown ids fall back to the default type). */
  font: z.string().max(40).regex(/^[a-z0-9-]+$/).optional(),
  motion: z.enum(SCENE_MOTION_IDS).optional(),
};
export type SceneOverrideKey = keyof typeof SCENE_OVERRIDE_FIELDS;
export const SCENE_OVERRIDE_KEYS = Object.keys(SCENE_OVERRIDE_FIELDS) as SceneOverrideKey[];

/** Export settings (studio Export: resolution tier, frame rate, codec). */
export const EXPORT_RESOLUTIONS = ["720p", "1080p", "4k"] as const;
export type ExportResolution = (typeof EXPORT_RESOLUTIONS)[number];
export const EXPORT_FPS = [24, 30, 60] as const;
export type ExportFps = (typeof EXPORT_FPS)[number];
/** The codecs the in-browser render encodes: H.264 / HEVC / VP9 on WebCodecs
 *  (MP4), ProRes / DNxHD on ffmpeg.wasm (MOV). The codec shapes the DOWNLOAD
 *  only — posting always renders H.264 MP4 (shared/timeline timelineForPosting). */
export const EXPORT_CODECS = ["h264", "h265", "vp9", "prores", "dnxhd"] as const;
export type ExportCodec = (typeof EXPORT_CODECS)[number];
export const VideoExportSchema = z
  .object({
    resolution: z.enum(EXPORT_RESOLUTIONS).optional(),
    fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).optional(),
    codec: z.enum(EXPORT_CODECS).optional(),
  })
  .strict();
export type VideoExport = z.infer<typeof VideoExportSchema>;
// ── end Scene look overrides ─────────────────────────────────────────────

export const ScenePlanSchema = z
  .object({
    ...SCENE_OVERRIDE_FIELDS,
    /** Left out of the video. */
    off: z.boolean().optional(),
    duration: z.number().int().min(SCENE_SECONDS_MIN).max(SCENE_SECONDS_MAX).optional(),
    look: z.enum(VIDEO_LOOK_IDS).optional(),
    /** Unlinked wording (the page's text no longer flows into the scene). */
    title: z.string().max(TEXT_MAX).optional(),
    lines: z.array(z.string().max(TEXT_MAX)).max(SCENE_LINES_MAX).optional(),
    /** Proof only: work item keys (`workItemKey`) to show, in order. */
    roles: z.array(z.string().max(80)).max(PROOF_ROLES_MAX).optional(),
    /** What the narrator says over this scene (voiceover script). */
    voiceover: z.string().max(VOICEOVER_MAX).optional(),
    /** The owner's own recorded take for this scene (Voice › Record my own). */
    voiceClip: z
      .object({ url: z.string().url().max(2000), durationSeconds: z.number().min(0).max(120) })
      .strict()
      .optional(),
  })
  .strict();
export type ScenePlan = z.infer<typeof ScenePlanSchema>;

const LOOK_STRING_MAX = 120;

/** One enter / exit phase of a widget's motion (frontend widget-motion.ts).
 *  Plain (stripping) objects: unknown keys are dropped, not rejected, and the
 *  inferred type stays assignable to the canvas's own interfaces. */
const MotionPhaseSchema = z.object({
  kind: z.string().max(40),
  durationSeconds: z.number().min(0).max(30),
  easing: z.string().max(40),
});

/** Container chrome (frontend canvas-state `ContainerStyle`). */
const ContainerStyleSchema = z.object({
  backgroundColor: z.string().max(LOOK_STRING_MAX).optional(),
  borderColor: z.string().max(LOOK_STRING_MAX).optional(),
  borderWidth: z.number().min(0).max(200).optional(),
  borderRadius: z.number().min(0).max(2000).optional(),
  padding: z.number().min(0).max(2000).optional(),
});

/** A hand edit to one widget of the derived canvas (frontend
 *  lib/build/canvas-overrides.ts applies it). Position uses the canvas's
 *  `WidgetPosition` units: fractions of the canvas (0..1), z order, degrees. */
export const WidgetOverrideSchema = z
  .object({
    position: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        z: z.number().optional(),
        rotation: z.number().optional(),
      })
      .strict()
      .optional(),
    /** Seconds from scene start; null = the whole scene. */
    visibleFrom: z.number().nullable().optional(),
    visibleTo: z.number().nullable().optional(),
    /** Replacement wording (text-bearing widgets only). */
    text: z.string().max(WIDGET_TEXT_MAX).optional(),
    /** A derived widget the owner removed. */
    hidden: z.literal(true).optional(),
    /** Look: fields merged into the widget's `params.data` (colours, type,
     *  fit…). The widget's kind never changes, so this is a patch of it. */
    params: z.looseObject({}).refine(fitsLookBudget).optional(),
    /** Look: enter / exit motion; null = none. Replaces the derived one. */
    motion: z.object({ enter: MotionPhaseSchema, exit: MotionPhaseSchema }).nullable().optional(),
    /** Look: container chrome. Replaces the derived one. */
    containerStyle: ContainerStyleSchema.optional(),
    /** Look: effect chain. Replaces the derived one. */
    effects: z.array(WidgetEffectSchema).max(WIDGET_EFFECTS_MAX).refine(fitsLookBudget).optional(),
  })
  .strict();
export type WidgetOverride = z.infer<typeof WidgetOverrideSchema>;

/** Frame-level hand edits layered over the derived canvas, so the video keeps
 *  following the résumé while the owner's edits stick. `added` widgets are
 *  canvas `Widget`s, checked here only for id + kind (the editor built them). */
export const VideoCanvasPlanSchema = z
  .object({
    widgets: z.record(z.string().max(WIDGET_ID_MAX), WidgetOverrideSchema).optional(),
    added: z
      .partialRecord(
        z.enum(VIDEO_SCENE_IDS),
        z.array(z.looseObject({ id: z.string().max(WIDGET_ID_MAX), kind: z.string().max(40) })).max(ADDED_WIDGETS_MAX),
      )
      .optional(),
  })
  .strict();
export type VideoCanvasPlan = z.infer<typeof VideoCanvasPlanSchema>;

/** Bounds of the owner's music mix (seconds / 0..1 volume). */
export const MUSIC_MIX_SECONDS_MAX = 600;
export const MUSIC_FADE_SECONDS_MAX = 30;
const mixSeconds = z.number().min(0).max(MUSIC_MIX_SECONDS_MAX);
const fadeSeconds = z.number().min(0).max(MUSIC_FADE_SECONDS_MAX);

/** How the background music sits under the video, set by hand in the
 *  Advanced timeline (frontend lib/build/music-mix.ts applies it to the
 *  derived canvas's music layer). Absent fields keep the default. */
export const MusicMixSchema = z
  .object({
    /** Where the music starts, seconds from the video's start. */
    startOffsetSec: mixSeconds.optional(),
    /** Seconds skipped at the start / cut from the end of the track. */
    trimStartSec: mixSeconds.optional(),
    trimEndSec: mixSeconds.optional(),
    fadeInSec: fadeSeconds.optional(),
    fadeOutSec: fadeSeconds.optional(),
    /** Track volume, 0 (silent) .. 1 (full). */
    volume: z.number().min(0).max(1).optional(),
  })
  .strict();
export type MusicMix = z.infer<typeof MusicMixSchema>;

// ── Captions (strip › Captions track) ────────────────────────────────────
/** Where the captions sit on the frame, and how big they are. */
export const CAPTION_POSITIONS = ["bottom", "middle", "top"] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];
export const CAPTION_SIZES = ["s", "m", "l"] as const;
export type CaptionSize = (typeof CAPTION_SIZES)[number];
/** Longest caption chunk (the chunker never makes a longer one). */
export const CAPTION_TEXT_MAX = 120;
/** Hand-edited chunks one scene may carry. */
export const CAPTION_EDITS_MAX = 40;

/** Captions are derived from each scene's voiceover (frontend
 *  lib/build/captions.ts chunks + times them). The plan only records the
 *  switch, the style and the owner's rewording of a chunk — keyed by the
 *  chunk's derived text (`from`), so an edit sticks while the voiceover
 *  around it changes and quietly lapses when that chunk is gone. */
export const CaptionsPlanSchema = z
  .object({
    on: z.boolean().optional(),
    position: z.enum(CAPTION_POSITIONS).optional(),
    size: z.enum(CAPTION_SIZES).optional(),
    edits: z
      .partialRecord(
        z.enum(VIDEO_SCENE_IDS),
        z
          .array(z.object({ from: z.string().max(CAPTION_TEXT_MAX), text: z.string().max(CAPTION_TEXT_MAX) }).strict())
          .max(CAPTION_EDITS_MAX),
      )
      .optional(),
  })
  .strict();
export type CaptionsPlan = z.infer<typeof CaptionsPlanSchema>;
// ── end Captions ─────────────────────────────────────────────────────────

export const VideoPlanSchema = z
  .object({
    scenes: z.partialRecord(z.enum(VIDEO_SCENE_IDS), ScenePlanSchema).optional(),
    /** Stock music track id (music catalog); "none" = silent. */
    music: z.string().max(40).optional(),
    /** The owner's hand mix of that music (timing, fades, volume). */
    musicMix: MusicMixSchema.optional(),
    /** Frame-level hand edits (positions, timing, wording, added widgets). */
    canvas: VideoCanvasPlanSchema.optional(),
    /** Who the video is made for (audience · goal · start). */
    targeting: VideoTargetingSchema.optional(),
    /** The person's theme pick; absent = the default (Settings choice, else
     *  the theme calendar's pick for the date). */
    themeId: z.enum(VIDEO_THEME_IDS as [VideoThemeId, ...VideoThemeId[]]).optional(),
    /** The shape; absent = 16:9. */
    aspect: z.enum(VIDEO_ASPECTS).optional(),
    /** Who speaks (Video board): an AI voice, the owner's recorded takes
     *  (scenes without a take keep the AI voice), or one uploaded file. */
    voice: z
      .discriminatedUnion("source", [
        z.object({ source: z.literal("ai"), voiceId: z.string().max(80).optional() }).strict(),
        z.object({ source: z.literal("recorded"), voiceId: z.string().max(80).optional() }).strict(),
        z.object({ source: z.literal("upload"), url: z.string().url().max(2000), durationSeconds: z.number().min(0).max(600) }).strict(),
      ])
      .optional(),
    /** The voice level and "lower the music while someone speaks". */
    voiceMix: z.object({ voiceGain: z.number().min(0).max(1).optional(), duck: z.boolean().optional() }).strict().optional(),
    /** Captions from the voiceover: on/off, style, reworded chunks. */
    captions: CaptionsPlanSchema.optional(),
    /** Export settings (scene inspector › Export); absent = 1080p · 30 fps · H.264. */
    export: VideoExportSchema.optional(),
  })
  .strict();
export type VideoPlan = z.infer<typeof VideoPlanSchema>;

/** The plan stored on a résumé, or the empty (default) plan when there is
 *  none or it doesn't validate. */
export function readVideoPlan(content: unknown): VideoPlan {
  const meta = (content as { meta?: { video?: unknown } } | null)?.meta;
  const parsed = VideoPlanSchema.safeParse(meta?.video ?? {});
  return parsed.success ? parsed.data : {};
}

/** The résumé with `plan` stored on it (an empty plan removes the key). */
export function withVideoPlan<T extends { meta?: Record<string, unknown> | null }>(content: T, plan: VideoPlan): T {
  const meta: Record<string, unknown> = { ...(content.meta ?? {}) };
  if (Object.keys(plan).length === 0) delete meta.video;
  else meta.video = plan;
  return { ...content, meta };
}

/** Stable key for a work item: its id, else its position. */
export function workItemKey(item: { id?: string | null }, index: number): string {
  return item.id ? item.id : `work-${index}`;
}

function compactScene(scene: ScenePlan): ScenePlan | null {
  const out: ScenePlan = {};
  for (const [key, value] of Object.entries(scene) as Array<[keyof ScenePlan, unknown]>) {
    if (value !== undefined && value !== false) (out as Record<string, unknown>)[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Merge a patch into one scene's plan; `undefined` values clear a choice. */
export function patchScenePlan(plan: VideoPlan, id: VideoSceneId, patch: Partial<Record<keyof ScenePlan, unknown>>): VideoPlan {
  const merged = compactScene({ ...(plan.scenes?.[id] ?? {}), ...patch } as ScenePlan);
  const scenes = { ...(plan.scenes ?? {}) };
  if (merged) scenes[id] = merged;
  else delete scenes[id];
  const next: VideoPlan = { ...plan, scenes };
  if (Object.keys(scenes).length === 0) delete next.scenes;
  return next;
}

/** One scene's look overrides (the Advanced drill-ins' fields). */
export type SceneOverrides = Pick<ScenePlan, SceneOverrideKey>;

/** The scene's look overrides, picked out of its plan. */
export function sceneOverrides(scene: ScenePlan | undefined): SceneOverrides {
  const out: Record<string, unknown> = {};
  for (const key of SCENE_OVERRIDE_KEYS) if (scene?.[key] !== undefined) out[key] = scene[key];
  return out as SceneOverrides;
}

/** `next` with the owner's look overrides and export settings put back as
 *  they are in `original` — the AI rewrite may change wording, length and
 *  voiceover, never the owner's own look or director's notes. */
export function pinOwnerOverrides(next: VideoPlan, original: VideoPlan): VideoPlan {
  let out = next;
  for (const id of VIDEO_SCENE_IDS) {
    const own = sceneOverrides(original.scenes?.[id]);
    const patch: Partial<Record<keyof ScenePlan, unknown>> = {};
    for (const key of SCENE_OVERRIDE_KEYS) patch[key] = own[key];
    out = patchScenePlan(out, id, patch);
  }
  const { export: _model, ...rest } = out;
  return original.export ? { ...rest, export: original.export } : rest;
}

/** True when every scene would be switched off — the video keeps at least one. */
export function isLastSceneOn(plan: VideoPlan, id: VideoSceneId): boolean {
  return VIDEO_SCENE_IDS.every((s) => s === id || plan.scenes?.[s]?.off);
}

/** What the kit chat's owner is looking at when they send a message: the
 *  résumé page, or one video scene — so "make this shorter" has a target. */
export const ReviseFocusSchema = z.discriminatedUnion("view", [
  z.object({ view: z.literal("page") }),
  z.object({ view: z.literal("video"), scene: z.enum(VIDEO_SCENE_IDS) }),
]);
export type ReviseFocus = z.infer<typeof ReviseFocusSchema>;
