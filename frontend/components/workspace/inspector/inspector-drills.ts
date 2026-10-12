/**
 * An inspector's rows, as data (A2 boards: `Label <small>hint</small> ›`).
 * Every kit inspector — the résumé's "This line", the letter, the video
 * scene — is a registry of drills: Simple shows the "simple" rows, Advanced
 * APPENDS the "advanced" ones, and each row opens its View in place in the
 * right slot (the slot header's ‹ goes back). Adding a row is one entry in
 * a registry plus its View file.
 */
import type { ComponentType } from "react";
import type { TFunction } from "i18next";

export type InspectorDepth = "simple" | "advanced";

export interface InspectorDrill<Ctx extends object> {
  /** The row's label (and the drill's title in the slot header). */
  labelKey: string;
  /** Simple rows always show; advanced rows only under Advanced. */
  depth: InspectorDepth;
  /** The short context after the label ("say how", "3 from your résumé"). */
  hint?: (ctx: Ctx, t: TFunction) => string | null | undefined;
  /** A tag after the label ("Whole video"), as a translation key. */
  tagKey?: string;
  /** The owner changed it from the default (a dot on the row). */
  isSet?: (ctx: Ctx) => boolean;
  /** What the row opens, in the slot. */
  View: ComponentType<Ctx>;
}

export interface InspectorDrillRegistry<Id extends string, Ctx extends object> {
  /** Row order (Simple rows first, then Advanced, as the board lists them). */
  ids: readonly Id[];
  drills: Record<Id, InspectorDrill<Ctx>>;
}

/** A registry, typed once. */
export function defineDrills<Id extends string, Ctx extends object>(
  ids: readonly Id[],
  drills: Record<Id, InspectorDrill<Ctx>>,
): InspectorDrillRegistry<Id, Ctx> {
  return { ids, drills };
}

/** The rows at one depth, in order. Pure. */
export function drillIdsAt<Id extends string, Ctx extends object>(registry: InspectorDrillRegistry<Id, Ctx>, depth: InspectorDepth): Id[] {
  return registry.ids.filter((id) => registry.drills[id].depth === depth);
}

/** Whether a row shows at this depth (an advanced row never under Simple). Pure. */
export function isDrillShown<Id extends string, Ctx extends object>(
  registry: InspectorDrillRegistry<Id, Ctx>,
  id: Id,
  advanced: boolean,
): boolean {
  const def = registry.drills[id];
  return !!def && (advanced || def.depth === "simple");
}
