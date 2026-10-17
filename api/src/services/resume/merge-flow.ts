/**
 * Merge flow — the application side of POST /api/resumes/merge/*. The
 * routes only parse the request and shape the response; resolving the two
 * sides, running the merge engine (merge.ts) and committing the result go
 * through here.
 *
 * Either side can be a stored résumé (owner-scoped id) or content sent
 * inline. Inline content is how /build merges into exactly what is on the
 * page (an unsaved edit, a version being pulled up to date) — nothing is
 * read or written for an inline side, so ownership is not in question.
 *
 * Committing: in place on the target, or "save as a version" — which is a
 * version of the target's MASTER via lineage.ts (it used to insert a row
 * whose parent was the target, so merging into a version made a
 * grandchild and the consolidator's copy fell outside the master's group).
 */
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import type { IResumeOwnerReader, IResumeWriter } from "../../repositories/resumeRepository.js";
import { executeMerge, type MergeDecision } from "./merge.js";
import { normalizeJsonResume } from "./parse.js";
import { healAndValidateContent, type ResumeContentIssue } from "./content.js";
import { saveVersionOfMaster } from "./lineage.js";
import { refreshDiffPercentFor } from "./view.js";

type Content = Record<string, unknown>;

export const MergeDecisionSchema = z.object({
  sectionType: z.string(),
  sourceIndex: z.number(),
  targetIndex: z.number().nullable(),
  action: z.enum(["merge", "replace", "skip", "add"]),
  mergeHighlights: z.enum(["combine", "source_only", "target_only"]).optional(),
  selectedHighlights: z.array(z.string()).optional(),
  scalarChoices: z.record(z.string(), z.enum(["source", "target"])).optional(),
});

const InlineContent = z.record(z.string(), z.unknown());

export const MergeRunSchema = z
  .object({
    sourceResumeId: UuidLikeSchema.optional(),
    sourceContent: InlineContent.optional(),
    targetResumeId: UuidLikeSchema.optional(),
    targetContent: InlineContent.optional(),
    decisions: z.array(MergeDecisionSchema),
    basicDecisions: z.record(z.string(), z.enum(["source", "target"])).optional(),
    createNew: z.boolean().optional(),
    newTitle: z.string().optional(),
  })
  .refine((d) => d.sourceResumeId || d.sourceContent, { message: "Either sourceResumeId or sourceContent must be provided" })
  .refine((d) => d.targetResumeId || d.targetContent, { message: "Either targetResumeId or targetContent must be provided" });
export type MergeRunInput = z.infer<typeof MergeRunSchema>;

export type SideResult = { ok: true; content: Content; title: string | null } | { ok: false; which: "Source" | "Target" };

/** One side of a merge: stored (owner-scoped) or inline. Normalised so the
 *  analysis compares like with like. */
export async function resolveMergeSide(
  repo: Pick<IResumeOwnerReader, "findByIdForOwner">,
  ownerId: string,
  which: "Source" | "Target",
  side: { resumeId?: string; content?: Content },
): Promise<SideResult> {
  if (side.resumeId) {
    const row = await repo.findByIdForOwner(side.resumeId, ownerId);
    if (!row) return { ok: false, which };
    return { ok: true, content: normalizeJsonResume((row.content ?? {}) as Content), title: row.title };
  }
  return { ok: true, content: normalizeJsonResume(side.content ?? {}), title: null };
}

/** Same decisions in → same merged document out; shared by preview + execute. */
export function runMerge(target: Content, source: Content, input: Pick<MergeRunInput, "decisions" | "basicDecisions">) {
  const mergedContent = executeMerge(target, source, input.decisions as MergeDecision[], input.basicDecisions);
  const stats = {
    mergedSections: input.decisions.filter((d) => d.action === "merge" || d.action === "replace").length,
    skippedSections: input.decisions.filter((d) => d.action === "skip").length,
    newSections: input.decisions.filter((d) => d.action === "add").length,
  };
  return { mergedContent, stats };
}

export type CommitOutcome =
  | { ok: true; resumeId: string; title: string; created: boolean }
  | { ok: false; code: "NOT_FOUND" | "INVALID_CONTENT"; issues: ResumeContentIssue[] };

/** Persist a merge result onto `targetResumeId` — in place, or as a new
 *  version of the target's master. */
export async function commitMerge(
  repo: IResumeOwnerReader & IResumeWriter,
  ownerId: string,
  args: { targetResumeId: string; merged: Content; createNew: boolean; newTitle?: string },
): Promise<CommitOutcome> {
  const target = await repo.findByIdForOwner(args.targetResumeId, ownerId);
  if (!target) return { ok: false, code: "NOT_FOUND", issues: [] };

  if (args.createNew) {
    const title = args.newTitle?.trim() || `${target.title} (merged)`;
    const saved = await saveVersionOfMaster(repo, ownerId, target.id, { content: args.merged, title });
    if (!saved.ok) return { ok: false, code: saved.code ?? "INVALID_CONTENT", issues: saved.issues };
    return { ok: true, resumeId: saved.row!.id, title, created: true };
  }

  // `executeMerge` output can carry nulls from either side — heal first.
  const heal = healAndValidateContent(args.merged);
  if (!heal.ok) return { ok: false, code: "INVALID_CONTENT", issues: heal.issues };
  await repo.updateByIdForOwner(target.id, ownerId, { content: heal.content as Content });
  // A master that changed shifts every version's % different.
  await refreshDiffPercentFor(repo, ownerId, target.id);
  return { ok: true, resumeId: target.id, title: target.title, created: false };
}
