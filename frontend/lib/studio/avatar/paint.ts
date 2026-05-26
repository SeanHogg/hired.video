/**
 * Avatar canvas painter (#1557).
 *
 * Pure pixel painter — takes a 2D canvas context and paints the
 * presenter into a rectangle. Stateless: same inputs always produce
 * the same pixels, so the editor preview, the timeline frame renderer,
 * and the exported MP4 all match.
 *
 * The painter is deliberately programmatic (no SVG-to-canvas import)
 * because the ffmpeg.wasm exporter runs on the main thread off a
 * regular 2D canvas — no DOM, no SVG-to-image asynchrony.
 */

import type { PresenterDefinition, Viseme } from "./presenters";

export interface PaintRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function paintPresenter(
  // Accept both browser + worker contexts so the painter can be reused
  // by the timeline frame renderer (ffmpeg.wasm exports run off the
  // main-thread 2D canvas, but the editor preview path uses the
  // OffscreenCanvas variant). Only basic 2D methods are used below —
  // both contexts implement them with identical semantics.
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  presenter: PresenterDefinition,
  viseme: Viseme,
  rect: PaintRect,
): void {
  const { x, y, w, h } = rect;
  const { colors } = presenter;

  ctx.save();

  // Background body silhouette — a rounded shoulder shape so the head
  // sits on top of "person shoulders" rather than floating.
  ctx.fillStyle = colors.outfit;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y + h * 0.7);
  ctx.bezierCurveTo(
    x + w * 0.1, y + h * 0.55,
    x + w * 0.25, y + h * 0.55,
    x + w * 0.3, y + h * 0.65,
  );
  ctx.lineTo(x + w * 0.7, y + h * 0.65);
  ctx.bezierCurveTo(
    x + w * 0.75, y + h * 0.55,
    x + w * 0.9, y + h * 0.55,
    x + w * 0.9, y + h * 0.7,
  );
  ctx.lineTo(x + w * 0.9, y + h);
  ctx.lineTo(x + w * 0.1, y + h);
  ctx.closePath();
  ctx.fill();

  // Accent (collar / tie / scarf) — a triangle on the chest.
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.45, y + h * 0.65);
  ctx.lineTo(x + w * 0.55, y + h * 0.65);
  ctx.lineTo(x + w * 0.5, y + h * 0.85);
  ctx.closePath();
  ctx.fill();

  // Neck.
  ctx.fillStyle = colors.skin;
  ctx.fillRect(x + w * 0.42, y + h * 0.5, w * 0.16, h * 0.18);

  // Head — ellipse.
  const cx = x + w * 0.5;
  const cy = y + h * 0.32;
  const rx = w * 0.22;
  const ry = h * 0.27;
  ctx.fillStyle = colors.skin;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair — varies by style.
  paintHair(ctx, presenter, { cx, cy, rx, ry });

  // Eyes.
  ctx.fillStyle = colors.stroke;
  const eyeY = cy - ry * 0.1;
  const eyeOffset = rx * 0.4;
  const eyeR = rx * 0.07;
  ctx.beginPath();
  ctx.arc(cx - eyeOffset, eyeY, eyeR, 0, Math.PI * 2);
  ctx.arc(cx + eyeOffset, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // Eyebrows.
  ctx.strokeStyle = colors.hair;
  ctx.lineWidth = Math.max(1, h * 0.008);
  ctx.beginPath();
  ctx.moveTo(cx - eyeOffset - rx * 0.15, eyeY - ry * 0.16);
  ctx.lineTo(cx - eyeOffset + rx * 0.15, eyeY - ry * 0.18);
  ctx.moveTo(cx + eyeOffset - rx * 0.15, eyeY - ry * 0.18);
  ctx.lineTo(cx + eyeOffset + rx * 0.15, eyeY - ry * 0.16);
  ctx.stroke();

  // Nose — subtle line.
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = Math.max(0.5, h * 0.004);
  ctx.beginPath();
  ctx.moveTo(cx, eyeY + ry * 0.1);
  ctx.lineTo(cx - rx * 0.06, eyeY + ry * 0.32);
  ctx.lineTo(cx + rx * 0.06, eyeY + ry * 0.32);
  ctx.stroke();

  // Mouth — viseme-driven.
  paintMouth(ctx, viseme, {
    cx,
    cy: cy + ry * 0.55,
    w: rx * 0.6,
    h: ry * 0.18,
    colors,
  });

  ctx.restore();
}

function paintHair(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  presenter: PresenterDefinition,
  head: { cx: number; cy: number; rx: number; ry: number },
): void {
  const { cx, cy, rx, ry } = head;
  ctx.fillStyle = presenter.colors.hair;

  switch (presenter.hairStyle) {
    case "buzz": {
      // Tight cap over the top half of the head.
      ctx.beginPath();
      ctx.ellipse(cx, cy - ry * 0.2, rx * 1.02, ry * 0.7, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "short": {
      ctx.beginPath();
      ctx.ellipse(cx, cy - ry * 0.25, rx * 1.05, ry * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
      // Re-skin the lower half so hair caps top only.
      ctx.fillStyle = presenter.colors.skin;
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * 0.15, rx * 1.04, ry * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = presenter.colors.hair;
      break;
    }
    case "long": {
      ctx.beginPath();
      ctx.ellipse(cx, cy - ry * 0.1, rx * 1.15, ry * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Re-skin face.
      ctx.fillStyle = presenter.colors.skin;
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * 0.05, rx * 0.95, ry * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = presenter.colors.hair;
      break;
    }
    case "bun": {
      // Bun on top.
      ctx.beginPath();
      ctx.arc(cx, cy - ry * 0.95, ry * 0.32, 0, Math.PI * 2);
      ctx.fill();
      // Hair cap.
      ctx.beginPath();
      ctx.ellipse(cx, cy - ry * 0.3, rx * 1.05, ry * 0.6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "curly":
    case "afro": {
      // Multiple overlapping circles for a textured silhouette.
      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * i) / 11 + Math.PI;
        const r = ry * 0.4;
        const ox = cx + Math.cos(angle) * rx * 1.05;
        const oy = cy + Math.sin(angle) * ry * 1.05;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
}

function paintMouth(
  ctx: CanvasRenderingContext2D,
  viseme: Viseme,
  m: { cx: number; cy: number; w: number; h: number; colors: { lips: string; stroke: string } },
): void {
  const { cx, cy, w, h, colors } = m;

  ctx.fillStyle = colors.lips;
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = Math.max(0.5, h * 0.08);

  switch (viseme) {
    case "rest": {
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.45, cy);
      ctx.quadraticCurveTo(cx, cy + h * 0.4, cx + w * 0.45, cy);
      ctx.stroke();
      break;
    }
    case "ah": {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.4, h * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "oh": {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.28, h * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "ee": {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.55, h * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "mm": {
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.4, cy);
      ctx.lineTo(cx + w * 0.4, cy);
      ctx.lineWidth = Math.max(1, h * 0.4);
      ctx.stroke();
      break;
    }
  }
}
