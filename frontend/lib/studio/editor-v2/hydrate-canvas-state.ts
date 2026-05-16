/**
 * hydrateCanvasState — fill a seeded CanvasState with the user's content
 * by string-substituting the placeholders declared in
 * `template-content-slots.ts`.
 *
 * Read-only on the input — returns a structurally cloned canvas so the
 * caller can hand it straight to `canvasStateToTimeline()` without
 * worrying about aliasing the original seed. Currently substitutes text
 * + heading widgets; CTA/chips substitution is deferred behind the
 * gap-register entry for richer slot binding.
 */

import type { ContentTemplate } from "@/components/studio/templates/catalog";
import type { CanvasState, Widget } from "./canvas-state";
import { TEMPLATE_SLOTS } from "./template-content-slots";
import type { UserContentSnapshot } from "./resolve-user-content";

function substituteWidgetText(widget: Widget, replacements: Array<[string, string]>): Widget {
  if (widget.params.kind !== "text" && widget.params.kind !== "heading") {
    return widget;
  }
  let text = widget.params.data.text;
  let changed = false;
  for (const [placeholder, value] of replacements) {
    if (text.includes(placeholder)) {
      text = text.split(placeholder).join(value);
      changed = true;
    }
  }
  if (!changed) return widget;
  return {
    ...widget,
    params: {
      ...widget.params,
      data: { ...widget.params.data, text },
    },
  };
}

export function hydrateCanvasState(
  state: CanvasState,
  templateId: ContentTemplate,
  uc: UserContentSnapshot,
): CanvasState {
  const slots = TEMPLATE_SLOTS[templateId];
  if (!slots || slots.length === 0) return state;

  const replacements: Array<[string, string]> = [];
  for (const slot of slots) {
    const value = slot.read(uc);
    if (value && value.trim() !== "") {
      replacements.push([slot.placeholder, value]);
    }
  }
  if (replacements.length === 0) return state;

  return {
    ...state,
    scenes: state.scenes.map((scene) => ({
      ...scene,
      widgets: scene.widgets.map((w) => substituteWidgetText(w, replacements)),
    })),
  };
}
