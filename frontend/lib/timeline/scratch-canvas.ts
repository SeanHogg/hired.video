/**
 * Scratch canvases for the frame compositor — allocated once per owner and
 * reused every frame, never per frame (#742).
 *
 * An "owner" is whatever paints repeatedly: a target canvas (the scene
 * filter effect snapshots the composite of the canvas it is drawing on) or
 * a renderer state (the scene transition renders the incoming scene into a
 * held frame). Keyed by a WeakMap so a scratch dies with its owner — the
 * export's OffscreenCanvas, the preview's backbuffer, a thumbnail canvas —
 * with no explicit teardown.
 *
 * Falls back to a detached `<canvas>` where `OffscreenCanvas` is missing
 * (Safari < 16.4), so the compositor never throws on an older browser.
 */

export type ScratchCanvas = OffscreenCanvas | HTMLCanvasElement;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A blank canvas of the given size, OffscreenCanvas when available. */
export function createScratchCanvas(width: number, height: number): ScratchCanvas | null {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document === "undefined") return null;
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  return el;
}

/** One scratch slot per (owner, purpose). */
export function createScratchPool(): (owner: object, width: number, height: number) => ScratchCanvas | null {
  const pool = new WeakMap<object, ScratchCanvas>();
  return (owner, width, height) => {
    const existing = pool.get(owner);
    if (existing) {
      if (existing.width !== width) existing.width = width;
      if (existing.height !== height) existing.height = height;
      return existing;
    }
    const created = createScratchCanvas(width, height);
    if (created) pool.set(owner, created);
    return created;
  };
}

export function context2d(canvas: ScratchCanvas | HTMLCanvasElement | OffscreenCanvas): Ctx2D | null {
  return canvas.getContext("2d") as Ctx2D | null;
}
