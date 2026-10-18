/** Small helpers shared by the per-kind entries. */
import type { Widget, WidgetKind, WidgetParams, WidgetPosition } from "../canvas-model/widget-types";

/** A widget with no visibility window and no motion — the shape every
 *  default widget starts from (key order is part of the saved JSON). */
export function widgetOf(
  id: string,
  kind: WidgetKind,
  position: WidgetPosition,
  params: WidgetParams,
): Widget {
  return {
    id,
    kind,
    position,
    params,
    visibleFrom: null,
    visibleTo: null,
    motion: null,
  };
}

/** For kinds with no authored text. */
export function noText(): string {
  return "";
}

/** For kinds v1's `SceneElement` union can't represent. */
export function noScriptElement(): null {
  return null;
}
