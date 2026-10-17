// The tool catalog: every AI tool in the app, concatenated from the focused
// data files, plus the lookups over it. Each entry declares the entity types
// it accepts as input; context menus call getToolsForContext to surface the
// tools valid for the current entity (resume, job, video, template, company).

import { journeyTools } from "../journey-tools";
import { resumeWandTools } from "../resume-wands";
import type { ToolDefinition, ToolEntityType } from "../types";
import { studioCreateTools } from "./catalog-create";
import { resumeEditTools } from "./catalog-edits";
import { resumeAnalysisTools } from "./catalog-resume";
import { studioEditorTools } from "./catalog-studio-editor";
import { bindToolLookup } from "./tool-lookup";

export const toolRegistry: ToolDefinition[] = [
  ...resumeAnalysisTools,
  ...studioCreateTools,
  ...resumeEditTools,
  ...studioEditorTools,
  // Create → Promote journey tools (Roast, Career 360, research, salary,
  // pitch script, profile audit, profile blocks) — see journey-tools.ts.
  ...journeyTools,
  ...resumeWandTools,
];

export function getTool(id: string): ToolDefinition | undefined {
  return toolRegistry.find((t) => t.id === id);
}

bindToolLookup(getTool);

/**
 * Tools available from a given entity's context menu — any tool whose
 * inputs include that entity type. Additional inputs are gathered in the
 * dialog (e.g. a pasted job description for a resume-anchored tailor run).
 */
export function getToolsForContext(entity: ToolEntityType): ToolDefinition[] {
  return toolRegistry.filter((t) => t.inputs.includes(entity));
}

/** Tools that can't run inside the quick-run dialog (full page only). */
// Employer research + salary take free-form inputs (company / role / city)
// the quick-run dialog doesn't collect; the AI passes them as arguments.
const FULL_PAGE_ONLY = new Set<string>(["value-proposition", "employer-research", "salary-calculator"]);

export function isInlineRunnable(tool: ToolDefinition): boolean {
  return !FULL_PAGE_ONLY.has(tool.id);
}
