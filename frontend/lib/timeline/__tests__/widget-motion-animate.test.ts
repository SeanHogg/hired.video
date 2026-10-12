/**
 * Widget enter / exit motion (`Widget.motion`) through the ONE animate math
 * both renderers call — the DOM preview (CanvasStage) and the export painter
 * (canvas-v2). Before this, motion was authored + saved but never rendered.
 */
import { describe, it, expect } from "vitest";
import { computeAnimateOutput } from "@/lib/timeline/effects/animate";
import type { MotionKind, WidgetMotion } from "@/lib/studio/editor-v2/widget-motion";

const motion = (kind: MotionKind, exit: MotionKind = "none"): WidgetMotion => ({
  enter: { kind, durationSeconds: 1, easing: "linear" },
  exit: { kind: exit, durationSeconds: 1, easing: "linear" },
});
const at = (clipTimeSec: number, m: WidgetMotion | null, clipDurationSec = 5) =>
  computeAnimateOutput([], { clipTimeSec, clipDurationSec }, m);

describe("computeAnimateOutput — widget motion", () => {
  it("is identity without motion", () => {
    expect(at(0, null)).toEqual({ scale: 1, tx: 0, ty: 0, alpha: 1 });
  });

  it("slides in from the left and settles at rest", () => {
    const start = at(0, motion("slide-left"));
    expect(start.tx).toBeLessThan(0);
    expect(start.alpha).toBe(0);
    const mid = at(0.5, motion("slide-left"));
    expect(mid.tx).toBeGreaterThan(start.tx);
    expect(mid.alpha).toBeCloseTo(0.5);
    expect(at(1.2, motion("slide-left"))).toEqual({ scale: 1, tx: 0, ty: 0, alpha: 1 });
  });

  it("slides up from below (positive ty) and scales up from small", () => {
    expect(at(0, motion("slide-up")).ty).toBeGreaterThan(0);
    expect(at(0, motion("slide-down")).ty).toBeLessThan(0);
    expect(at(0, motion("scale")).scale).toBeLessThan(1);
  });

  it("plays the exit over the end of the visibility window", () => {
    const m = motion("none", "fade");
    expect(at(2, m).alpha).toBe(1);
    expect(at(4.5, m).alpha).toBeCloseTo(0.5);
    expect(at(5, m).alpha).toBe(0);
  });

  it("composes with animate-* effects", () => {
    const out = computeAnimateOutput(
      [{ kind: "animate-fade-in", params: { durationSec: 1 } }],
      { clipTimeSec: 0.5, clipDurationSec: 5 },
      motion("fade"),
    );
    expect(out.alpha).toBeCloseTo(0.25);
  });
});
