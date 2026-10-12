/**
 * A studio inspector's sections as the workspace's ONE drill list
 * (components/workspace/inspector): each section is a row that opens in
 * place — the plain ones are Simple's rows, Advanced appends the rest. The
 * section's title key is the row's label key (translated by the rows). Pure, apart
 * from a per-section View cache so an open section never remounts.
 */
import type { ComponentType } from "react";
import { defineDrills, type InspectorDrill, type InspectorDrillRegistry } from "@/components/workspace/inspector/inspector-drills";
import type { InspectorSection } from "./types";

// One stable View per section object (sections are module-level data).
const VIEWS = new WeakMap<object, unknown>();

function viewFor<Ctx extends object>(section: InspectorSection<Ctx>): ComponentType<Ctx> {
  const cached = VIEWS.get(section) as ComponentType<Ctx> | undefined;
  if (cached) return cached;
  const View = (ctx: Ctx) => <div className="p-3">{section.render(ctx)}</div>;
  View.displayName = `InspectorSection(${section.id})`;
  VIEWS.set(section, View);
  return View;
}

/** The visible sections → a drill registry (plain = Simple rows, more = Advanced rows). */
export function sectionDrills<Ctx extends object>(
  plain: readonly InspectorSection<Ctx>[],
  more: readonly InspectorSection<Ctx>[],
  ctx: Ctx,
): InspectorDrillRegistry<string, Ctx> {
  const shown = (s: InspectorSection<Ctx>) => (s.visible ? s.visible(ctx) : true);
  const entries: [InspectorSection<Ctx>, InspectorDrill<Ctx>["depth"]][] = [
    ...plain.filter(shown).map((s) => [s, "simple"] as [InspectorSection<Ctx>, "simple"]),
    ...more.filter(shown).map((s) => [s, "advanced"] as [InspectorSection<Ctx>, "advanced"]),
  ];
  const drills: Record<string, InspectorDrill<Ctx>> = {};
  for (const [section, depth] of entries) {
    drills[section.id] = { labelKey: section.titleKey, depth, View: viewFor(section) };
  }
  return defineDrills(Object.keys(drills), drills);
}
