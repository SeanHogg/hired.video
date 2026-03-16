// canvas-nodes.ts — draws a single SceneNode onto a Canvas 2D context.
// The renderer calls drawNode() for each node in scene.nodes after applying
// evaluated animation transforms.

import type { SceneNode, Transform2D } from "../compiler/types";

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
      if (content.startsWith("gradient:")) {
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

    case "text": {
      if (!node.content) break;
      applyTransform(ctx, node.transform, cx, cy);
      ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
      ctx.fillStyle = node.style.color;
      ctx.textAlign = node.style.textAlign;
      ctx.textBaseline = "middle";

      // Word-wrap
      const maxWidth = width * 0.85;
      const words = node.content.split(" ");
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

      const lineH = node.style.fontSize * node.style.lineHeight;
      const totalH = lines.length * lineH;
      lines.forEach((l, i) => {
        ctx.fillText(l, 0, -totalH / 2 + i * lineH + lineH / 2);
      });
      break;
    }

    case "textGroup": {
      if (!node.items?.length) break;
      applyTransform(ctx, node.transform, cx * 0.5, cy);
      ctx.font = `${node.style.fontWeight} ${node.style.fontSize}px ${node.style.fontFamily}`;
      ctx.fillStyle = node.style.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const lineH = node.style.fontSize * 1.8;
      const total = node.items.length;
      node.items.forEach((item, i) => {
        const yOff = (i - (total - 1) / 2) * lineH;
        ctx.fillText("• " + item, 0, yOff);
      });
      break;
    }

    case "skillBubble": {
      if (!node.items?.length) break;
      const bubbleH = node.style.fontSize * 2.2;
      const gap = 12;
      const rowMax = Math.floor(width * 0.8 / 140); // approx items per row
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
