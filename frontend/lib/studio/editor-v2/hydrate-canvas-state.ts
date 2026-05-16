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

function applyReplacements(input: string, replacements: Array<[string, string]>): { value: string; changed: boolean } {
  let value = input;
  let changed = false;
  for (const [placeholder, replacement] of replacements) {
    if (value.includes(placeholder)) {
      value = value.split(placeholder).join(replacement);
      changed = true;
    }
  }
  return { value, changed };
}

function substituteWidgetText(widget: Widget, replacements: Array<[string, string]>): Widget {
  const params = widget.params;
  // #690 — text/heading were the original substitution targets. Extended
  // to CTA (`headline` / `subheadline` / `ctaText` / `ctaUrl`) and chips
  // (`chips[]`) so a full template-to-published-video flow doesn't leave
  // [bracket] placeholders behind.
  if (params.kind === "text" || params.kind === "heading") {
    const { value, changed } = applyReplacements(params.data.text, replacements);
    if (!changed) return widget;
    return { ...widget, params: { ...params, data: { ...params.data, text: value } } };
  }
  if (params.kind === "cta") {
    const headline = applyReplacements(params.data.headline, replacements);
    const subheadline = params.data.subheadline
      ? applyReplacements(params.data.subheadline, replacements)
      : { value: params.data.subheadline ?? "", changed: false };
    const ctaText = applyReplacements(params.data.ctaText, replacements);
    const ctaUrl = applyReplacements(params.data.ctaUrl, replacements);
    if (!headline.changed && !subheadline.changed && !ctaText.changed && !ctaUrl.changed) {
      return widget;
    }
    return {
      ...widget,
      params: {
        ...params,
        data: {
          ...params.data,
          headline: headline.value,
          subheadline: params.data.subheadline ? subheadline.value : params.data.subheadline,
          ctaText: ctaText.value,
          ctaUrl: ctaUrl.value,
        },
      },
    };
  }
  if (params.kind === "chips") {
    let changed = false;
    const chips = params.data.chips.map((chip) => {
      const res = applyReplacements(chip, replacements);
      if (res.changed) changed = true;
      return res.value;
    });
    if (!changed) return widget;
    return { ...widget, params: { ...params, data: { ...params.data, chips } } };
  }
  return widget;
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
