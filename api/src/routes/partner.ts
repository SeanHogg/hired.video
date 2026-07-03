/**
 * Partner system-to-system API — `/api/partner/*`.
 *
 * Every route here authenticates with a partner API key (see partnerAuth
 * middleware), NOT a user JWT. `/api/partner` is in PUBLIC_PREFIXES so the JWT
 * layer skips it. The one exception is `GET /v1/embed/resolve`, which is
 * authenticated by a short-lived signed embed token (the iframe has no key).
 *
 * Surface (SDK: `@hiredvideo/sdk`):
 *   GET    /v1/me                          — whoami (validate a key)
 *   POST   /v1/job-seekers                 — create a Hired.Video account
 *   POST   /v1/job-seekers/:id/resumes     — upload/create a resume
 *   GET    /v1/job-seekers/:id/profile     — read the live profile + resume
 *   POST   /v1/connect                     — begin connecting an existing account
 *   GET    /v1/connections                 — list the partner's connections
 *   DELETE /v1/connections/:userId         — revoke a connection
 *   POST   /v1/embed-tokens                — mint an embed token for the iframe
 *   GET    /v1/embed/resolve?token=        — (public) resolve an embed token
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { invalidateCachedKey } from "../utils/edge-cache.js";
import { partnerAuth } from "../middleware/partnerAuth.js";
import { getPartner } from "../services/partner/partners.js";
import {
  createJobSeekerForPartner,
  connectExistingAccount,
  getProfileForPartner,
  buildPartnerProfilePayload,
} from "../services/partner/jobSeekers.js";
import {
  requireActiveConnection,
  listConnectionsForPartner,
  getConnection,
  revokeConnection,
  partnerProfileCacheKey,
  ConnectionRequiredError,
} from "../services/partner/connections.js";
import { mintEmbedToken, verifyEmbedToken, EmbedTokenError } from "../services/partner/tokens.js";
import { handleCreateResume } from "../services/resume/ResumeService.js";
import { buildResumeParserPort } from "../services/resume/deps.js";
import { buildRepos } from "../repositories/index.js";
import { refreshDiffPercentFor } from "../services/resume/view.js";
import { tryParseJsonResume } from "../services/resume/parse.js";
import { PARTNER_EMBED_KINDS, type PartnerScope } from "../../../shared/partner.js";

export const partnerRoutes = new Hono<AppEnv>();

/** Intersect the connection's granted scopes with the key's scopes — never
 *  grant more than the job seeker consented to. */
function grantedScopes(keyScopes: string[]): PartnerScope[] {
  return keyScopes as PartnerScope[];
}

/** ResumeDeps for the partner write path. rawText that isn't JSON Resume is
 *  wrapped deterministically (no AI dependency — partner requests carry no
 *  user context to bill a model call to; AI parse is a roadmap enhancement). */
function partnerResumeDeps() {
  const now = () => new Date();
  return {
    repo: buildRepos(getDb(), now).resumes,
    parser: buildResumeParserPort(async (text: string) => ({
      basics: { summary: text },
    })),
    diff: { refresh: refreshDiffPercentFor },
    now,
  };
}

// ── GET /v1/me — whoami ─────────────────────────────────────────────────────
partnerRoutes.get("/v1/me", partnerAuth(null), async (c) => {
  const { partnerId, scopes } = c.var.partner!;
  const partner = await getPartner(partnerId);
  if (!partner) return c.json(error("NOT_FOUND", "Partner not found"), 404);
  return c.json(success({ partner, scopes }), 200);
});

// ── POST /v1/job-seekers — create an account (+ optional first resume) ──────
const CreateJobSeekerBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(200).optional(),
  externalUserId: z.string().max(255).optional(),
  resume: z
    .object({
      title: z.string().min(1).max(200).default("Resume"),
      content: z.record(z.string(), z.unknown()).optional(),
      rawText: z.string().max(60_000).optional(),
    })
    .optional(),
});

