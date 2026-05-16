/**
 * SceneBackgroundEffect — DOM/canvas rendering of the encoded background
 * preset (gradient, dark-tech-grid, particles). Self-gates: returns
 * `null` for the solid / undefined case so the consumer can mount it
 * unconditionally underneath their widget layer and pay zero cost when
 * no rich effect is set.
 *
 * The encoding string is decoded via `decodeBackgroundValue()` in
 * `visual-themes.ts` (single source of truth shared with the canvas-v2
 * background applier — see #649). Adding a new bg kind = one branch
 * here + one branch in the applier + one entry in `BG_PRESETS`.
 */
"use client";

import { useEffect, useRef } from "react";
import { decodeBackgroundValue } from "@/lib/studio/visual-themes";
import { drawParticleField } from "@/lib/timeline/effects/particle-field";

interface Props {
  /** Encoded BgPreset.value (e.g. `particles:#7c3aed`). `null` /
   *  undefined renders nothing. */
  effect: string | null | undefined;
  /** Fallback colour painted under the effect when the kind needs it
   *  (e.g. particles paint over the scene's solid bg). Currently only
   *  used to pick a starting gradient base for `particles`. */
  baseColor?: string;
  className?: string;
}

export default function SceneBackgroundEffect({ effect, baseColor, className }: Props) {
  const decoded = decodeBackgroundValue(effect);
  if (!decoded || decoded.kind === "solid") return null;

  if (decoded.kind === "gradient") {
    return (
      <div
        aria-hidden
        className={className}
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${decoded.color}, ${decoded.color2 ?? decoded.color})`,
          pointerEvents: "none",
        }}
      />
    );
  }

  if (decoded.kind === "dark-tech-grid") {
    // Grid base is `#0f0f23` per the v1 renderer; we mirror it here so
    // the editor preview matches the export pixel-for-pixel once the
    // canvas-v2 applier wires up (#649). 20% accent colour for the
    // grid lines reads as subtle chrome over a dark slate.
    return (
      <div
        aria-hidden
        className={className}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#0f0f23",
          backgroundImage: `
            repeating-linear-gradient(0deg, ${decoded.color}33 0 1px, transparent 1px 40px),
            repeating-linear-gradient(90deg, ${decoded.color}33 0 1px, transparent 1px 40px)
          `,
          pointerEvents: "none",
        }}
      />
    );
  }

  return (
    <ParticlesLayer
      color={decoded.color}
      baseColor={baseColor ?? "#1a0533"}
      className={className}
    />
  );
}

/** Particle field driven by the shared `drawParticleField` helper —
 *  the SAME function the renderer uses to paint particles into the
 *  exported video. RAF here exists only to advance a frame counter so
 *  the deterministic-by-frame loop animates; positions are derived
 *  identically to the export, so editor preview and rendered pixels
 *  match.
 *
 *  Density / drift / radius live in `particle-field.ts` — change them
 *  there and both surfaces update together. */
function ParticlesLayer({
  color,
  baseColor,
  className,
}: {
  color: string;
  baseColor: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let frame = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width));
      canvas.height = Math.max(1, Math.round(rect.height));
    };

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawParticleField(ctx, 0, 0, canvas.width, canvas.height, color, frame);
      frame += 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [color]);

  return (
    <div
      aria-hidden
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(circle at 30% 30%, ${color}44, ${baseColor})`,
        pointerEvents: "none",
      }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
