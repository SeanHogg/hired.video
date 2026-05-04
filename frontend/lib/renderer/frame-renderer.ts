// frame-renderer.ts — evaluates animations and calls drawNode() for every
// visible node at a given timestamp.
//
// Layout pass: before drawing, content nodes (text / textGroup / skillBubble)
// are measured and re-stacked vertically so long text never overlaps.
//
// Watermark: "hired.video" pill drawn at full opacity after the scene composites.

import type { CompiledVideo, CompiledScene, SceneNode, Transform2D } from "../compiler/types";
import { drawNode, measureNodeHeight } from "./canvas-nodes";
import { applyEffects } from "../timeline/effects";

// ─── Node classification ───────────────────────────────────────────────────────

const BG_TYPES = new Set<SceneNode["type"]>(["background", "overlay", "particles"]);

// ─── Dynamic layout pass ───────────────────────────────────────────────────────
// Measures each content node's actual rendered height (accounting for text wrap)
// and re-stacks them vertically, centred on the canvas, with a gap between nodes.

const LAYOUT_GAP_RATIO = 0.045; // gap = 4.5% of canvas height

function computeLayout(ctx: CanvasRenderingContext2D, nodes: SceneNode[], contentPosition?: "top" | "center" | "bottom"): SceneNode[] {
  const { height } = ctx.canvas;
  const contentNodes = nodes.filter(n => !BG_TYPES.has(n.type));
  if (contentNodes.length === 0) return nodes;

  const heights = contentNodes.map(n => measureNodeHeight(ctx, n));
  const gap = height * LAYOUT_GAP_RATIO;
  const totalH = heights.reduce((s, h) => s + h, 0) + gap * (contentNodes.length - 1);

  let curY: number;
  if (contentPosition === "top") {
    curY = -(height / 2) + height * 0.09;
  } else if (contentPosition === "bottom") {
    curY = height / 2 - height * 0.09 - totalH;
  } else {
    curY = -totalH / 2;
  }

  const laidOut = contentNodes.map((node, i) => {
    const centerY = curY + heights[i] / 2;
    curY += heights[i] + gap;
    return { ...node, transform: { ...node.transform, y: centerY } };
  });

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

  const laidOutNodes = computeLayout(ctx, scene.nodes, scene.contentPosition);
  for (const node of laidOutNodes) {
    const resolved = evaluateNode(node, elapsed);
    drawNode(ctx, resolved, elapsed, scene.duration > 0 ? elapsed / scene.duration : 0);
  }

  // Run scene-level effects against the freshly composited frame.
  // Same shared registry the Timeline render path uses — there is no
  // "scene effects" vs "timeline effects" fork. Effects are sync per
  // the registry contract.
  if (scene.effects && scene.effects.length > 0) {
    const fps = compiledVideo.fps || 30;
    const elapsedFrames = Math.round(elapsed * fps);
    const totalFrames = Math.max(1, Math.round(scene.duration * fps));
    applyEffects(scene.effects, {
      ctx,
      canvas: ctx.canvas,
      timelineFrame: Math.round(time * fps),
      clipFrame: elapsedFrames,
      clipDurationFrames: totalFrames,
      fps,
    });
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

/** Render-time options. Currently only carries the preview flag — added so
 *  the in-app scrubber can suppress the watermark on the first scene to
 *  keep early-scene previews free of upgrade nudges, without affecting the
 *  final export (which always renders branding for free users). */
export interface RenderOptions {
  /** True when this frame is for the in-app preview canvas. */
  previewMode?: boolean;
}

export function render(
  ctx: CanvasRenderingContext2D,
  compiledVideo: CompiledVideo,
  time: number,
  options?: RenderOptions,
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  const scene = compiledVideo.getSceneAt(time);
  const progress = sceneProgress(scene, time);
  const themeTransition = compiledVideo.transition ?? "fade";

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

  // Per-boundary transition override (gap #124): when exiting toward N+1
  // we use N+1's `transitionIn`; when entering from prev, this scene's own
  // `transitionIn` wins. Both fall back to the theme default.
  const transition = isExiting && nextScene?.transitionIn
    ? nextScene.transitionIn
    : (!isExiting && scene.transitionIn) || themeTransition;

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

  // Watermark rendered at full opacity, outside scene fade.
  // Gated by compiledVideo.includeBranding (default true) so Pro users who
  // opt out at compile time get a clean frame. Additionally suppressed
  // inside the first scene when this is a preview render — the in-app
  // scrubber routinely lands on t=0 (e.g. clicking the first storyboard
  // card) and we don't want the watermark to be the first impression of
  // the user's own work. The final export ignores `previewMode`, so free
  // users still see branding in the deliverable.
  if (compiledVideo.includeBranding !== false && !isInFirstScenePreview(compiledVideo, time, options)) {
    drawWatermark(ctx);
  }
}

/** True when this frame is a preview AND we're still inside the first
 *  scene's window. Defined here so the rule lives next to the watermark
 *  call site and is easy to find when tweaking the preview-vs-export
 *  balance. */
function isInFirstScenePreview(
  compiledVideo: CompiledVideo,
  time: number,
  options?: RenderOptions,
): boolean {
  if (!options?.previewMode) return false;
  const first = compiledVideo.scenes[0];
  if (!first) return false;
  return time < first.start + first.duration;
}

/** Renders a single frame to an OffscreenCanvas or regular canvas synchronously. */
export function renderFrame(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  compiledVideo: CompiledVideo,
  time: number,
  options?: RenderOptions,
): void {
  const ctx = (canvas as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) return;
  render(ctx, compiledVideo, time, options);
}
