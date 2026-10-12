/**
 * Interaction zones for a playing CanvasState — read from the SAME Timeline
 * the export paints (`canvasStateToTimeline`), so every clickable box sits
 * exactly over the painted widget in every player (#1586, #2312).
 */
import { useMemo } from "react";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { extractInteractionZones, type InteractionZone } from "./interactions";
import { pluginForWidgetKind } from "./registry";

const NONE: InteractionZone[] = [];

/** True when any scene carries a widget its plugin says a viewer can
 *  interact with (a linked CTA, a bound engagement card) — the cheap check
 *  that skips the Timeline emit for the common no-interaction canvas. */
export function hasInteractiveWidget(state: CanvasState): boolean {
  return state.scenes.some((scene) =>
    scene.widgets.some((w) => {
      const plugin = pluginForWidgetKind(w.params.kind);
      return plugin.interactive && plugin.interactions(plugin.emit(w.params)).length > 0;
    }),
  );
}

export function useInteractionZones(state: CanvasState): InteractionZone[] {
  return useMemo(
    () => (hasInteractiveWidget(state) ? extractInteractionZones(canvasStateToTimeline(state)) : NONE),
    [state],
  );
}
