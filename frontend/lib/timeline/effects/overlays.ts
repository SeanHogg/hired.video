/**
 * Overlay effects — additive draws painted on top of whatever is
 * already on the canvas. Every effect here is deterministic on
 * `timelineFrame` (no mutable state, no RAF) so the editor preview
 * and the off-main-thread encoder produce identical pixels.
 *
 * Routes through the shared registry via `registerEffect`, which
 * means every entry below is automatically:
 *   • offered in the EffectStackEditor's Add menu (one menu, one DRY
 *     dispatch — see EffectStackEditor.tsx)
 *   • applied by both the scene-effects pass (full canvas) AND the
 *     widget-effects pass (bbox-clipped offscreen via
 *     `applyWidgetPixelEffects` in canvas-v2.ts) without per-effect
 *     plumbing.
 *
 * Layering: drawn after the underlying pixels, before pixel-postprocess
 * effects that read pixel data (film-grain, glitch, …) — same chain
 * order the registry already enforces by array position.
 */

import { registerEffect } from "./registry";
import { hexToRgbaString } from "@/lib/utils/color";

// ── Snow ──────────────────────────────────────────────────────────────
// Drifting white dots with a vertical bias and a wider radius range so
// the falling-snow read holds at any rect size.
registerEffect({
  kind: "snow",
  labelKey: "studio.effects.kind.snow",
  category: "stylize",
  proOnly: true,
  defaults: { intensity: 0.5, color: "#ffffff" },
  paramHints: { color: { type: "color" } },
  apply(effect, { ctx, canvas, timelineFrame }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.5));
    if (intensity <= 0) return;
    const color = stringOr(effect.params.color, "#ffffff");
    const w = canvas.width;
    const h = canvas.height;
    const count = Math.round(40 + intensity * 160);
    const prevAlpha = ctx.globalAlpha;
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const seed = i + 1;
      const baseX = ((seed * 9301 + 49297) % 233280) / 233280;
      const baseY = ((seed * 16807) % 2147483647) / 2147483647;
      // Sideways drift small; vertical drift dominates and is always +y
      // so flakes always fall — wraps at bottom.
      const driftX = (((seed * 22695) % 1024) / 1024 - 0.5) * 0.6;
      const fallY = 0.6 + (((seed * 7919) % 100) / 100) * 1.2;
      const x = ((baseX * w + driftX * timelineFrame) % w + w) % w;
      const y = ((baseY * h + fallY * timelineFrame) % h + h) % h;
      const r = ((seed * 31337) % 100) / 100 * 2.5 + 0.5;
      const a = 0.4 + ((seed * 1664525) % 100) / 100 * 0.5;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = prevAlpha;
  },
});

// ── Light leak ────────────────────────────────────────────────────────
// Soft animated radial wash composited additively over the pixels —
// the cheapest "warm 8mm leak" approximation that doesn't need a video
// asset. Position oscillates so the leak breathes across the frame.
registerEffect({
  kind: "light-leak",
  labelKey: "studio.effects.kind.lightLeak",
  category: "stylize",
  proOnly: true,
  defaults: { intensity: 0.5, color: "#ff7a45" },
  paramHints: { color: { type: "color" } },
  apply(effect, { ctx, canvas, timelineFrame }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.5));
    if (intensity <= 0) return;
    const color = stringOr(effect.params.color, "#ff7a45");
    const w = canvas.width;
    const h = canvas.height;
    // Two phase-offset oscillators give the leak an organic wander
    // without storing per-frame state.
    const t = timelineFrame * 0.015;
    const cx = w * (0.3 + 0.4 * Math.sin(t));
    const cy = h * (0.4 + 0.3 * Math.cos(t * 0.7));
    const radius = Math.hypot(w, h) * (0.4 + 0.2 * intensity);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    const alpha = (0.25 + intensity * 0.35).toFixed(2);
    grad.addColorStop(0, hexToRgbaString(color, Number(alpha)));
    grad.addColorStop(1, hexToRgbaString(color, 0));
    ctx.save();
    // `lighter` is screen-additive — the leak brightens without the
    // hard-edge clipping a normal alpha composite would create.
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  },
});

// ── Scan lines ────────────────────────────────────────────────────────
// CRT horizontal lines with a slow vertical roll. Cheap and recognisable;
// pairs well with chromatic-aberration for a retro-monitor look.
registerEffect({
  kind: "scan-lines",
  labelKey: "studio.effects.kind.scanLines",
  category: "stylize",
  defaults: { intensity: 0.5, density: 0.5 },
  apply(effect, { ctx, canvas, timelineFrame }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.5));
    const density = clamp01(numberOr(effect.params.density, 0.5));
    if (intensity <= 0) return;
    const w = canvas.width;
    const h = canvas.height;
    // Density 0 → 8px lines, density 1 → 2px lines.
    const step = Math.max(2, Math.round(8 - density * 6));
    const lineH = Math.max(1, Math.floor(step / 2));
    const offset = Math.floor(timelineFrame * 0.5) % step;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${(intensity * 0.5).toFixed(2)})`;
    for (let y = -step + offset; y < h; y += step) {
      ctx.fillRect(0, y, w, lineH);
    }
    ctx.restore();
  },
});

// ── Sparkles ──────────────────────────────────────────────────────────
// Twinkling stars that appear/disappear on a per-particle phase. Same
// deterministic-by-frame loop as drawParticleField but with a `+`
// glyph and a sin-driven alpha so the dots wink instead of drifting.
registerEffect({
  kind: "sparkles",
  labelKey: "studio.effects.kind.sparkles",
  category: "stylize",
  proOnly: true,
  defaults: { intensity: 0.6, color: "#fde68a" },
  paramHints: { color: { type: "color" } },
  apply(effect, { ctx, canvas, timelineFrame }) {
    const intensity = clamp01(numberOr(effect.params.intensity, 0.6));
    if (intensity <= 0) return;
    const color = stringOr(effect.params.color, "#fde68a");
    const w = canvas.width;
    const h = canvas.height;
    const count = Math.round(20 + intensity * 60);
    const prevAlpha = ctx.globalAlpha;
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    for (let i = 0; i < count; i++) {
      const seed = i + 1;
      const baseX = ((seed * 9301 + 49297) % 233280) / 233280;
      const baseY = ((seed * 16807) % 2147483647) / 2147483647;
      const phase = ((seed * 31337) % 1000) / 1000 * Math.PI * 2;
      // `twinkle` ∈ [0, 1] — a sin oscillation per particle so the
      // field continuously refreshes which dots are visible.
      const twinkle = (Math.sin(timelineFrame * 0.08 + phase) + 1) * 0.5;
      if (twinkle < 0.2) continue;
      const x = baseX * w;
      const y = baseY * h;
      const size = ((seed * 7919) % 100) / 100 * 4 + 2;
      ctx.globalAlpha = twinkle * (0.4 + intensity * 0.5);
      ctx.lineWidth = Math.max(1, size * 0.3);
      ctx.beginPath();
      ctx.moveTo(x - size, y);
      ctx.lineTo(x + size, y);
      ctx.moveTo(x, y - size);
      ctx.lineTo(x, y + size);
      ctx.stroke();
    }
    ctx.globalAlpha = prevAlpha;
  },
});

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

