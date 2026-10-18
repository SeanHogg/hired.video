/**
 * `POST /api/resumes { source: "job" }` — draft a résumé for a job from the
 * owner's own evidence (the master unless `resumeId` says otherwise).
 * Nothing is saved: the kit review shows the draft, and the client keeps it
 * through `{ source: "variation" }`. Throws DomainError.
 */
import { FromJobRequestSchema, type FromJobDraft } from "../../../../shared/resume-from-job.js";
import { DomainError } from "../../domains/errors.js";
import { logger } from "../../lib/logger.js";
import type { IResumeOwnerReader } from "../../repositories/resumeRepository.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { resolveJobForFit } from "../job/match-resolvers.js";
import type { MatchDeps } from "../job/match-deps.js";
import { aiDomainError } from "../job/tailor-handler.js";
import { invalidResumeBody, resumeNotFound } from "./errors.js";
import { draftResumeFromJob } from "./from-job.js";

export interface FromJobDeps {
  repo: IResumeOwnerReader;
  llm: LLMClient;
  db: MatchDeps["db"];
}

export async function draftFromJobRequest(deps: FromJobDeps, userId: string, body: unknown): Promise<FromJobDraft> {
  const parsed = FromJobRequestSchema.safeParse(body);
  if (!parsed.success) throw invalidResumeBody(parsed.error.flatten());

  const job = await resolveJobForFit({ db: deps.db, now: () => new Date(), llm: deps.llm }, parsed.data);
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found");

  const sourceId = parsed.data.resumeId ?? (await deps.repo.findMasterForOwner(userId))?.id;
  if (!sourceId) throw new DomainError(404, "NO_MASTER", "Add a résumé first — it is the evidence a job résumé is built from");

  let outcome: Awaited<ReturnType<typeof draftResumeFromJob>>;
  try {
    outcome = await draftResumeFromJob(deps.repo, deps.llm, userId, {
      job: job.parsedJob,
      sourceId,
      includeVersions: parsed.data.includeVersions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[resumes/from-job] LLM call failed", { error: message });
    throw aiDomainError(err, message) ?? new DomainError(502, "AI_ERROR", "Couldn't draft a résumé for that job. Please try again.");
  }
  // `in` narrowing — the API compiles with `strict: false`.
  if ("code" in outcome) {
    if (outcome.code === "NO_SOURCE") throw resumeNotFound();
    throw new DomainError(422, "NO_REQUIREMENTS", "Couldn't read any requirements from that job post. Try pasting the full description.");
  }
  return outcome.draft;
}
