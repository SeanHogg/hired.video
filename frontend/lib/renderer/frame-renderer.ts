// frame-renderer.ts — evaluates animations and calls drawNode() for every
// visible node at a given timestamp.
//
// Layout pass: before drawing, content nodes (text / textGroup / skillBubble)
// are measured and re-stacked vertically so long text never overlaps.
//
// Watermark: "hired.video" pill drawn at full opacity after the scene composites.

import type { CompiledVideo, CompiledScene, SceneNode, Transform2D } from "../compiler/types";
import { drawNode, measureNodeHeight } from "./canvas-nodes";

// ─── Node classification ───────────────────────────────────────────────────────

const BG_TYPES = new Set<SceneNode["type"]>(["background", "overlay", "particles"]);

// ─── Dynamic layout pass ───────────────────────────────────────────────────────
// Measures each content node's actual rendered height (accounting for text wrap)
// and re-stacks them vertically, centred on the canvas, with a gap between nodes.

const LAYOUT_GAP_RATIO = 0.045; // gap = 4.5% of canvas height

function computeLayout(ctx: CanvasRenderingContext2D, nodes: SceneNode[]): SceneNode[] {
  const { height } = ctx.canvas;
  const contentNodes = nodes.filter(n => !BG_TYPES.has(n.type));
  if (contentNodes.length === 0) return nodes;

  const heights = contentNodes.map(n => measureNodeHeight(ctx, n));
  const gap = height * LAYOUT_GAP_RATIO;
  const totalH = heights.reduce((s, h) => s + h, 0) + gap * (contentNodes.length - 1);

  let curY = -totalH / 2;
  const laidOut = contentNodes.map((node, i) => {
    const centerY = curY + heights[i] / 2;
    curY += heights[i] + gap;
    return { ...node, transform: { ...node.transform, y: centerY } };
  });

  // bg nodes first (preserve draw order), then laid-out content
  return [...nodes.filter(n => BG_TYPES.has(n.type)), ...laidOut];
}

// ─── Animation evaluation ─────────────────────────────────────────────────────
// x and y animations are ADDITIVE offsets from the layout-computed base position.
// This means slideUp (y: 40→0) starts 40px below the resting position and
// settles exactly there — regardless of where the layout pass placed it.
// alpha/scaleX/scaleY remain absolute (base values are always 1).

function evaluateNode(node: SceneNode, elapsed: number): SceneNode {
  if (!node.animations.length) return node;

  const t: Transform2D = { ...node.transform };
  let textRevealProgress: number | undefined;

  for (const anim of node.animations) {
    const v = anim.evaluate(elapsed);
    if (anim.isTypewriter) {
      // For typewriter, v is the 0→1 reveal progress; don't set alpha
      textRevealProgress = v;
    } else {
      switch (anim.property) {
        case "alpha":  t.alpha  = v; break;
        case "x":      t.x      = node.transform.x + v; break; // additive offset
        case "y":      t.y      = node.transform.y + v; break; // additive offset
        case "scaleX": t.scaleX = v; break;
        case "scaleY": t.scaleY = v; break;
      }
    }
  }

  return { ...node, transform: t, textRevealProgress };
}

// ─── Scene transition ─────────────────────────────────────────────────────────

const FADE_DURATION = 0.25; // seconds

function sceneProgress(scene: CompiledScene, time: number): number {
  const elapsed = time - scene.start;
  if (elapsed < FADE_DURATION) return elapsed / FADE_DURATION;
  if (elapsed > scene.duration - FADE_DURATION) return (scene.duration - elapsed) / FADE_DURATION;
  return 1;
}

function renderScene(
  ctx: CanvasRenderingContext2D,
  compiledVideo: CompiledVideo,
  scene: CompiledScene,
  time: number,
  alpha: number,
  offsetX = 0,
): void {
  const elapsed = time - scene.start;
  ctx.save();
  ctx.globalAlpha = alpha;
  if (offsetX !== 0) ctx.translate(offsetX, 0);

  const laidOutNodes = computeLayout(ctx, scene.nodes);
  for (const node of laidOutNodes) {
    const resolved = evaluateNode(node, elapsed);
    drawNode(ctx, resolved);
  }
  ctx.restore();
}

// ─── Watermark ────────────────────────────────────────────────────────────────

