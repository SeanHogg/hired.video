/**
 * Partner résumé text → JSON Resume content (#2270).
 *
 * A partner SDK upload (`rawText`, or text extracted from a `file`) arrives
 * with no signed-in user. The billed subject is D12: the partner's owner
 * account, or the job seeker the résumé belongs to. Default is `job_seeker`
 * — same billed subject as first-party `/api/resumes/parse` (JWT `sub` =
 * résumé owner). Admin-provisioned partners have a null owner, so billing
 * the seeker is the only subject that always exists.
 *
 * `PARTNER_RESUME_AI_PARSE` is the code default. `resolvePartnerResumeAiParse`
 * reads env `PARTNER_RESUME_AI_PARSE` (`off` | `partner_owner` | `job_seeker`)
 * so D12 can still flip who pays without another code change. An AI failure
 * still falls back to the deterministic parse, so a partner write never
 * fails on the model.
 */
import { parseResumeWithRegex, tryParseJsonResume } from "../resume/parse.js";
import { logger } from "../../lib/logger.js";

/** Who pays for a partner upload's AI parse; "off" = deterministic only. */
export type PartnerResumeAiParse = "off" | "partner_owner" | "job_seeker";

/** Code default — billed to the résumé owner, matching first-party parse. */
export const PARTNER_RESUME_AI_PARSE: PartnerResumeAiParse = "job_seeker";

/** Resolve the switch from env (wrangler / secrets). Unknown / unset → default. */
export function resolvePartnerResumeAiParse(
  raw: string | undefined | null,
): PartnerResumeAiParse {
  const v = raw?.trim().toLowerCase();
  if (v === "off" || v === "partner_owner" || v === "job_seeker") return v;
  return PARTNER_RESUME_AI_PARSE;
}

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
      logger.warn("[partner resume] AI parse failed, using the deterministic parse", err);
      return parseResumeWithRegex(text);
    }
  };
}
