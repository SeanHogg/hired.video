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
 * this helper. No caller hand-rolls a switch over widget kinds.
 */
import type { CanvasState, Widget } from "./canvas-state";

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
  const p = widget.params;
  switch (p.kind) {
    case "text":
    case "heading":
      return p.data.text.trim();
    case "chips":
      return p.data.chips.filter(Boolean).join(", ");
    case "cta": {
      const headline = p.data.headline?.trim();
      const sub = p.data.subheadline?.trim();
      const cta = p.data.ctaText?.trim();
      return [headline, sub, cta].filter(Boolean).join(" · ");
    }
    case "linked-content":
      // Entity body is fetched at render time, not authored here, so
      // we don't include it. The widget's presence still counts via
      // the entity kind label — useful for ATS readers who want to
      // know "Resume embedded here".
      return `[${p.data.entityKind} embedded]`;
    case "image":
    case "video":
    case "shape-rect":
    case "shape-circle":
    case "divider":
    case "chart":
    case "webcam":
      return "";
  }
}
