/**
 * Pure helpers for <CanvasStage>: which widgets are on screen at the
 * playhead, the clip-local time their animate math runs at, and the CSS
 * approximation of scene-level effects for the preview.
 */
import type { Widget } from "@/lib/studio/editor-v2/canvas-state";
import type { AnimateInput } from "@/lib/timeline/effects/animate";

/**
 * Build the AnimateInput for a widget at the current playhead position.
 *
 * - `currentTimeSec === undefined` → edit mode. Returns the authored
 *   START pose (clipTimeSec = 0) so animate-* effects render their
 *   first frame (e.g. fade-in shows the pre-fade pose, zoom-in shows
 *   the start scale).
 * - `currentTimeSec` set → playback. Returns clipTimeSec relative to
 *   the widget's `visibleFrom`, clamped to [0, lifespan] so the
 *   animation plays once per visibility window.
 */
export function widgetAnimateInputForPlayhead(
  widget: Widget,
  sceneDurationSeconds: number,
  currentTimeSec: number | undefined,
): AnimateInput {
  const from = widget.visibleFrom ?? 0;
  const to = widget.visibleTo ?? sceneDurationSeconds;
  const lifespan = Math.max(0, to - from);
  if (currentTimeSec === undefined) {
    return { clipTimeSec: 0, clipDurationSec: lifespan };
  }
  const clipTimeSec = Math.max(0, Math.min(lifespan, currentTimeSec - from));
  return { clipTimeSec, clipDurationSec: lifespan };
}

/**
 * Decide whether a widget should be on-screen at the current scene
 * playhead. Edit mode (no currentTimeSec) renders every widget — the
 * author needs to see all of them to lay out the scene. Playback mode
 * gates each widget against its [visibleFrom, visibleTo) window so a
 * widget that hasn't entered yet (or has already exited) drops out.
 */
export function isWidgetVisibleAt(
  widget: Widget,
  sceneDurationSeconds: number,
  currentTimeSec: number | undefined,
): boolean {
  if (currentTimeSec === undefined) return true;
  const from = widget.visibleFrom ?? 0;
  const to = widget.visibleTo ?? sceneDurationSeconds;
  return currentTimeSec >= from && currentTimeSec < to;
}

function numberParam(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// Scene-level effects → CSS filter string for the editor preview. Only
// the CSS-mappable subset is approximated here; full-frame pixel ops
// (film-grain, glitch, vignette, chromatic-aberration, sharpen) need
// the export compositor and are skipped — they ride along in the data
// (#655 remaining) so the next export pass picks them up.
export function sceneEffectsToCss(
  effects: ReadonlyArray<{ kind: string; params: Record<string, unknown> }> | undefined,
): string {
  if (!effects || effects.length === 0) return "";
  const parts: string[] = [];
  for (const e of effects) {
    const p = e.params ?? {};
    switch (e.kind) {
      case "blur": {
        const v = clamp01(numberParam(p.intensity, 0));
        if (v > 0) parts.push(`blur(${Math.round(v * 24)}px)`);
        break;
      }
      case "glow": {
        const v = clamp01(numberParam(p.intensity, 0));
        if (v > 0) {
          const radius = Math.round(8 + v * 24);
          const alpha = (0.4 + v * 0.4).toFixed(2);
          parts.push(`drop-shadow(0 0 ${radius}px rgba(255,255,255,${alpha}))`);
        }
        break;
      }
      default:
        break;
    }
  }
  return parts.join(" ");
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
