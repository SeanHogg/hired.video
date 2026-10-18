/**
 * Extract a flat plain-text script from a v2 `CanvasState`.
 *
 * Used by surfaces that need the project's spoken / written content
 * but DON'T need the full V1 `VideoScript` shape — ATS Package export,
 * Skills Demo seeding, and any future "what does this video say?"
 * consumer. Replaces the prior pattern of calling `canvasStateToScript()`
 * just to immediately flatten `scenes[].title/subtitle/text` back to
 * strings, which forced the V1 compile path's surface area on callers
 * who only wanted the text.
 *
 * Format: one block per scene, blank-line separated. Within a scene,
 * widget content is joined with `" — "` so a reader can tell the
 * boundaries without parsing structure. Text comes from every widget
 * that carries human-readable content: text / heading / chips / cta /
 * linked-content (title only — body lines aren't authored on the
 * canvas, they're fetched from the entity, so they're not "what the
 * video says").
 *
 * Per the standing DRY rule: every text-only extraction goes through
 * this helper. No caller hand-rolls a switch over widget kinds — the
 * per-kind text is `toText` on `widget-kinds/registry.ts`.
 */
import type { CanvasState, Widget } from "./canvas-state";
import { widgetParamsToText } from "./widget-kinds/registry";

export function canvasStateToText(state: CanvasState): string {
  return state.scenes
    .map((scene) =>
      scene.widgets
        .map(widgetToText)
        .filter((s) => s.length > 0)
        .join(" — "),
    )
    .filter((block) => block.length > 0)
    .join("\n\n");
}

function widgetToText(widget: Widget): string {
  return widgetParamsToText(widget.params);
}
