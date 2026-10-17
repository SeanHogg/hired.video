/**
 * The ONE read/write port every résumé tool uses (scorer text, rewrite apply,
 * summary / skill / bullet / date mutations). It prefers the draft open in
 * this tab (resume-draft-bridge) — so the AI edits what the user sees, as an
 * Undo step — and otherwise reads / writes the stored row and refreshes the
 * résumé caches.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { ResumeContent } from "@shared/resume";
import { resumeService } from "@/lib/services/resume-service";
import { queryKeys } from "@/lib/query-keys";
import { resumeToPlainText } from "@/lib/resume-exporters";
import type { ToolRunContext } from "./types";
import { getResumeDraft } from "./resume-draft-bridge";

export async function readResumeContent(resumeId: string): Promise<ResumeContent | null> {
  const draft = getResumeDraft(resumeId);
  if (draft) return draft.getContent();
  const resume = await resumeService.getResumeById(resumeId);
  return resume?.content ?? null;
}

/**
 * Apply `update` to a deep copy of the résumé and save it. `update` returns
 * null for "nothing to change" (no write, resolves false).
 */
export async function writeResumeContent(
  resumeId: string,
  update: (copy: ResumeContent) => ResumeContent | null,
  label: string,
  queryClient?: QueryClient,
): Promise<boolean> {
  const current = await readResumeContent(resumeId);
  if (!current) throw new Error("Resume content unavailable.");
  const next = update(structuredClone(current));
  if (!next) return false;

  const draft = getResumeDraft(resumeId);
  if (draft) {
    draft.commit(next, label);
    return true;
  }
  await resumeService.updateResumeData(resumeId, { data: next });
  await queryClient?.invalidateQueries({ queryKey: queryKeys.resume.byId(resumeId) });
  await queryClient?.invalidateQueries({ queryKey: queryKeys.resumes.all });
  return true;
}

/**
 * Flat résumé text for tools whose backend reads text. Prefers the caller's
 * `args.resumeText` (paste-only ToolDialog runs); otherwise the bound résumé
 * — the open draft when there is one. One path for every surface, so every
 * tool that needs text behaves identically.
 */
export async function resolveResumeText(ctx: ToolRunContext): Promise<string> {
  const explicit = typeof ctx.args.resumeText === "string" ? ctx.args.resumeText.trim() : "";
  if (explicit) return explicit;
  const { resumeId } = ctx.bound;
  if (!resumeId) throw new Error("No active resume — open a resume to run this tool.");
  const content = await readResumeContent(resumeId);
  if (!content) throw new Error("Resume content unavailable.");
  const text = resumeToPlainText(content).trim();
  if (!text) throw new Error("Resume is empty — add content before running this tool.");
  return text;
}
