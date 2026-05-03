// canvas-nodes.ts — draws a single SceneNode onto a Canvas 2D context.
// The renderer calls drawNode() for each node in scene.nodes after applying
// evaluated animation transforms.
//
// measureNodeHeight() is exported so frame-renderer can do a layout pass
// before drawing — computing dynamic y positions that accommodate wrapped text.

import type { SceneNode, Transform2D } from "../compiler/types";
import { drawChart } from "../studio/chart-canvas";

// ─── Image cache ─────────────────────────────────────────────────────────────
// Synchronous renderer — we start loading on first miss and return null until ready.

const _imgCache = new Map<string, HTMLImageElement | "loading" | "error">();

function getCachedImage(url: string): HTMLImageElement | null {
  const cached = _imgCache.get(url);
  if (cached === "error") return null;        // failed — don't retry
  if (cached && cached !== "loading") return cached;
  if (!cached) {
    _imgCache.set(url, "loading");
    const img = new Image();
    // crossOrigin must be set BEFORE src for the request to include the
    // CORS Origin header. Without this, external images taint the canvas
    // and break captureStream() during MediaRecorder export.
    // Skip for blob:/data: URLs which are same-origin by definition.
    if (!url.startsWith("blob:") && !url.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => _imgCache.set(url, img);
    img.onerror = () => _imgCache.set(url, "error"); // stop retrying on failure
    img.src = url;
  }
  return null;
}

// ─── Video cache ─────────────────────────────────────────────────────────────
// Plays muted, looping videos that the canvas renderer reads frames from via
// drawImage(video). crossOrigin="anonymous" is required for canvas-clean export.

const _videoCache = new Map<string, HTMLVideoElement | "loading" | "error">();

function getCachedVideo(url: string): HTMLVideoElement | null {
  const cached = _videoCache.get(url);
  if (cached === "error") return null;
  if (cached && cached !== "loading") return cached;
  if (!cached) {
    _videoCache.set(url, "loading");
    const video = document.createElement("video");
    if (!url.startsWith("blob:") && !url.startsWith("data:")) {
      video.crossOrigin = "anonymous";
    }
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = "auto";
    video.src = url;
    video.oncanplay = () => {
      _videoCache.set(url, video);
      // Browsers require a user gesture for unmuted autoplay, but muted videos
      // can autoplay programmatically. We catch failures silently.
      video.play().catch(() => {});
    };
    video.onerror = () => _videoCache.set(url, "error");
  }
  return null;
}

/** Returns true if URL has a video file extension or is from a known video provider. */
function looksLikeVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) || /videos\.pexels\.com|player\.vimeo\.com|cdn\.pixabay\.com\/.*\.mp4/i.test(url);
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
      const paragraphs = node.content.split("\n");
      const lineCount = paragraphs.flatMap(p => p.trim() ? wrapText(ctx, p, maxWidth) : [""]).length;
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

