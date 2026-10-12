/**
 * Career starts — where the studio's "get hired" starts go. ONE rule, shared
 * by the studio's New menu, the template carousel (useCreateStudioDraft) and
 * the `/studio/:id?contentTemplate=` route, so /studio and the kit workspace never make
 * the same thing two ways:
 *
 *   - A résumé, its cover letter and its video are made and edited together
 *     as a career kit in the studio workspace (/studio/new → /studio/:id).
 *     The studio templates that ARE that output ("Video Resume", "Resume
 *     (Document)") open a new kit instead of minting a separate project.
 *   - The New menu's "Get hired" starts open a kit leading with one slot
 *     (`?start=`), the same as these templates do.
 *
 * Pure data + lookups (no React) so it is unit-testable and cheap to import
 * from a route module.
 */
import type { ContentTemplate } from "@/lib/studio/templates/catalog";
import { NEW_KIT_PATH } from "@/lib/build-entry";
import type { KitStart } from "@/lib/workspace/kit-stages";

/** Studio templates whose output is a career kit's résumé / video, and the
 *  slot the new kit leads with for each ("Video Resume" starts from the
 *  résumé the video is made from, but names the video). */
const WORKSPACE_TEMPLATES: Readonly<Partial<Record<ContentTemplate, KitStart>>> = { resume: "video", resume_doc: "resume" };

/** Template ids arrive as catalog ids (`resume_doc`) or URL slugs (`resume-doc`). */
function normalizeTemplateId(raw: string): string {
  return raw.trim().replace(/-/g, "_");
}

/** True when the template's output is made in the kit workspace. */
export function isWorkspaceTemplate(id: string | null | undefined): boolean {
  return kitStartForTemplate(id) !== null;
}

/** The slot a kit opened by this template leads with, or null when the
 *  template isn't a kit's. */
export function kitStartForTemplate(id: string | null | undefined): KitStart | null {
  if (!id) return null;
  return WORKSPACE_TEMPLATES[normalizeTemplateId(id) as ContentTemplate] ?? null;
}

/** Where a template opens when it belongs to the workspace, else null (the
 *  studio mints its own project as before). */
export function workspaceHrefForTemplate(id: string | null | undefined): string | null {
  const start = kitStartForTemplate(id);
  return start ? `${NEW_KIT_PATH}?start=${start}` : null;
}

/** "Get hired" templates (Studio board): the job-seeker path, listed first
 *  and tagged "Get hired"; every other template is "More formats". */
const GET_HIRED_TEMPLATES: ReadonlySet<string> = new Set<ContentTemplate>(["resume", "resume_doc", "personal_brand", "profile"]);

export function isGetHiredTemplate(id: string | null | undefined): boolean {
  if (!id) return false;
  return GET_HIRED_TEMPLATES.has(normalizeTemplateId(id));
}
