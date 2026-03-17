// canvas-nodes.ts — draws a single SceneNode onto a Canvas 2D context.
// The renderer calls drawNode() for each node in scene.nodes after applying
// evaluated animation transforms.
//
// measureNodeHeight() is exported so frame-renderer can do a layout pass
// before drawing — computing dynamic y positions that accommodate wrapped text.

import type { SceneNode, Transform2D } from "../compiler/types";

// ─── Image cache ─────────────────────────────────────────────────────────────
// Synchronous renderer — we start loading on first miss and return null until ready.

const _imgCache = new Map<string, HTMLImageElement | "loading">();

function getCachedImage(url: string): HTMLImageElement | null {
  const cached = _imgCache.get(url);
  if (cached && cached !== "loading") return cached;
  if (!cached) {
    _imgCache.set(url, "loading");
    const img = new Image();
    img.onload = () => _imgCache.set(url, img);
    img.onerror = () => _imgCache.delete(url);
    img.src = url;
  }
  return null;
}

// ─── Particle state (per-canvas) ─────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  alpha: number;
  color: string;
}

const particleCache = new WeakMap<CanvasRenderingContext2D, Particle[]>();

function getParticles(ctx: CanvasRenderingContext2D, color: string): Particle[] {
  if (!particleCache.has(ctx)) {
    const particles: Particle[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * ctx.canvas.width,
        y: Math.random() * ctx.canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
        color,
      });
    }
    particleCache.set(ctx, particles);
  }
  return particleCache.get(ctx)!;
}

function tickParticles(ctx: CanvasRenderingContext2D, color: string): void {
  const ps = getParticles(ctx, color);
  const { width, height } = ctx.canvas;
  for (const p of ps) {
    p.x = (p.x + p.vx + width) % width;
    p.y = (p.y + p.vy + height) % height;
  }
}

// ─── Gradient backgrounds ─────────────────────────────────────────────────────