export function drawNode(ctx: CanvasRenderingContext2D, node: SceneNode, _elapsed = 0, sceneProgress = 0): void {
  const { width, height } = ctx.canvas;
  const cx = width / 2;
  const cy = height / 2;

  ctx.save();

  switch (node.type) {
    case "background": {
      const content = node.content ?? "";
      if (content.startsWith("customVideo:")) {
        const url = content.slice("customVideo:".length);
        const video = getCachedVideo(url);
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
          const dw = video.videoWidth * scale;
          const dh = video.videoHeight * scale;
          ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
        } else {
          ctx.fillStyle = "#111111";
          ctx.fillRect(0, 0, width, height);
        }
      } else if (content.startsWith("custom:")) {
        const url = content.slice(7);
        // Auto-detect: a URL that points to a video file should still play
        // even when authored via the legacy "custom:" prefix.
        if (looksLikeVideo(url)) {
          const video = getCachedVideo(url);
          if (video && video.readyState >= 2 && video.videoWidth > 0) {
            const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
            const dw = video.videoWidth * scale;
            const dh = video.videoHeight * scale;
            ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
          } else {
            ctx.fillStyle = "#111111";
            ctx.fillRect(0, 0, width, height);
          }
          break;
        }
        const img = getCachedImage(url);
        if (img) {
          const kbScale2 = node.kenBurns ? (() => {
            const p = Math.max(0, Math.min(1, sceneProgress));
            if (node.kenBurns === "zoom-in")  return 1 + p * 0.12;
            if (node.kenBurns === "zoom-out") return 1.12 - p * 0.12;
            return 1;
          })() : 1;
          const kbOffX = node.kenBurns ? (() => {
            const p = Math.max(0, Math.min(1, sceneProgress));
            if (node.kenBurns === "pan-left")  return p * width * 0.08;
            if (node.kenBurns === "pan-right") return -p * width * 0.08;
            return 0;
          })() : 0;
          const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight) * kbScale2;
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          ctx.drawImage(img, (width - dw) / 2 + kbOffX, (height - dh) / 2, dw, dh);
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
      const isCard = !!(node.style.borderColor || node.style.borderRadius);
      if (isCard) {
        // Draw a centered card with rounded corners + optional border
        const cardW = Math.round(width * 0.78);
        const cardH = Math.round(height * 0.66);
        const x = -cardW / 2;
        const y = -cardH / 2;
        const r = node.style.borderRadius ?? 18;
        ctx.fillStyle = node.style.background ?? "rgba(0,0,0,0.5)";
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, cardW, cardH, r);
        } else {
          ctx.rect(x, y, cardW, cardH);
        }
        ctx.fill();
        if (node.style.borderColor) {
          ctx.strokeStyle = node.style.borderColor;
          ctx.lineWidth = node.style.borderWidth ?? 2;
          ctx.stroke();
        }
      } else {
        // Full-canvas overlay (legacy path used by closing scene dimmer)
        ctx.fillStyle = node.style.background ?? "#000000";
        ctx.fillRect(-cx, -cy, width, height);
      }
      break;
    }

    case "image": {
      const content = node.content ?? "";
      // Format:
      //   "position:url"        — image (legacy)
      //   "video:position:url"  — video
      let isVideo = false;
      let rest = content;
      if (rest.startsWith("video:")) {
        isVideo = true;
        rest = rest.slice("video:".length);
      }
      const colonIdx = rest.indexOf(":");
      if (colonIdx === -1) break;
      const position = rest.slice(0, colonIdx);
      const url = rest.slice(colonIdx + 1);

      // Auto-detect videos coming through the legacy "position:url" format too
      const useVideo = isVideo || looksLikeVideo(url);
      const img = useVideo ? null : getCachedImage(url);
      const video = useVideo ? getCachedVideo(url) : null;
      const sourceReady = useVideo
        ? !!(video && video.readyState >= 2 && video.videoWidth > 0)
        : !!img;
      if (!sourceReady) break;

      const sourceW = useVideo ? video!.videoWidth : img!.naturalWidth;
      const sourceH = useVideo ? video!.videoHeight : img!.naturalHeight;
      const drawSource: CanvasImageSource = useVideo ? video! : img!;

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

      // Ken Burns: compute animated source crop/offset from sceneProgress (0→1)
      let kbScale = 1;
      let kbOffsetX = 0;
      let kbOffsetY = 0;
      if (node.kenBurns) {
        const p = Math.max(0, Math.min(1, sceneProgress));
        switch (node.kenBurns) {
          case "zoom-in":  kbScale = 1 + p * 0.18; break;
          case "zoom-out": kbScale = 1.18 - p * 0.18; break;
          case "pan-left":  kbOffsetX = p * rect.w * 0.15; break;
          case "pan-right": kbOffsetX = -p * rect.w * 0.15; break;
        }
      }

      // Cover-fit source within rect with Ken Burns applied
      const scale = Math.max(rect.w / sourceW, rect.h / sourceH) * kbScale;
      const dw = sourceW * scale;
      const dh = sourceH * scale;
      ctx.drawImage(drawSource, rect.x + (rect.w - dw) / 2 + kbOffsetX, rect.y + (rect.h - dh) / 2 + kbOffsetY, dw, dh);

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

      // Split on newlines first, then word-wrap each paragraph
      const maxW = width * 0.82;
      const paragraphs = node.content.split("\n");
      const lines = paragraphs.flatMap(p => p.trim() ? wrapText(ctx, p, maxW) : [""]);
      const lineH = node.style.fontSize * node.style.lineHeight;
      const totalH = lines.length * lineH;

      // Adjust x anchor so text doesn't overflow when left/right aligned
      // ctx.textAlign controls which side the text hangs from the anchor point
      const textX = node.style.textAlign === "right"
        ? width * 0.41   // anchor near right edge → text flows left from there
        : node.style.textAlign === "left"
          ? -width * 0.41 // anchor near left edge → text flows right from there
          : 0;            // center → text centred at canvas midpoint

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
          if (l) ctx.fillText(l, textX, -totalH / 2 + i * lineH + lineH / 2);
        });
      } else {
        lines.forEach((l, i) => {
          ctx.fillText(l, textX, -totalH / 2 + i * lineH + lineH / 2);
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

    case "element": {
      const el = node.element;
      if (!el) break;
      // Compute pixel rect from percent-based box
      const px = (el.box.x / 100) * width;
      const py = (el.box.y / 100) * height;
      const pw = (el.box.w / 100) * width;
      const ph = (el.box.h / 100) * height;
      const padding = el.style?.padding ?? 0;
      const radius = el.style?.borderRadius ?? 0;

      ctx.globalAlpha = node.transform.alpha;

      // Optional rotation around the box's center
      if (el.rotation && el.rotation !== 0) {
        const ccx = px + pw / 2;
        const ccy = py + ph / 2;
        ctx.translate(ccx, ccy);
        ctx.rotate((el.rotation * Math.PI) / 180);
        ctx.translate(-ccx, -ccy);
      }

      // Draw container background and border (if any)
      if (el.style?.backgroundColor || el.style?.borderColor) {
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(px, py, pw, ph, radius);
        } else {
          ctx.rect(px, py, pw, ph);
        }
        if (el.style?.backgroundColor) {
          ctx.fillStyle = el.style.backgroundColor;
          ctx.fill();
        }
        if (el.style?.borderColor) {
          ctx.strokeStyle = el.style.borderColor;
          ctx.lineWidth = el.style.borderWidth ?? 2;
          ctx.stroke();
        }
      }

      // Inner content area (after padding)
      const ix = px + padding;
      const iy = py + padding;
      const iw = pw - padding * 2;
      const ih = ph - padding * 2;

      if (el.kind === "text") {
        const fontSize = el.fontSize ?? 24;
        const fontWeight = el.fontWeight ?? "normal";
        const fontFamily = el.fontFamily ?? "Inter, sans-serif";
        const align: CanvasTextAlign = (el.align ?? "left") as CanvasTextAlign;
        const vAlign = el.verticalAlign ?? "middle";
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.fillStyle = el.color ?? "#ffffff";
        ctx.textAlign = align;
        ctx.textBaseline = "middle";

        // Wrap text within iw
        const paragraphs = el.text.split("\n");
        const lines = paragraphs.flatMap((p) => p.trim() ? wrapText(ctx, p, iw) : [""]);
        const lineH = fontSize * 1.3;
        const totalH = lines.length * lineH;

        const tx = align === "left" ? ix : align === "right" ? ix + iw : ix + iw / 2;
        const ty0 = vAlign === "top"
          ? iy + lineH / 2
          : vAlign === "bottom"
          ? iy + ih - totalH + lineH / 2
          : iy + (ih - totalH) / 2 + lineH / 2;

        // Clip to box so text doesn't overflow visually
        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(px, py, pw, ph, radius);
        } else {
          ctx.rect(px, py, pw, ph);
        }
        ctx.clip();
        lines.forEach((l, i) => {
          ctx.fillText(l, tx, ty0 + i * lineH);
        });
        ctx.restore();
      } else if (el.kind === "image" || el.kind === "video") {
        const useVideo = el.kind === "video" || (el.kind === "image" && looksLikeVideo(el.url));
        const img = useVideo ? null : getCachedImage(el.url);
        const video = useVideo ? getCachedVideo(el.url) : null;
        const sourceReady = useVideo
          ? !!(video && video.readyState >= 2 && video.videoWidth > 0)
          : !!img;
        if (!sourceReady) {
          // Loading placeholder
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fillRect(ix, iy, iw, ih);
          break;
        }
        const sourceW = useVideo ? video!.videoWidth : img!.naturalWidth;
        const sourceH = useVideo ? video!.videoHeight : img!.naturalHeight;
        const drawSource: CanvasImageSource = useVideo ? video! : img!;

        // Clip to rounded rect
        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(ix, iy, iw, ih, Math.max(0, radius - padding));
        } else {
          ctx.rect(ix, iy, iw, ih);
        }
        ctx.clip();

        const fit = (el as { fit?: "cover" | "contain" | "fill" }).fit ?? "cover";
        let dw: number, dh: number, dx: number, dy: number;
        if (fit === "fill") {
          dw = iw; dh = ih; dx = ix; dy = iy;
        } else {
          const scale = fit === "contain"
            ? Math.min(iw / sourceW, ih / sourceH)
            : Math.max(iw / sourceW, ih / sourceH);
          dw = sourceW * scale;
          dh = sourceH * scale;
          dx = ix + (iw - dw) / 2;
          dy = iy + (ih - dh) / 2;
        }
        ctx.drawImage(drawSource, dx, dy, dw, dh);
        ctx.restore();
      } else if (el.kind === "chips") {
        const fontSize = el.fontSize ?? 22;
        const fontFamily = el.fontFamily ?? "Inter, sans-serif";
        const chipBg = el.chipColor ?? "rgba(16,185,129,0.20)";
        const chipFg = el.textColor ?? "#6ee7b7";
        const direction = el.direction ?? "row";
        ctx.font = `600 ${fontSize}px ${fontFamily}`;
        ctx.textBaseline = "middle";

        const padX = Math.round(fontSize * 0.55);
        const padY = Math.round(fontSize * 0.35);
        const gap = Math.round(fontSize * 0.45);
        const chipH = fontSize + padY * 2;
        const chipR = chipH / 2;

        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(px, py, pw, ph, radius);
        } else {
          ctx.rect(px, py, pw, ph);
        }
        ctx.clip();

        if (direction === "column") {
          // Stack vertically, centered horizontally
          let cy = iy;
          for (const chip of el.chips) {
            if (!chip) continue;
            const w = ctx.measureText(chip).width + padX * 2;
            const cx0 = ix + (iw - w) / 2;
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
              ctx.roundRect(cx0, cy, w, chipH, chipR);
            } else {
              ctx.rect(cx0, cy, w, chipH);
            }
            ctx.fillStyle = chipBg;
            ctx.fill();
            ctx.fillStyle = chipFg;
            ctx.textAlign = "center";
            ctx.fillText(chip, cx0 + w / 2, cy + chipH / 2);
            cy += chipH + gap;
            if (cy > iy + ih) break;
          }
        } else {
          // Wrap horizontally
          let cx0 = ix;
          let cy = iy;
          for (const chip of el.chips) {
            if (!chip) continue;
            const w = ctx.measureText(chip).width + padX * 2;
            if (cx0 + w > ix + iw && cx0 > ix) {
              cx0 = ix;
              cy += chipH + gap;
            }
            if (cy + chipH > iy + ih) break;
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
              ctx.roundRect(cx0, cy, w, chipH, chipR);
            } else {
              ctx.rect(cx0, cy, w, chipH);
            }
            ctx.fillStyle = chipBg;
            ctx.fill();
            ctx.fillStyle = chipFg;
            ctx.textAlign = "center";
            ctx.fillText(chip, cx0 + w / 2, cy + chipH / 2);
            cx0 += w + gap;
          }
        }
        ctx.restore();
      } else if (el.kind === "chart") {
        // Charts use the shared `drawChart` so the canvas preview AND
        // the export pipeline produce identical pixels — same code path
        // as the intake's <ChartRenderer>. Drawn into the inner content
        // area (after padding) so element-level borderRadius / padding
        // already applied above frame the chart correctly.
        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(px, py, pw, ph, radius);
        } else {
          ctx.rect(px, py, pw, ph);
        }
        ctx.clip();
        drawChart(ctx, {
          chartType: el.chartType,
          data: el.data,
          format: el.format,
          x: ix,
          y: iy,
          w: iw,
          h: ih,
          colors: el.colors,
          title: el.title,
          takeaway: el.takeaway,
          foreground: el.style?.borderColor ?? "#ffffff",
        });
        ctx.restore();
      }
      // "audio" elements are silent at draw time — they're handled by the
      // audio mixer / preview player; nothing to render visually.
      break;
    }

    default:
      break;
  }

  ctx.restore();
}
