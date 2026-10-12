/**
 * The AI Tools offered at a kit stage, read from the catalog's
 * `buildStage`, and how each opens there. Nothing leaves the page:
 *   run   — the registry can run it on the open draft as-is (no input only
 *           you have): it runs in the chat and its result is a card there;
 *   panel — it needs input (a job post, a file, a form), or its page is
 *           where the result lives (Career 360's wheel and plan): its own page opens
 *           in a slide-out over the résumé (components/tools/tool-pages.ts,
 *           bound to the draft by lib/tools/tool-embed.tsx).
 */
import { TOOLS_CATALOG, type ToolCatalogEntry } from "@/data/tools-catalog";
import { getTool } from "@/lib/tools/registry";
import type { BuildStageId } from "./build-stages";

export type StageToolMode = "run" | "panel";

export function toolsForStage(stage: BuildStageId): ToolCatalogEntry[] {
  return TOOLS_CATALOG.filter((entry) => entry.buildStage === stage);
}

/** "run" when the registry tool needs no argument the draft can't supply
 *  and its page isn't where the result lives (`buildOpensPage`). */
export function stageToolMode(toolId: string): StageToolMode {
  if (TOOLS_CATALOG.some((entry) => entry.id === toolId && entry.buildOpensPage)) return "panel";
  const params = getTool(toolId)?.parameters;
  return params && !(params.required?.length ?? 0) ? "run" : "panel";
}
