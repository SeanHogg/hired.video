/**
 * The studio home's "Or start from a template" picks — a few use-for tabs
 * over the built-in catalog ("Get hired" first, as the full Templates
 * section orders it). Data, not branches: a new tab is one entry here.
 * Pure (no React).
 */
import { TEMPLATE_CATALOG, type TemplateDef } from "@/lib/studio/templates/catalog";
import { isGetHiredTemplate } from "@/lib/studio/career-starts";

export interface TemplateStart {
  id: string;
  labelKey: string;
  matches: (template: TemplateDef) => boolean;
}

export const TEMPLATE_STARTS: readonly TemplateStart[] = [
  { id: "getHired", labelKey: "studio.newMenu.tag.getHired", matches: (t) => isGetHiredTemplate(t.id) },
  { id: "promote", labelKey: "studio.landing.templateStart.promote", matches: (t) => t.category === "promote" },
  { id: "showcase", labelKey: "studio.landing.templateStart.showcase", matches: (t) => t.category === "showcase" },
  { id: "quick", labelKey: "studio.landing.templateStart.quick", matches: (t) => t.category === "quick" },
];

/** How many templates the panel shows per tab. */
export const TEMPLATE_START_COUNT = 6;

export function templatesForStart(startId: string, catalog: readonly TemplateDef[] = TEMPLATE_CATALOG): TemplateDef[] {
  const start = TEMPLATE_STARTS.find((s) => s.id === startId) ?? TEMPLATE_STARTS[0];
  return catalog.filter(start.matches).slice(0, TEMPLATE_START_COUNT);
}
