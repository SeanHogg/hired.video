/**
 * handleTailor — POST /api/match/tailor: fit a résumé to a job.
 *
 *   1. Resolve the job (tracked id or pasted text) and the source résumé
 *      (owner-scoped; `resumeContent` inline in preview mode, so the kit workspace can
 *      tailor exactly what is on screen).
 *   2. Ask the model for a compact EDIT list + the job's unmet asks (gap
 *      #2109 contract, tailor-edits.ts) — never the whole résumé.
 *   3. Apply the edits → `tailoredResume` + `changes[]` (each with a content
 *      path, so a client can revert one exactly) + `gaps[]` + the job
 *      keywords it already shows (`matchedKeywords`, verified, #2344).
 *   4. Unless `preview`, save it as a version of the source's MASTER
 *      (lineage.ts — a version source is never unlinked).
 *
 * `preview: true` (the kit review) persists nothing: the person reviews
 * every change on the page and saves with "Save as version of master"
 * (POST /api/resumes { source: "variation" }). Without it the legacy one-shot
 * behaviour stands (Chrome extension, AI tool runner), returning
 * `variationId`.
 */
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { ResumeContentSchema, type ResumeContent } from "../../../../shared/resume.js";
import { buildRepos } from "../../repositories/index.js";
import { DomainError, requireUserId } from "../../domains/errors.js";
import { buildAIErrorEnvelope } from "../../services/adapters/llm-error.js";
import type { ParsedJob } from "../../services/job/JobService.js";
import { saveVersionOfMaster } from "../../services/resume/lineage.js";
import {
  loadPriorRecommendations,
  resolveJobForFit,
  resolveResumeV2,
  type MatchDeps,
} from "./match-handlers.js";
import {
  TailorEditResponseIngest,
  applyResumeEdits,
  buildTailorPrompt,
  dropUnsupportedSkills,
  strengthenEditMatchPrompt,
  strengthenPrompt,
  toJobGaps,
  validateTailorOutput,
  type TailorValidationResult,
} from "./tailor-edits.js";
import { verifiedMatchedKeywords } from "./matched-keywords.js";
import { logger } from "../../lib/logger.js";

export const TailorInputSchema = z
  .object({
    jobHtml: z.string().optional(),
    jobId: UuidLikeSchema.optional(),
    resumeId: UuidLikeSchema.optional(),
    /** Review first, persist nothing. */
    preview: z.boolean().optional(),
    /** The résumé as it is on screen — honoured only with `preview`. */
    resumeContent: ResumeContentSchema.optional(),
  })
  .refine((v) => !!(v.jobHtml || v.jobId), { message: "Either jobHtml or jobId is required" });

