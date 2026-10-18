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
import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { error, success } from "../types/index.js";
import { createIpRateLimiter, getClientIp } from "../middleware/rateLimiter.js";
import { UuidLikeSchema } from "../../../shared/validation.js";
import {
  RequestCandidateVideoConsentSchema,
  RespondCandidateVideoConsentSchema,
} from "../../../shared/candidate-video-consent.js";
import { buildCandidateConsentDeps } from "../services/candidate-consent/candidate-consent-deps.js";
import { listConsents, requestConsent, resendConsent } from "../domains/candidate-consent/request-consent.js";
import { getPublicConsent, respondToConsent } from "../domains/candidate-consent/respond-consent.js";
import { validateJson } from "./helpers/validate.js";

// ── Recruiter ───────────────────────────────────────────────────────────────

export const candidateVideoConsentRoutes = new Hono<AppEnv>();

candidateVideoConsentRoutes.post("/", validateJson(RequestCandidateVideoConsentSchema, undefined, { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const consent = await requestConsent({ userId: c.var.userId }, body, buildCandidateConsentDeps());
  return c.json(success(consent), 201);
});

candidateVideoConsentRoutes.get("/", async (c) => {
  const projectId = c.req.query("projectId");
  if (!UuidLikeSchema.safeParse(projectId).success) return c.json(error("VALIDATION_ERROR", "projectId is required"), 400);
  return c.json(success(await listConsents({ userId: c.var.userId }, projectId!, buildCandidateConsentDeps())));
});

candidateVideoConsentRoutes.post("/:id/resend", async (c) => {
  const id = c.req.param("id");
  if (!UuidLikeSchema.safeParse(id).success) return c.json(error("NOT_FOUND", "Consent request not found"), 404);
  return c.json(success(await resendConsent({ userId: c.var.userId }, id, buildCandidateConsentDeps())));
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
  return c.json(success(await getPublicConsent(c.req.param("token"), buildCandidateConsentDeps())));
});

candidateVideoConsentPublicRoutes.post("/:token", publicConsentRateLimit, validateJson(RespondCandidateVideoConsentSchema, () => error("VALIDATION_ERROR", "Choose approve, decline or revoke"), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const ip = getClientIp(c);
  const consent = await respondToConsent(
    c.req.param("token"),
    body.decision,
    ip === "unknown" ? null : ip,
    buildCandidateConsentDeps(),
  );
  return c.json(success(consent));
});
