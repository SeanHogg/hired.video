/**
 * The owner's scene look overrides (scene inspector › Advanced drill-ins,
 * shared/video-plan.ts `SceneOverrides`) applied to the kit video — pure, so
 * the kit player, the Advanced editor and the posted video change alike.
 *
 *   sceneGround       background preset → the scene's fill + background effect
 *   withSceneFont     font-catalog id → every text / chips element
 *   withSceneMotion   minimal / moderate / cinematic → enter timing
 *   withResolution    export resolution → canvas size + type scaled with it
 *   withSceneCanvas   filters · director's notes · fps · codec on the canvas
 *
 * Script-level overrides run inside video-composition; canvas-level ones
 * (fields the v1 script has no slot for) run in video-canvas.
 */
import type { ExportResolution, SceneOverrides, VideoExport } from "@shared/video-plan";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { findFontPreset } from "@/lib/studio/font-catalog";
import { decodeBackgroundValue } from "@/lib/studio/visual-themes";
import type { WidgetMotion } from "@/lib/studio/editor-v2/widget-motion";
import type { SceneElement } from "@/types/video-script";
import type { SceneLook } from "./scene-palette";
import { resolutionScale, scalePx, scaleStyle } from "./resolution-scale";

/** The scene's fill (solid colour) and background effect: the owner's
 *  background preset, else the palette's gradient. A solid preset is the
 *  fill alone (the studio's scenePatchFromBgPreset rule). */
export function sceneGround(look: SceneLook, background: string | undefined): { fill: string; effect: string | undefined } {
  const decoded = decodeBackgroundValue(background);
  if (!decoded) return { fill: look.from, effect: `gradient:${look.from}:${look.to}` };
  return { fill: decoded.color, effect: decoded.kind === "solid" ? undefined : background };
}

/** Every text and chips element set in the chosen catalog font (an unknown
 *  id leaves the default type). */
export function withSceneFont(els: SceneElement[], fontId: string | undefined): SceneElement[] {
  const preset = findFontPreset(fontId);
  if (!preset) return els;
  return els.map((el) => (el.kind === "text" || el.kind === "chips" ? { ...el, fontFamily: preset.family } : el));
}

/** How each motion style reshapes the derived enter timing. */
const MOTION_TIMING: Record<NonNullable<SceneOverrides["motion"]>, { speed: number; fadeOnly: boolean }> = {
  minimal: { speed: 0.6, fadeOnly: true },
  moderate: { speed: 1, fadeOnly: false },
  cinematic: { speed: 1.5, fadeOnly: false },
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function reshapeMotion(motion: WidgetMotion, speed: number, fadeOnly: boolean): WidgetMotion {
  const kind = fadeOnly && motion.enter.kind !== "none" ? "fade" : motion.enter.kind;
  return { ...motion, enter: { ...motion.enter, kind, durationSeconds: round2(motion.enter.durationSeconds * speed) } };
}

/** Minimal: everything fades in, quicker. Cinematic: slower, longer stagger. */
export function withSceneMotion(els: SceneElement[], motion: SceneOverrides["motion"]): SceneElement[] {
  if (!motion || motion === "moderate") return els;
  const { speed, fadeOnly } = MOTION_TIMING[motion];
  return els.map((el) => ({
    ...el,
    ...(el.appearAt !== undefined ? { appearAt: round2(el.appearAt * speed) } : {}),
    ...(el.motion ? { motion: reshapeMotion(el.motion, speed, fadeOnly) } : {}),
  }));
}

/** Elements at another resolution: boxes are % of the canvas, so only the
 *  pixel sizes (type, borders, padding, corners) scale with it — through the
 *  same helper as the owner's hand edits (resolution-scale.ts). */
export function withResolution(els: SceneElement[], resolution: ExportResolution | undefined): SceneElement[] {
  const f = resolutionScale(resolution);
  if (f === 1) return els;
  return els.map((el) => {
    const out = { ...el } as SceneElement & { fontSize?: number };
    if ("fontSize" in el && typeof el.fontSize === "number") out.fontSize = scalePx(el.fontSize, f);
    if (el.style) out.style = scaleStyle(el.style, f);
    return out;
  });
}

/** Canvas-level overrides the script can't carry: each scene's filters and
 *  director's notes (by its canvas id), the export resolution (the script
 *  sizes the canvas by shape alone) and codec. The frame rate rides on the
 *  script (`video.fps`). */
export function withSceneCanvas(
  state: CanvasState,
  overrides: ReadonlyMap<string, SceneOverrides>,
  exportSettings: VideoExport,
): CanvasState {
  const f = resolutionScale(exportSettings.resolution);
  return {
    ...state,
    width: Math.round(state.width * f),
    height: Math.round(state.height * f),
    ...(exportSettings.codec ? { codec: exportSettings.codec } : {}),
    scenes: state.scenes.map((scene) => {
      const own = overrides.get(scene.id);
      if (!own || (!own.filters && !own.notes)) return scene;
      return {
        ...scene,
        ...(own.filters ? { filters: { ...own.filters } } : {}),
        ...(own.notes ? { directorNotes: own.notes } : {}),
      };
    }),
  };
}