export async function handleTailor(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
) {
  const userId = requireUserId(viewerId);

  const parsed = TailorInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }
  const { preview = false } = parsed.data;

  const job = await resolveJobForFit(deps, parsed.data);
  if (!job) {
    throw parsed.data.jobId
      ? new DomainError(404, "NOT_FOUND", "Job not found. Track the job before scoring.")
      : new DomainError(400, "VALIDATION_ERROR", "Either jobHtml or jobId is required");
  }
  const { parsedJob, sourceUrl, jobId: jobIdResolved } = job;

  const inline = preview ? parsed.data.resumeContent : undefined;
  const stored = await resolveResumeV2(deps, userId, parsed.data.resumeId);
  if (!inline && !stored) throw new DomainError(404, "NOT_FOUND", "No resume found. Please create a resume first.");
  const sourceContent: ResumeContent = inline ?? stored!.content;

  if (!deps.llm) {
    throw new DomainError(503, "AI_ERROR", "AI tailoring unavailable: no LLM configured");
  }

  const prior =
    jobIdResolved && stored
      ? await loadPriorRecommendations(deps, { userId, jobId: jobIdResolved, resumeId: stored.id })
      : undefined;

  let prompt = buildTailorPrompt({ job: parsedJob, resume: sourceContent, priorRecommendations: prior });

  const maxAttempts = 2;
  let attempt = 0;
  let lastValidation: TailorValidationResult | null = null;
  let noApplicableChanges = false;
  let lastError: string | undefined;
  // The raw thrown object keeps the dispatch trail (model chain, gateway
  // requestIds, classification) for the AI_* envelope below.
  let lastErrorObj: unknown;
  // Set inside the attempt's try (a throw there would be read as an LLM
  // failure) and thrown once the loop exits.
  let saveFailure: DomainError | null = null;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const { data: result } = await deps.llm.callJsonLenient("match_tailor", prompt, TailorEditResponseIngest);

      // Edits can't drop entries, so every work/education entry survives by
      // construction; validate anyway so a malformed op can't slip through.
      const applied = applyResumeEdits(sourceContent, result.edits);
      const tailoredResume = dropUnsupportedSkills(sourceContent, applied.content);
      const { changes } = applied;
      const validation = validateTailorOutput(sourceContent, tailoredResume);
      lastValidation = validation;
      if (!validation.valid) {
        prompt = strengthenPrompt(prompt, validation);
        continue;
      }
      // Edits returned but none matched a real entry → retry naming the keys.
      if (changes.length === 0 && result.edits.length > 0 && attempt < maxAttempts) {
        prompt = strengthenEditMatchPrompt(prompt, sourceContent);
        continue;
      }
      if (changes.length === 0) {
        noApplicableChanges = true;
        break;
      }

      const gaps = toJobGaps(result.gaps, sourceContent);
      const variationTitle = buildVariationTitle(parsedJob);
      const payload = {
        oldScore: result.oldScore,
        newScore: result.newScore,
        tailoredResume,
        changes,
        gaps,
        matchedKeywords: verifiedMatchedKeywords([...(parsedJob.skills ?? []), ...result.matchedKeywords], tailoredResume, gaps),
        summaryRecommendations: result.summaryRecommendations,
        resumeId: stored?.id,
        sourceUrl,
        variationTitle,
        preview,
      };
      if (preview) return payload;

      const saved = await saveVersionOfMaster(
        buildRepos(deps.db).resumes,
        userId,
        stored!.id,
        {
          content: tailoredResume,
          title: variationTitle,
          description: jobIdResolved ? `Generated for ${parsedJob.title}` : undefined,
        },
        deps.now,
      );
      if (!saved.ok) {
        // The tailor succeeded; persisting it did not.
        saveFailure = new DomainError(
          500,
          "VARIATION_SAVE_FAILED",
          saved.code === "NOT_FOUND" ? "Source resume no longer exists" : "Tailored resume failed validation on save",
          saved.code === "INVALID_CONTENT" ? { issues: saved.issues } : undefined,
        );
        break;
      }
      return { ...payload, variationId: saved.row!.id };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      lastErrorObj = err;
      logger.warn("[match/tailor] LLM call failed", lastError);
      // A provider failure won't be fixed by a retry.
      break;
    }
  }

  if (saveFailure) throw saveFailure;

  // The model ran but nothing applied — distinct from a transport failure.
  if (noApplicableChanges) {
    throw new DomainError(
      422,
      "NO_APPLICABLE_CHANGES",
      "The AI couldn't find changes to make for this job — your resume may already be a strong match. Try a different job or resume.",
    );
  }

  throw (
    aiDomainError(lastErrorObj, lastError) ??
    new DomainError(400, "VALIDATION_ERROR", "Tailored resume failed validation after retries", {
      errors: lastValidation?.errors ?? [lastError ?? "unknown failure"],
      missingWorkEntries: lastValidation?.missingWorkEntries ?? [],
      missingEducationInstitutions: lastValidation?.missingEducationInstitutions ?? [],
    })
  );
}

/**
 * Map an LLM dispatch failure onto the structured AI_* DomainError (shared
 * classifier first, then the legacy aggregate-string check). Null when the
 * failure is not an AI-availability problem. Shared by every fit flow.
 */
export function aiDomainError(errObj: unknown, message: string | undefined): DomainError | null {
  const envelope = buildAIErrorEnvelope(errObj);
  if (envelope) return new DomainError(envelope.status, envelope.code, envelope.message, envelope.payload);
  if (message && isAiUnavailableError(message)) {
    return new DomainError(
      503,
      "AI_UNAVAILABLE",
      "AI providers are temporarily overloaded or rate-limited. Please try again in a minute.",
      { providerError: message.slice(0, 2000) },
    );
  }
  return null;
}

/** True when every profile in the dispatch chain failed with rate-limit or
 *  timeout errors (infrastructure, not model output). The aggregated error
 *  shape comes from `dispatch` in services/adapters/llm-client.ts. */
function isAiUnavailableError(msg: string): boolean {
  if (!/profile\(s\) for use case .* failed/.test(msg)) return false;
  const lines = msg.split("\n").filter((l) => l.trim().startsWith("["));
  if (lines.length === 0) return false;
  return lines.every(
    (l) => l.includes("429") || l.includes("404") || /aborted due to timeout/i.test(l) || /rate.?limit/i.test(l),
  );
}

/** "Staff SWE - Acme" — the one title format the extension, web app and
 *  résumé list all show for a job-fitted version. */
export function buildVariationTitle(job: ParsedJob): string {
  const title = (job.title ?? "").trim() || "Tailored Resume";
  const company = (job.company ?? "").trim();
  return (company ? `${title} - ${company}` : title).slice(0, 250);
}
