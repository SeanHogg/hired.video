/**
 * Layer order → z. The layers list is front-to-back (top row = in front);
 * the canvas stacks by `position.z` (higher = in front). ONE rule for the
 * studio editor's layers and a kit video's (overrides on the résumé).
 */
export function layerZ(widgetIdsFrontToBack: readonly string[], widgetId: string): number {
  const idx = widgetIdsFrontToBack.indexOf(widgetId);
  return idx < 0 ? 0 : widgetIdsFrontToBack.length - 1 - idx;
}