partnerRoutes.post("/v1/job-seekers", partnerAuth("write:job_seekers"), async (c) => {
  const { partnerId, scopes } = c.var.partner!;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateJobSeekerBody.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const result = await createJobSeekerForPartner({
    partnerId,
    email: parsed.data.email,
    name: parsed.data.name,
    password: parsed.data.password ?? null,
    externalUserId: parsed.data.externalUserId ?? null,
    grantScopes: grantedScopes(scopes),
  });

  if (!result.ok) {
    return c.json(
      error(
        "EMAIL_EXISTS",
        "An account with this email already exists. Use POST /v1/connect to link it (requires the job seeker's consent).",
        { userId: result.userId },
      ),
      409,
    );
  }

  // Optional first resume — reuse the canonical write path.
  let resumeId: string | null = null;
  if (parsed.data.resume && (parsed.data.resume.content || parsed.data.resume.rawText)) {
    const res = await handleCreateResume(partnerResumeDeps(), result.userId, {
      title: parsed.data.resume.title,
      content: parsed.data.resume.content,
      rawText: parsed.data.resume.rawText,
      privacy: "private",
    });
    if (res.status === 201) {
      resumeId = (res.body as any)?.data?.id ?? null;
      invalidateCachedKey(partnerProfileCacheKey(partnerId, result.userId));
    }
  }

  return c.json(
    success({
      userId: result.userId,
      connectionId: result.connection.id,
      status: result.connection.status,
      claimUrl: result.claimUrl,
      resumeId,
    }),
    201,
  );
});

// ── POST /v1/job-seekers/:userId/resumes — upload a resume ──────────────────
const CreateResumeBody = z.object({
  title: z.string().min(1).max(200).default("Resume"),
  content: z.record(z.string(), z.unknown()).optional(),
  rawText: z.string().max(60_000).optional(),
  privacy: z.enum(["public", "unlisted", "private"]).optional(),
});

partnerRoutes.post("/v1/job-seekers/:userId/resumes", partnerAuth("write:resumes"), async (c) => {
  const { partnerId } = c.var.partner!;
  const userId = c.req.param("userId");
  try {
    await requireActiveConnection(partnerId, userId);
  } catch (e) {
    if (e instanceof ConnectionRequiredError) return c.json(error("FORBIDDEN", e.message), 403);
    throw e;
  }
  const body = await c.req.json().catch(() => null);
  const parsed = CreateResumeBody.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  if (!parsed.data.content && !parsed.data.rawText) {
    return c.json(error("VALIDATION_ERROR", "Provide either `content` (JSON Resume) or `rawText`."), 400);
  }

  const res = await handleCreateResume(partnerResumeDeps(), userId, parsed.data);
  if (res.status === 201) {
    invalidateCachedKey(partnerProfileCacheKey(partnerId, userId));
  }
  return c.json(res.body as any, res.status as any);
});

// ── GET /v1/job-seekers/:userId/profile — live profile + resume ─────────────
partnerRoutes.get("/v1/job-seekers/:userId/profile", partnerAuth("read:profile"), async (c) => {
  const { partnerId } = c.var.partner!;
  const userId = c.req.param("userId");
  try {
    await requireActiveConnection(partnerId, userId);
  } catch (e) {
    if (e instanceof ConnectionRequiredError) return c.json(error("FORBIDDEN", e.message), 403);
    throw e;
  }
  const payload = await getProfileForPartner(partnerId, userId);
  if (!payload) return c.json(error("NOT_FOUND", "Profile not found"), 404);
  return c.json(success(payload), 200);
});

// ── POST /v1/connect — begin connecting an existing account ─────────────────
const ConnectBody = z.object({
  email: z.string().email(),
  externalUserId: z.string().max(255).optional(),
  redirectUrl: z.string().url().max(2000).optional(),
});

