/**
 * Per-widget transform keyframes (#808 / #3160).
 *
 * `Widget.position` is the base pose. Optional `Widget.keyframes` overlay
 * numeric fields (x / y / width / height / rotation) over scene time.
 * Interpolation is `evaluateKeyframes` — the same lerp / easing the effect
 * param tracks use — so a second animation math does not exist. `z` is
 * never interpolated (paint order stays authored).
 *
 * Hold before the first sample and after the last. Fields a sample does
 * not list keep the base pose (or interpolate only among samples that
 * do list them). Enter / exit `Widget.motion` still applies on top via
 * `computeAnimateOutput` once the pose is resolved into a FrameInput.
 */
import type {
  Widget,
  WidgetPosition,
  WidgetTransformKeyframe,
} from "@/lib/studio/editor-v2/canvas-state";
import { evaluateKeyframes, type KeyframeTrack } from "@/lib/timeline/effects/keyframes";

const INTERPOLATED_FIELDS = ["x", "y", "width", "height", "rotation"] as const;

function finiteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Coerce a persisted / clip-param payload into well-formed samples. */
export function parseWidgetKeyframes(value: unknown): WidgetTransformKeyframe[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const out: WidgetTransformKeyframe[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { atSec?: unknown; position?: unknown };
    if (!finiteNumber(e.atSec)) continue;
    if (typeof e.position !== "object" || e.position === null) continue;
    const raw = e.position as Record<string, unknown>;
    const position: Partial<WidgetPosition> = {};
    for (const field of ["x", "y", "width", "height", "z", "rotation"] as const) {
      const v = raw[field];
      if (finiteNumber(v)) position[field] = v;
    }
    if (Object.keys(position).length === 0) continue;
    out.push({ atSec: e.atSec, position });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Pose of `widget` at `scenePlayheadSec` (seconds from scene start).
 * No samples → the static `position` object (identity). `z` always
 * comes from the base pose.
 */
export function evaluateWidgetPositionAt(
  widget: Pick<Widget, "position" | "keyframes">,
  scenePlayheadSec: number,
): WidgetPosition {
  const base = widget.position;
  const frames = widget.keyframes;
  if (!frames || frames.length === 0) return base;

  const at = finiteNumber(scenePlayheadSec) ? scenePlayheadSec : 0;
  const out: WidgetPosition = { ...base };

  for (const field of INTERPOLATED_FIELDS) {
    const samples: Array<{ atSec: number; value: number }> = [];
    for (const kf of frames) {
      if (!finiteNumber(kf.atSec)) continue;
      const v = kf.position[field];
      if (finiteNumber(v)) samples.push({ atSec: kf.atSec, value: v });
    }
    if (samples.length === 0) continue;
    out[field] = evaluateField(samples, at);
  }
  return out;
}

function evaluateField(samples: Array<{ atSec: number; value: number }>, atSec: number): number {
  if (samples.length === 1) return samples[0].value;
  const sorted = samples.slice().sort((a, b) => a.atSec - b.atSec);
  const t0 = sorted[0].atSec;
  const t1 = sorted[sorted.length - 1].atSec;
  const span = t1 - t0;
  if (span <= 0) return sorted[sorted.length - 1].value;
  // Map absolute seconds onto a 0..1 track so `evaluateKeyframes` (which
  // clamps progress to 0..1 and holds the ends) is the only lerp.
  const track: KeyframeTrack = {
    keyframes: sorted.map((s) => ({ t: (s.atSec - t0) / span, value: s.value })),
  };
  return evaluateKeyframes(track, (atSec - t0) / span);
}
