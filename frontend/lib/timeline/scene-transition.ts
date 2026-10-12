/**
 * Whole-frame scene transitions (#570) — `Timeline.sceneTransitions`.
 *
 * A studio scene is several clips on several tracks (background on v1,
 * widgets on v2, post effects on v3), so the per-track `outTransition`
 * blend in the compositor can't dissolve one scene into the next. These
 * transitions run AFTER every track is composited: the incoming scene is
 * rendered on its first frame (`atFrame`) into a held canvas and blended
 * over the outgoing composite. The total duration never changes — the
 * transition borrows the tail of the outgoing scene.
 *
 *   cross-dissolve  incoming fades in over [atFrame − d, atFrame)
 *   slide           incoming pushes the outgoing frame left over the same window
 *   fade-to-black   black ramps up to atFrame and back down after it
 *
 * Called from `renderTimelineFrame`, so the editor preview and every
 * export engine render transitions through the same code.
 */
import type { SceneTransition, Timeline } from "@shared/timeline";
import { createScratchPool, type Ctx2D, type ScratchCanvas } from "./scratch-canvas";

export interface ActiveSceneTransition {
  transition: SceneTransition;
  /** 0..1 — incoming opacity (dissolve), push amount (slide) or black
   *  opacity (fade-to-black). */
  progress: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The transition covering `frame`, or null on a plain frame. */
export function activeSceneTransition(
  timeline: Pick<Timeline, "sceneTransitions">,
  frame: number,
): ActiveSceneTransition | null {
  for (const transition of timeline.sceneTransitions ?? []) {
    const d = transition.durationFrames;
    if (!(d > 0)) continue;
    if (transition.kind === "fade-to-black") {
      const half = d / 2;
      const distance = Math.abs(frame - transition.atFrame);
      if (distance < half) return { transition, progress: clamp01(1 - distance / half) };
      continue;
    }
    const start = transition.atFrame - d;
    if (frame >= start && frame < transition.atFrame) {
      return { transition, progress: clamp01((frame - start) / d) };
    }
  }
  return null;
}

/** Ease-in-out so a slide starts and lands softly. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const heldFrameFor = createScratchPool();

/**
 * Blend `active` onto the composite already on `canvas`.
 *
 * @param owner the renderer state — the held canvas is reused per owner.
 * @param renderIncoming paints the incoming scene's first frame onto the
 *   held canvas (the compositor's track pass, without branding).
 */
export async function paintSceneTransition(
  ctx: Ctx2D,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  active: ActiveSceneTransition,
  owner: object,
  renderIncoming: (target: ScratchCanvas) => Promise<void>,
): Promise<void> {
  const { transition, progress } = active;
  const w = canvas.width;
  const h = canvas.height;

  if (transition.kind === "fade-to-black") {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(0,0,0,${progress})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    return;
  }

  const held = heldFrameFor(owner, w, h);
  if (!held) return;
  await renderIncoming(held);

  ctx.save();
  if (transition.kind === "cross-dissolve") {
    ctx.globalAlpha = progress;
    ctx.drawImage(held, 0, 0);
  } else {
    // slide — push: outgoing moves left, incoming enters from the right.
    // Drawing a canvas onto itself is defined (the source is copied first).
    const offset = Math.round(w * easeInOut(progress));
    ctx.globalAlpha = 1;
    ctx.drawImage(canvas, -offset, 0);
    ctx.drawImage(held, w - offset, 0);
  }
  ctx.restore();
}
