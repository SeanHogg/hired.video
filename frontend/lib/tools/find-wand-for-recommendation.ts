// Map an analyzer recommendation to the wand that fixes it (#374). The
// analyzer emits a structured `{ actionId, actionArgs }` per recommendation
// (validated server-side by the same `parseRecommendationAction`); this
// resolver re-validates it and returns the registry tool to run — it never
// reads the prose. No action → no button (the caller self-gates on null).
//
// Single source — the tool pages' Action button and the kit's page findings
// both call it.

import { parseRecommendationAction, type WandActionId } from "@shared/tool-schemas";

export interface ResolvedWand {
  /** Registry tool id (lib/tools/registry.ts). */
  toolId: WandActionId;
  /** i18n key of the button label, so the user knows what's about to fire. */
  labelKey: string;
  /** `args` passed to `tool.run({ bound, args })`. */
  args: Record<string, unknown>;
}

export interface RecommendationActionLike {
  actionId?: unknown;
  actionArgs?: unknown;
}

export function findWandForRecommendation(rec: RecommendationActionLike): ResolvedWand | null {
  const action = parseRecommendationAction(rec.actionId, rec.actionArgs);
  if (!action) return null;
  return { toolId: action.actionId, labelKey: `wands.action.${action.actionId}`, args: action.actionArgs };
}
