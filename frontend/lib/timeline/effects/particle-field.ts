/**
 * Shared deterministic particle-field draw — single source of truth for
 * every "drifting dots" surface in the codebase: the bg-encoded
 * `particles:#color` background branch, the `particles` registry
 * effect (V2 scene + widget), and the editor's `SceneBackgroundEffect`
 * preview. Per the standing DRY rule any new caller imports from here
 * instead of re-implementing the loop.
 *
 * Determinism contract: the position / radius / alpha of every particle
 * at frame N is derived purely from its index + N. No mutable cache, no
 * frame-N-1 carryover. This is what lets the off-main-thread encoder
 * produce the same pixels the editor preview shows without sharing a
 * particle store between threads.
 */

export interface ParticleFieldOptions {
  /** Particle count — keep modest; the loop is per-frame. */
  count?: number;
  /** Maximum drift per frame in pixels (uniform-random in [-speed, +speed]). */
  speed?: number;
  /** Maximum radius in pixels. Min radius is 0.5px. */
  maxRadius?: number;
  /** Optional radial-gradient wash painted behind the particles. When
   *  provided, the rect is filled with `radial(accent → baseColor)` first
   *  so a single call gives the full "Particles background" composition. */
  baseColor?: string;
}

/**
 * Paint a particle field inside a rect. Caller controls clipping /
 * compositing (call `ctx.save()` + clip beforehand if you need the dots
 * confined to a non-rect shape).
 */
export function drawParticleField(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  frame: number,
  opts: ParticleFieldOptions = {},
): void {
  if (w <= 0 || h <= 0) return;
  const count = opts.count ?? 60;
  const speed = opts.speed ?? 0.4;
  const maxRadius = opts.maxRadius ?? 2;

  if (opts.baseColor !== undefined) {
    const radial = ctx.createRadialGradient(
      x + w * 0.3,
      y + h * 0.3,
      0,
      x + w * 0.3,
      y + h * 0.3,
      Math.hypot(w, h),
    );
    radial.addColorStop(0, color + "44");
    radial.addColorStop(1, opts.baseColor);
    ctx.fillStyle = radial;
    ctx.fillRect(x, y, w, h);
  }

  const prevAlpha = ctx.globalAlpha;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const seed = i + 1;
    const baseX = ((seed * 9301 + 49297) % 233280) / 233280;
    const baseY = ((seed * 16807) % 2147483647) / 2147483647;
    const speedX = (((seed * 22695) % 1024) / 1024 - 0.5) * speed;
    const speedY = (((seed * 1103515) % 1024) / 1024 - 0.5) * speed;
    const px = ((baseX * w + speedX * frame) % w + w) % w;
    const py = ((baseY * h + speedY * frame) % h + h) % h;
    const r = ((seed * 7919) % 100) / 100 * (maxRadius - 0.5) + 0.5;
    const a = ((seed * 31337) % 100) / 100 * 0.5 + 0.1;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x + px, y + py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = prevAlpha;
}
