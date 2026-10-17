/**
 * Create a résumé for a job from the master's evidence — the wire contract
 * of POST /api/resumes { source: "job" } and the kit "create from a job
 * post" review.
 *
 * Every requirement the job states is mapped to the bullets that prove it
 * (`evidence`: content paths into the SOURCE résumé). A requirement with no
 * evidence is a `gap` and becomes a question on the page — the draft never
 * claims it. Nothing here is persisted: the person saves the draft as a
 * version of their master when they are happy with it.
 */
import { z } from "zod";
import { ResumeContentSchema } from "./resume.js";
import { JobGapSchema, TailorChangeSchema } from "./resume-tailor.js";

export const RequirementStatusSchema = z.enum(["covered", "partial", "gap"]);
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;

export const JobRequirementSchema = z.object({
  /** `R1`…`Rn`, in the order the job lists them. */
  id: z.string(),
  text: z.string(),
  status: RequirementStatusSchema,
  /** Content paths in the draft that prove it (bullets / skills / summary). */
  evidence: z.array(z.string()).default([]),
  /** Short human summary of the evidence ("AiM: QA + sprint completion"). */
  note: z.string().default(""),
});
export type JobRequirement = z.infer<typeof JobRequirementSchema>;

export const LeftOutItemSchema = z.object({
  /** Path of the entry / skill the draft leaves out (`work.5`, `skills.9`). */
  path: z.string(),
  label: z.string(),
});
export type LeftOutItem = z.infer<typeof LeftOutItemSchema>;

export const FromJobRequestSchema = z
  .object({
    jobHtml: z.string().max(200_000).optional(),
    jobId: z.string().optional(),
    /** Résumé to take the evidence from; defaults to the caller's master. */
    resumeId: z.string().optional(),
    /** Also read the master's versions for evidence. */
    includeVersions: z.boolean().default(false),
  })
  .refine((v) => !!(v.jobHtml?.trim() || v.jobId), { message: "Either jobHtml or jobId is required" });
export type FromJobRequest = z.input<typeof FromJobRequestSchema>;

export const FromJobDraftSchema = z.object({
  job: z.object({ title: z.string(), company: z.string().default("") }),
  /** The résumé the evidence came from (the master unless asked otherwise). */
  sourceResumeId: z.string(),
  /** Its content as read (with version-only evidence folded in when asked)
   *  — the "Source résumé" side of the review. */
  sourceContent: ResumeContentSchema,
  requirements: z.array(JobRequirementSchema),
  gaps: z.array(JobGapSchema).default([]),
  /** Draft = the source with the AI's evidence-only edits applied. Left-out
   *  items are still IN it; the client hides them (and "Show" restores). */
  content: ResumeContentSchema,
  changes: z.array(TailorChangeSchema).default([]),
  leftOut: z.array(LeftOutItemSchema).default([]),
});
export type FromJobDraft = z.infer<typeof FromJobDraftSchema>;

/** "4 of 6 covered" — a partial counts as covered for the headline count. */
export function coveredCount(requirements: readonly JobRequirement[]): number {
  return requirements.filter((r) => r.status !== "gap").length;
}
