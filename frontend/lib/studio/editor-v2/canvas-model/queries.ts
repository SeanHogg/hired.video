/**
 * Derived read helpers over a `CanvasState`. Part of
 * the canvas-state model; re-exported by `../canvas-state`.
 */

import type { CanvasState, Scene } from "./scene-types";
import type { Widget } from "./widget-types";

// ───────────────────────────────────────────────────────────────────────────
// Derived helpers — every consumer that asks "what's the total length?"
// or "find a widget by id" calls these instead of hand-rolling the loop.
// ───────────────────────────────────────────────────────────────────────────

export function totalDurationSeconds(state: CanvasState): number {
  return state.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
}

export function findWidget(
  state: CanvasState,
  widgetId: string,
): { scene: Scene; widget: Widget } | null {
  for (const scene of state.scenes) {
    const widget = scene.widgets.find((w) => w.id === widgetId);
    if (widget) return { scene, widget };
  }
  return null;
}

export function findScene(state: CanvasState, sceneId: string): Scene | null {
  return state.scenes.find((s) => s.id === sceneId) ?? null;
}
