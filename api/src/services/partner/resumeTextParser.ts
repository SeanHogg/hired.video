/**
 * Partner résumé text → JSON Resume content (#2270).
 *
 * A partner SDK upload (`rawText`, or text extracted from a `file`) arrives
 * with no signed-in user, so there is nobody to bill an AI parse to. Which
 * account pays is an owner decision (D12): the partner's owner account, or
 * the job seeker the résumé belongs to. Until D12 is made the AI parse stays
 * off and partner text takes the deterministic path (JSON Resume if it
 * parses, else the regex parser).
 *
 * `PARTNER_RESUME_AI_PARSE` is the ONE switch. Flipping it to
 * "partner_owner" or "job_seeker" routes partner text through the same AI
 * parse pipeline as /api/resumes/parse, billed (ai_usage_records + token
 * budget) to that account. An AI failure still falls back to the
 * deterministic parse, so a partner write never fails on the model.
 */
import { parseResumeWithRegex, tryParseJsonResume } from "../resume/parse.js";

/** Who pays for a partner upload's AI parse; "off" = deterministic only. */
export type PartnerResumeAiParse = "off" | "partner_owner" | "job_seeker";

/** THE switch — set by D12. Keep "off" until the owner decides who is billed. */
export const PARTNER_RESUME_AI_PARSE: PartnerResumeAiParse = "off";

export interface PartnerParseContext {
  /** The partner's owning account (null for admin-provisioned partners). */
  partnerOwnerUserId: string | null;
  /** The job seeker the résumé is written for. */
  jobSeekerUserId: string;
}

/** The account billed for the AI parse, or null when the AI parse is off /
 *  has no one to bill. Pure. */
export function partnerParseBillingSubject(mode: PartnerResumeAiParse, ctx: PartnerParseContext): string | null {
  if (mode === "partner_owner") return ctx.partnerOwnerUserId;
  if (mode === "job_seeker") return ctx.jobSeekerUserId;
  return null;
}

export interface PartnerTextParserDeps {
  mode: PartnerResumeAiParse;
  /** Resolves the billing context only when the AI parse is on. */
  context: () => Promise<PartnerParseContext>;
  /** The AI parse pipeline, billed to `billedUserId`. Null when no AI
   *  provider is configured. */
  aiParse: ((text: string, billedUserId: string) => Promise<Record<string, unknown>>) | null;
}

export function buildPartnerTextParser(deps: PartnerTextParserDeps): (text: string) => Promise<Record<string, unknown>> {
  return async (text) => {
    const jsonResume = tryParseJsonResume(text);
    if (jsonResume) return jsonResume;
    if (deps.mode === "off" || !deps.aiParse) return parseResumeWithRegex(text);

    const billedUserId = partnerParseBillingSubject(deps.mode, await deps.context());
    if (!billedUserId) return parseResumeWithRegex(text);
    try {
      return await deps.aiParse(text, billedUserId);
    } catch (err) {
      console.warn("[partner resume] AI parse failed, using the deterministic parse:", err instanceof Error ? err.message : err);
      return parseResumeWithRegex(text);
    }
  };
}
