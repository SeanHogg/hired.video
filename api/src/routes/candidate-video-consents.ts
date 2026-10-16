/**
 * Candidate video consent routes (migration 0534).
 *
 *   Recruiter (auth) — mounted at /api/recruiter/candidate-video-consents
 *     POST /               { projectId, talentPoolCandidateId?, candidateName?, candidateEmail?, message? }
 *     GET  /?projectId=    → CandidateVideoConsent[] (newest first)
 *     POST /:id/resend     → CandidateVideoConsent (new token + expiry, re-emailed)
 *
 *   Public (token) — mounted at /api/public/candidate-video-consent
 *     GET  /:token         → PublicCandidateVideoConsent (read-only; no writes)
 *     POST /:token         { decision: "approve" | "decline" | "revoke" } → PublicCandidateVideoConsent
 *                          (revoke = withdraw an approval; works past expires_at)
 *   Both public routes share one per-IP limiter. requestLogger stores the
 *   path with the token replaced by `:token` (utils/redact-token-path.ts).
 *
 * Thin HTTP adapters over domains/candidate-consent, wired by the
 * composition root services/candidate-consent/candidate-consent-deps.ts;
 * no table access here.
 * No caching anywhere: every read is per-token (or per-project), low traffic,
 * and must reflect the candidate's latest answer immediately.
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import {
  CANDIDATE_CONSENT_EMAIL_MISMATCH_CODE,
  CANDIDATE_CONSENT_EMAIL_NOT_ALLOWED_CODE,
  RequestCandidateVideoConsentSchema,
  RespondCandidateVideoConsentSchema,
} from "../../../shared/candidate-video-consent.js";
import { CandidateConsentError, type CandidateConsentErrorKind } from "../domains/candidate-consent/ports.js";
import { buildCandidateConsentDeps } from "../services/candidate-consent/candidate-consent-deps.js";
import { listConsents, requestConsent, resendConsent } from "../domains/candidate-consent/request-consent.js";
import { getPublicConsent, respondToConsent } from "../domains/candidate-consent/respond-consent.js";

/** The one CandidateConsentError → HTTP mapping. */
const ERROR_HTTP: Record<CandidateConsentErrorKind, { code: string; status: 400 | 403 | 404 | 409 | 410 }> = {
  NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  FORBIDDEN: { code: "FORBIDDEN", status: 403 },
  VALIDATION: { code: "VALIDATION_ERROR", status: 400 },
  EMAIL_MISMATCH: { code: CANDIDATE_CONSENT_EMAIL_MISMATCH_CODE, status: 400 },
  EMAIL_NOT_ALLOWED: { code: CANDIDATE_CONSENT_EMAIL_NOT_ALLOWED_CODE, status: 400 },
  ALREADY_RESPONDED: { code: "CONSENT_ALREADY_RESPONDED", status: 409 },
  NOT_APPROVED: { code: "CONSENT_NOT_APPROVED", status: 409 },
  EXPIRED: { code: "CONSENT_EXPIRED", status: 410 },
  NOT_RESENDABLE: { code: "CONSENT_NOT_RESENDABLE", status: 409 },
};

function consentErrorResponse(c: Context<AppEnv>, err: unknown): Response {
  if (!(err instanceof CandidateConsentError)) throw err;
  const { code, status } = ERROR_HTTP[err.kind];
  return c.json(error(code, err.message), status);
}

// ── Recruiter ───────────────────────────────────────────────────────────────

export const candidateVideoConsentRoutes = new Hono<AppEnv>();

candidateVideoConsentRoutes.post("/", async (c) => {
  const parsed = RequestCandidateVideoConsentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  try {
    const consent = await requestConsent({ userId: c.var.user.sub }, parsed.data, buildCandidateConsentDeps());
    return c.json(success(consent), 201);
  } catch (err) {
    return consentErrorResponse(c, err);
  }
});

candidateVideoConsentRoutes.get("/", async (c) => {
  const projectId = c.req.query("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) return c.json(error("VALIDATION_ERROR", "projectId is required"), 400);
  try {
    return c.json(success(await listConsents({ userId: c.var.user.sub }, projectId!, buildCandidateConsentDeps())));
  } catch (err) {
    return consentErrorResponse(c, err);
  }
});

candidateVideoConsentRoutes.post("/:id/resend", async (c) => {
  const id = c.req.param("id");
  if (!UuidLikeSchema.safeParse(id).success) return c.json(error("NOT_FOUND", "Consent request not found"), 404);
  try {
    return c.json(success(await resendConsent({ userId: c.var.user.sub }, id, buildCandidateConsentDeps())));
  } catch (err) {
    return consentErrorResponse(c, err);
  }
});

// ── Public (tokenized link) ─────────────────────────────────────────────────

export const candidateVideoConsentPublicRoutes = new Hono<AppEnv>();

/** Reads + answers are rare (a few per candidate); one shared bucket caps
 *  token guessing (GET would otherwise be an unlimited oracle) and spam. */
const publicConsentRateLimit = createIpRateLimiter({
  windowMs: 15 * 60_000,
  maxAttempts: 30,
  message: "Too many consent requests — please try again later.",
});

candidateVideoConsentPublicRoutes.get("/:token", publicConsentRateLimit, async (c) => {
  try {
    return c.json(success(await getPublicConsent(c.req.param("token"), buildCandidateConsentDeps())));
  } catch (err) {
    return consentErrorResponse(c, err);
  }
});

candidateVideoConsentPublicRoutes.post("/:token", publicConsentRateLimit, async (c) => {
  const parsed = RespondCandidateVideoConsentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Choose approve, decline or revoke"), 400);
  try {
    const ip = getClientIp(c);
    const consent = await respondToConsent(
      c.req.param("token"),
      parsed.data.decision,
      ip === "unknown" ? null : ip,
      buildCandidateConsentDeps(),
    );
    return c.json(success(consent));
  } catch (err) {
    return consentErrorResponse(c, err);
  }
});
