// A creator's public templates, grouped by what they make — résumé templates
// first, then video and every other kind (#866). Pure; the profile tab
// renders it. One listing feeds both groups: a résumé template is a studio
// template with documentKind 'resume'.

import type { StudioTemplate } from "@/lib/services/studio-templates-service";
import { fromStudioCreator } from "./registry";
import { isResumeTemplate, type TemplateMeta } from "./types";

export interface ProfileTemplateGroups {
  resume: TemplateMeta[];
  other: TemplateMeta[];
}

/** Keeps the listing order (newest first) within each group. */
export function groupProfileTemplates(rows: readonly StudioTemplate[]): ProfileTemplateGroups {
  const groups: ProfileTemplateGroups = { resume: [], other: [] };
  for (const row of rows) {
    const meta = fromStudioCreator(row);
    (isResumeTemplate(meta) ? groups.resume : groups.other).push(meta);
  }
  return groups;
}
