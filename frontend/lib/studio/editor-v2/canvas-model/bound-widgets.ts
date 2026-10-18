/**
 * Factories for widgets bound to an external entity (linked content,
 * engagement assets). Part of the canvas-state model; re-exported by
 * `../canvas-state`.
 */

import { makeId } from "./ids";
import type { EngagementAssetWidgetParams, LinkedContentWidgetParams } from "./widget-params-embed";
import type { Widget } from "./widget-types";

/** Build a linked-content widget bound to a specific entity. Used by
 *  the palette's "Your content" section and the drag-drop pipeline so
 *  both surfaces produce identical default geometry / params. */
export function makeLinkedContentWidget(
  params: LinkedContentWidgetParams,
): Widget {
  return {
    id: makeId("w"),
    kind: "linked-content",
    position: { x: 0.1, y: 0.15, width: 0.42, height: 0.55, z: 1, rotation: 0 },
    params: { kind: "linked-content", data: params },
    visibleFrom: null,
    visibleTo: null,
    motion: null,
  };
}

/** Build an engagement-asset widget bound to a specific authored
 *  artifact (form / chapter / thumbnail / review). Used by both the
 *  palette section's click-to-insert and the canvas drop handler so
 *  both paths produce identical default geometry / params. */
export function makeEngagementAssetWidget(
  params: EngagementAssetWidgetParams,
): Widget {
  return {
    id: makeId("w"),
    kind: "engagement-asset",
    // Mid-canvas card by default — slightly narrower than linked-content
    // because engagement cards usually carry less content per surface
    // (a 2-field form vs. a full resume). Author resizes from there.
    position: { x: 0.25, y: 0.25, width: 0.4, height: 0.4, z: 1, rotation: 0 },
    params: { kind: "engagement-asset", data: params },
    visibleFrom: null,
    visibleTo: null,
    motion: null,
  };
}
