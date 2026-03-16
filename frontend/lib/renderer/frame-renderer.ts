// frame-renderer.ts — evaluates animations and calls drawNode() for every
// visible node at a given timestamp.

import type { CompiledVideo, CompiledScene, SceneNode, Transform2D } from "../compiler/types";
import { drawNode } from "./canvas-nodes";

// ─── Animation evaluation ─────────────────────────────────────────────────────

function evaluateNode(node: SceneNode, elapsed: number): SceneNode {
  if (!node.animations.length) return node;

  // Start from the node's base transform and layer animation overrides
  const t: Transform2D = { ...node.transform };

  for (const anim of node.animations) {
    const v = anim.evaluate(elapsed);
    switch (anim.property) {
      case "alpha":  t.alpha  = v; break;
      case "x":      t.x      = v; break;
      case "y":      t.y      = v; break;
      case "scaleX": t.scaleX = v; break;
      case "scaleY": t.scaleY = v; break;
    }
  }

  return { ...node, transform: t };
}

// ─── Scene transition ─────────────────────────────────────────────────────────

function sceneAlpha(scene: CompiledScene, time: number): number {
  const elapsed = time - scene.start;
  const fadeDuration = 0.25; // seconds for fade in/out
  if (elapsed < fadeDuration) return elapsed / fadeDuration;
  if (elapsed > scene.duration - fadeDuration) return (scene.duration - elapsed) / fadeDuration;
  return 1;
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
  const elapsed = time - scene.start;
  const globalAlpha = sceneAlpha(scene, time);

  ctx.save();
  ctx.globalAlpha = globalAlpha;

  for (const node of scene.nodes) {
    const resolved = evaluateNode(node, elapsed);
    drawNode(ctx, resolved);
  }

  ctx.restore();
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