function drawGradientBackground(ctx: CanvasRenderingContext2D, c1: string, c2: string): void {
  const { width, height } = ctx.canvas;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, c1);
  gradient.addColorStop(1, c2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawDarkTechGrid(ctx: CanvasRenderingContext2D, color: string): void {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = "#0f0f23";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = color + "33"; // 20% opacity
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x <= width; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y <= height; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
}

// ─── Text measurement helpers ─────────────────────────────────────────────────

/** Wraps text into lines fitting maxWidth. Requires ctx.font to be pre-set. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Returns the pixel height that drawNode() will occupy for a content node.
 * Used by frame-renderer to compute dynamic stacking layout.
 */
export function measureNodeHeight(ctx: CanvasRenderingContext2D, node: SceneNode): number {
  const { width } = ctx.canvas;
  const maxWidth = width * 0.82;
  switch (node.type) {
    case "text": {
      if (!node.content) return 0;
      ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
      const lineCount = wrapText(ctx, node.content, maxWidth).length;
      return lineCount * node.style.fontSize * node.style.lineHeight;
    }
    case "textGroup": {
      if (!node.items?.length) return 0;
      ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
      const itemMaxW = width * 0.72; // textGroup is left-aligned, narrower
      const lineH = node.style.fontSize * 1.8;
      let totalLines = 0;
      for (const item of node.items) {
        totalLines += wrapText(ctx, "• " + item, itemMaxW).length;
      }
      return totalLines * lineH;
    }
    case "skillBubble": {
      if (!node.items?.length) return 0;
      ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
      const bubbleH = node.style.fontSize * 2.2;
      const gap = 12;
      const rowMax = Math.min(2, Math.max(1, Math.floor(width * 0.8 / 140)));
      const rowCount = Math.ceil(node.items.length / rowMax);
      return rowCount * (bubbleH + gap) - gap;
    }
    default:
      return 0;
  }
}

// ─── Apply transform to context ───────────────────────────────────────────────

export function applyTransform(ctx: CanvasRenderingContext2D, t: Transform2D, cx: number, cy: number): void {
  ctx.translate(cx + t.x, cy + t.y);
  ctx.scale(t.scaleX, t.scaleY);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.globalAlpha = Math.max(0, Math.min(1, t.alpha));
}

// ─── Main draw function ───────────────────────────────────────────────────────

export function drawNode(ctx: CanvasRenderingContext2D, node: SceneNode): void {
  const { width, height } = ctx.canvas;
  const cx = width / 2;
  const cy = height / 2;

  ctx.save();

  switch (node.type) {
    case "background": {
      const content = node.content ?? "";
      if (content.startsWith("custom:")) {
        const url = content.slice(7);
        const img = getCachedImage(url);
        if (img) {
          // Cover-fit: scale so image fills canvas, centred
          const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
        } else {
          // Placeholder while image loads
          ctx.fillStyle = "#111111";
          ctx.fillRect(0, 0, width, height);
        }
      } else if (content.startsWith("gradient:")) {
        const parts = content.split(":");
        drawGradientBackground(ctx, parts[1] ?? "#7c3aed", parts[2] ?? "#2563eb");
      } else if (content.startsWith("dark-tech-grid:")) {
        drawDarkTechGrid(ctx, content.split(":")[1] ?? "#7c3aed");
      } else if (content.startsWith("particles:")) {
        const color = content.split(":")[1] ?? "#7c3aed";
        drawGradientBackground(ctx, "#1a0533", color + "88");
        tickParticles(ctx, color);
        const ps = getParticles(ctx, color);
        for (const p of ps) {
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = content || "#1a1a2e";
        ctx.fillRect(0, 0, width, height);
      }
      break;
    }

    case "particles": {
      const color = node.style.background ?? "#7c3aed";
      tickParticles(ctx, color);
      const ps = getParticles(ctx, color);
      for (const p of ps) {
        ctx.globalAlpha = p.alpha * node.transform.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "overlay": {
      applyTransform(ctx, node.transform, cx, cy);
      ctx.fillStyle = node.style.background ?? "#000000";
      ctx.fillRect(-cx, -cy, width, height);
      break;
    }

    case "image": {
      const content = node.content ?? "";
      const colonIdx = content.indexOf(":");
      if (colonIdx === -1) break;
      const position = content.slice(0, colonIdx);
      const url = content.slice(colonIdx + 1);
      const img = getCachedImage(url);
      if (!img) break;

      ctx.globalAlpha = node.transform.alpha;

      // Compute target rect based on position keyword
      const pad = Math.round(width * 0.03);
      const r = 12; // corner radius
      type Rect = { x: number; y: number; w: number; h: number };
      const rect: Rect = (() => {
        switch (position) {
          case "half-left":  return { x: 0,             y: 0,             w: width / 2,       h: height };
          case "half-right": return { x: width / 2,     y: 0,             w: width / 2,       h: height };
          case "small-left":
            return { x: pad, y: Math.round(height * 0.2), w: Math.round(width * 0.42), h: Math.round(height * 0.6) };
          case "small-right": {
            const w2 = Math.round(width * 0.42);
            return { x: width - w2 - pad, y: Math.round(height * 0.2), w: w2, h: Math.round(height * 0.6) };
          }
          case "corner-tl": return { x: pad,             y: pad,              w: Math.round(width * 0.36),  h: Math.round(height * 0.36) };
          case "corner-tr": return { x: width - Math.round(width * 0.36) - pad, y: pad, w: Math.round(width * 0.36), h: Math.round(height * 0.36) };
          case "corner-bl": return { x: pad, y: height - Math.round(height * 0.36) - pad, w: Math.round(width * 0.36), h: Math.round(height * 0.36) };
          case "corner-br": {
            const cw = Math.round(width * 0.36), ch = Math.round(height * 0.36);
            return { x: width - cw - pad, y: height - ch - pad, w: cw, h: ch };
          }
          default: return { x: 0, y: 0, w: width, h: height }; // full
        }
      })();

      // Clip to rounded rect
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, r);
      } else {
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
      }
      ctx.clip();

      // Cover-fit image within rect
      const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, rect.x + (rect.w - dw) / 2, rect.y + (rect.h - dh) / 2, dw, dh);

      // Subtle dark shadow-border for non-full positions
      if (position !== "full" && position !== "half-left" && position !== "half-right") {
        ctx.restore(); ctx.save(); // reset clip
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(rect.x, rect.y, rect.w, rect.h, r);
        } else {
          ctx.rect(rect.x, rect.y, rect.w, rect.h);
        }
        ctx.stroke();
      }
      break;
    }

    case "text": {
      if (!node.content) break;
      applyTransform(ctx, node.transform, cx, cy);
      ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
      ctx.fillStyle = node.style.color;
      ctx.textAlign = node.style.textAlign;
      ctx.textBaseline = "middle";

      const lines = wrapText(ctx, node.content, width * 0.82);
      const lineH = node.style.fontSize * node.style.lineHeight;
      const totalH = lines.length * lineH;

      // Typewriter: reveal characters progressively based on textRevealProgress
      const reveal = node.textRevealProgress;
      if (reveal !== undefined && reveal < 1) {
        const fullText = lines.join(" ");
        const visibleChars = Math.floor(fullText.length * reveal);
        let charsLeft = visibleChars;
        // Rebuild partial lines from char budget
        const partialLines = lines.map((l) => {
          if (charsLeft <= 0) return "";
          const visible = l.slice(0, charsLeft);
          charsLeft -= l.length + 1; // +1 for the space between lines
          return visible;
        });
        partialLines.forEach((l, i) => {
          if (l) ctx.fillText(l, 0, -totalH / 2 + i * lineH + lineH / 2);
        });
      } else {
        lines.forEach((l, i) => {
          ctx.fillText(l, 0, -totalH / 2 + i * lineH + lineH / 2);
        });
      }
      break;
    }

    case "textGroup": {
      if (!node.items?.length) break;
      // Anchor at canvas centre so we can balance whitespace on both sides
      applyTransform(ctx, node.transform, cx, cy);
      ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
      ctx.fillStyle = node.style.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const lineH = node.style.fontSize * 1.8;
      const itemMaxW = width * 0.72;

      // Build all wrapped lines first so we can centre the block vertically
      const allLines: string[] = [];
      for (const item of node.items) {
        const wrapped = wrapText(ctx, "• " + item, itemMaxW);
        // Indent continuation lines for readability
        allLines.push(...wrapped.map((l, i) => (i === 0 ? l : "    " + l)));
      }

      // Measure the widest line so the block is centred horizontally
      const contentW = Math.min(
        itemMaxW,
        allLines.reduce((max, l) => Math.max(max, ctx.measureText(l).width), 0),
      );
      const startX = -contentW / 2;

      const totalH = allLines.length * lineH;
      allLines.forEach((l, i) => {
        ctx.fillText(l, startX, -totalH / 2 + i * lineH + lineH / 2);
      });
      break;
    }

    case "skillBubble": {
      if (!node.items?.length) break;
      const bubbleH = node.style.fontSize * 2.2;
      const gap = 12;
      const rowMax = Math.min(2, Math.max(1, Math.floor(width * 0.8 / 140))); // max 2 columns
      const skillBg = node.style.background ?? "#2563eb";

      // Lay out bubbles centred
      const items = node.items;
      const rows: string[][] = [];
      for (let i = 0; i < items.length; i += rowMax) {
        rows.push(items.slice(i, i + rowMax));
      }
      const totalH = rows.length * (bubbleH + gap) - gap;
      const startY = cy - totalH / 2 + node.transform.y;

      ctx.globalAlpha = node.transform.alpha;
      rows.forEach((row, ri) => {
        const rowW = row.reduce((sum, s) => {
          ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
          return sum + ctx.measureText(s).width + node.style.fontSize * 2 + gap;
        }, -gap);
        let startX = (width - rowW) / 2;
        const rowY = startY + ri * (bubbleH + gap);

        for (const skill of row) {
          ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
          const tw = ctx.measureText(skill).width;
          const bw = tw + node.style.fontSize * 2;

          // Bubble background
          ctx.fillStyle = skillBg;
          ctx.globalAlpha = node.transform.alpha * 0.85;
          ctx.beginPath();
          ctx.roundRect(startX, rowY, bw, bubbleH, bubbleH / 2);
          ctx.fill();

          // Skill label
          ctx.fillStyle = "#ffffff";
          ctx.globalAlpha = node.transform.alpha;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(skill, startX + bw / 2, rowY + bubbleH / 2);

          startX += bw + gap;
        }
      });
      break;
    }

    default:
      break;
  }

  ctx.restore();
}