partnerRoutes.post("/v1/connect", partnerAuth("write:connections"), async (c) => {
  const { partnerId, scopes } = c.var.partner!;
  const body = await c.req.json().catch(() => null);
  const parsed = ConnectBody.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  const partner = await getPartner(partnerId);
  if (!partner) return c.json(error("NOT_FOUND", "Partner not found"), 404);

  const result = await connectExistingAccount({
    partnerId,
    partnerSlug: partner.slug,
    email: parsed.data.email,
    externalUserId: parsed.data.externalUserId ?? null,
    grantScopes: grantedScopes(scopes),
    redirectUrl: parsed.data.redirectUrl ?? null,
  });

  if (!result.ok) {
    return c.json(
      error(
        "NOT_FOUND",
        "No Hired.Video account with that email. Use POST /v1/job-seekers to create one instead.",
      ),
      404,
    );
  }
  return c.json(
    success({
      userId: result.userId,
      connectionId: result.connectionId,
      status: result.status,
      consentUrl: result.consentUrl,
    }),
    200,
  );
});

// ── GET /v1/connections — list the partner's connections ────────────────────
partnerRoutes.get("/v1/connections", partnerAuth("read:connections"), async (c) => {
  const { partnerId } = c.var.partner!;
  const connections = await listConnectionsForPartner(partnerId);
  return c.json(success({ connections }), 200);
});

// ── DELETE /v1/connections/:userId — revoke a connection ────────────────────
partnerRoutes.delete("/v1/connections/:userId", partnerAuth("write:connections"), async (c) => {
  const { partnerId } = c.var.partner!;
  const userId = c.req.param("userId");
  const conn = await getConnection(partnerId, userId);
  if (!conn) return c.json(error("NOT_FOUND", "Connection not found"), 404);
  await revokeConnection(conn.id);
  return c.json(success({ revoked: true }), 200);
});

// ── POST /v1/embed-tokens — mint an embed token for the iframe ──────────────
const EmbedTokenBody = z.object({
  userId: z.string().uuid(),
  kind: z.enum(PARTNER_EMBED_KINDS).default("profile"),
});

partnerRoutes.post("/v1/embed-tokens", partnerAuth("read:profile"), async (c) => {
  const { partnerId } = c.var.partner!;
  const body = await c.req.json().catch(() => null);
  const parsed = EmbedTokenBody.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  try {
    await requireActiveConnection(partnerId, parsed.data.userId);
  } catch (e) {
    if (e instanceof ConnectionRequiredError) return c.json(error("FORBIDDEN", e.message), 403);
    throw e;
  }
  const { token, expiresAt } = await mintEmbedToken(partnerId, parsed.data.userId, parsed.data.kind);
  const base = (
    process?.env?.FRONTEND_URL || (globalThis as any).__ENV?.FRONTEND_URL || "https://hired.video"
  ).replace(/\/$/, "");
  return c.json(
    success({
      token,
      kind: parsed.data.kind,
      embedUrl: `${base}/embedded/profile/${token}`,
      expiresAt: expiresAt.toISOString(),
    }),
    200,
  );
});

// ── GET /v1/embed/resolve?token= — PUBLIC, token-authenticated ──────────────
// The iframe (embedded on the partner's site) fetches this. Auth IS the signed
// token; we re-check the connection is still active so a job seeker's revoke
// cuts off live embeds even within a token's TTL.
partnerRoutes.get("/v1/embed/resolve", async (c) => {
  const token = c.req.query("token");
  let payload;
  try {
    payload = await verifyEmbedToken(token);
  } catch (e) {
    const msg = e instanceof EmbedTokenError ? e.message : "Invalid embed token.";
    return c.json(error("UNAUTHORIZED", msg), 401);
  }
  try {
    await requireActiveConnection(payload.p, payload.u);
  } catch (e) {
    if (e instanceof ConnectionRequiredError) {
      return c.json(error("REVOKED", "This job seeker has revoked access."), 403);
    }
    throw e;
  }
  const profile = await buildPartnerProfilePayload(payload.u, { includeEmail: false });
  if (!profile) return c.json(error("NOT_FOUND", "Profile not found"), 404);
  return c.json(success({ kind: payload.k, ...profile }), 200);
});

partnerRoutes.all("*", (c) =>
  c.json(error("NOT_FOUND", "Partner API route not found"), 404),
);