function drawWatermark(ctx: CanvasRenderingContext2D): void {
  const { width, height } = ctx.canvas;
  const fontSize = Math.max(11, Math.round(width / 58)); // ~22px at 1280, ~12px at 720
  const label = "hired.video";
  const padX = Math.round(fontSize * 1.1);
  const padY = Math.round(fontSize * 0.55);

  ctx.save();
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;

  const textW = ctx.measureText(label).width;
  const pillW = textW + padX * 2;
  const pillH = fontSize + padY * 2;
  const margin = Math.round(width / 60);
  const x = width - pillW - margin;
  const y = height - pillH - margin;

  // Dark pill background
  ctx.globalAlpha = 0.52;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.roundRect(x, y, pillW, pillH, pillH / 2);
  ctx.fill();

  // "hired.video" label — dot in accent colour
  ctx.globalAlpha = 0.88;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Draw "hired" in white, ".video" in brand purple
  const cx = x + pillW / 2;
  const cy = y + pillH / 2;
  const hiredW = ctx.measureText("hired").width;
  const dotVideoW = ctx.measureText(".video").width;
  const totalW = hiredW + dotVideoW;
  const startX = cx - totalW / 2;

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText("hired", startX, cy);
  ctx.fillStyle = "#a78bfa"; // brand purple
  ctx.fillText(".video", startX + hiredW, cy);

  ctx.restore();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function render(
  ctx: CanvasRenderingContext2D,
  compiledVideo: CompiledVideo,
  time: number,
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const scene = compiledVideo.getSceneAt(time);
  const progress = sceneProgress(scene, time);
  const transition = compiledVideo.transition ?? "fade";

  // Find adjacent scene for transitions that need two frames
  const elapsed = time - scene.start;
  const isExiting = elapsed > scene.duration - FADE_DURATION;
  const sceneIndex = compiledVideo.scenes.indexOf(scene);
  const nextScene = isExiting && sceneIndex < compiledVideo.scenes.length - 1
    ? compiledVideo.scenes[sceneIndex + 1]
    : null;
  const prevScene = elapsed < FADE_DURATION && sceneIndex > 0
    ? compiledVideo.scenes[sceneIndex - 1]
    : null;
  const adjacentScene = nextScene ?? prevScene;

  switch (transition) {
    case "cut": {
      // Instant switch — no blending
      renderScene(ctx, compiledVideo, scene, time, 1);
      break;
    }

    case "slide": {
      // Current scene slides out left; next slides in from right (or reverse for prev)
      if (adjacentScene && progress < 1) {
        const t = 1 - progress; // 0=fully in, 1=fully out
        if (isExiting && nextScene) {
          renderScene(ctx, compiledVideo, scene, time, 1, -t * width);
          renderScene(ctx, compiledVideo, nextScene, nextScene.start, 1, (1 - t) * width);
        } else if (!isExiting && prevScene) {
          renderScene(ctx, compiledVideo, prevScene, prevScene.start + prevScene.duration - 0.01, 1, -(1 - progress) * width);
          renderScene(ctx, compiledVideo, scene, time, 1, progress * width);
        } else {
          renderScene(ctx, compiledVideo, scene, time, 1);
        }
      } else {
        renderScene(ctx, compiledVideo, scene, time, 1);
      }
      break;
    }

    case "cinematic-fade": {
      // Fade to black at midpoint, then fade new scene in from black
      if (progress < 1) {
        if (progress < 0.5) {
          // Fading out: render current scene, darken with overlay
          renderScene(ctx, compiledVideo, scene, time, 1);
          ctx.save();
          ctx.globalAlpha = 1 - progress * 2;
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        } else if (adjacentScene) {
          // Fading in next scene from black
          const fadeIn = (progress - 0.5) * 2;
          renderScene(ctx, compiledVideo, adjacentScene,
            isExiting ? adjacentScene.start : adjacentScene.start + adjacentScene.duration - 0.01,
            fadeIn);
        }
      } else {
        renderScene(ctx, compiledVideo, scene, time, 1);
      }
      break;
    }

    default: // "fade" — simple alpha crossfade
      if (adjacentScene && progress < 1) {
        const adjTime = isExiting
          ? adjacentScene.start
          : adjacentScene.start + adjacentScene.duration - 0.01;
        renderScene(ctx, compiledVideo, adjacentScene, adjTime, 1 - progress);
      }
      renderScene(ctx, compiledVideo, scene, time, progress < 1 ? progress : 1);
      break;
  }

  // Watermark rendered at full opacity, outside scene fade
  drawWatermark(ctx);
}

/** Renders a single frame to an OffscreenCanvas or regular canvas synchronously. */
export function renderFrame(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  compiledVideo: CompiledVideo,
  time: number,
): void {
  const ctx = (canvas as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) return;
  render(ctx, compiledVideo, time);
}
