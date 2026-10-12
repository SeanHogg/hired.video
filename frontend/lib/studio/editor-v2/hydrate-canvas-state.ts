/**
 * hydrateCanvasState — fill a seeded CanvasState with the user's content
 * by substituting the slot placeholders declared in
 * `template-content-slots.ts`.
 *
 * Read-only on the input — returns a structurally cloned canvas so the
 * caller can hand it straight to `canvasStateToTimeline()` without
 * worrying about aliasing the original seed. Substitutes text + heading
 * widgets, CTA fields and chips.
 *
 * Substitution is ONE pass over each field (longest placeholder first), so a
 * value just written in is never re-matched by a later placeholder (a name
 * "Gordon" must not be hit by the "Go" chip slot). `whole` slots replace only
 * a field that equals the placeholder.
 */

import type { ContentTemplate } from "@/lib/studio/templates/catalog";
import type { CanvasState, Widget } from "./canvas-state";
import { TEMPLATE_SLOTS } from "./template-content-slots";
import type { UserContentSnapshot } from "./resolve-user-content";

interface Replacer {
  (input: string): { value: string; changed: boolean };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One replacer over the resolved slot values. */
function buildReplacer(whole: Map<string, string>, parts: Map<string, string>): Replacer {
  const keys = [...parts.keys()].sort((a, b) => b.length - a.length);
  const re = keys.length > 0 ? new RegExp(keys.map(escapeRegExp).join("|"), "g") : null;
  return (input) => {
    const exact = whole.get(input);
    if (exact !== undefined) return { value: exact, changed: true };
    if (!re) return { value: input, changed: false };
    let changed = false;
    const value = input.replace(re, (match) => {
      changed = true;
      return parts.get(match) ?? match;
    });
    return { value, changed };
  };
}

function substituteWidgetText(widget: Widget, replace: Replacer): Widget {
  const params = widget.params;
  // #690 — text/heading were the original substitution targets. Extended
  // to CTA (`headline` / `subheadline` / `ctaText` / `ctaUrl`) and chips
  // (`chips[]`) so a full template-to-published-video flow doesn't leave
  // sample copy behind.
  if (params.kind === "text" || params.kind === "heading") {
    const { value, changed } = replace(params.data.text);
    if (!changed) return widget;
    return { ...widget, params: { ...params, data: { ...params.data, text: value } } };
  }
  if (params.kind === "cta") {
    const headline = replace(params.data.headline);
    const subheadline = params.data.subheadline
      ? replace(params.data.subheadline)
      : { value: params.data.subheadline ?? "", changed: false };
    const ctaText = replace(params.data.ctaText);
    const ctaUrl = replace(params.data.ctaUrl);
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
      const res = replace(chip);
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

  const whole = new Map<string, string>();
  const parts = new Map<string, string>();
  for (const slot of slots) {
    const value = slot.read(uc);
    if (!value || value.trim() === "") continue;
    (slot.whole ? whole : parts).set(slot.placeholder, value);
  }
  if (whole.size === 0 && parts.size === 0) return state;
  const replace = buildReplacer(whole, parts);

  return {
    ...state,
    scenes: state.scenes.map((scene) => ({
      ...scene,
      widgets: scene.widgets.map((w) => substituteWidgetText(w, replace)),
    })),
  };
}
