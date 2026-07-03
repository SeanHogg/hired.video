/**
 * Partner system-to-system API — `/api/partner/*`.
 *
 * Every route here authenticates with a partner API key (see partnerAuth
 * middleware), NOT a user JWT. `/api/partner` is in PUBLIC_PREFIXES so the JWT
 * layer skips it.
 *
 * Surface (SDK: `@seanhogg/hired-video-sdk`):
 *   GET    /v1/me                          — whoami (validate a key)
 *   POST   /v1/job-seekers                 — create a Hired.Video account
 *   POST   /v1/job-seekers/:id/resumes     — upload/create a resume
 *   GET    /v1/job-seekers/:id/profile     — read the live profile + resume
 *   POST   /v1/connect                     — begin connecting an existing account
 *   GET    /v1/connections                 — list the partner's connections
 *   DELETE /v1/connections/:userId         — revoke a connection
 *   POST   /v1/embed-tokens                — mint an embed token; returns an
 *          embedUrl on the canonical /embedded/resume/:id?pt= page
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
  getByExternalUserIdForPartner,
  getPrimaryResumeId,
} from "../services/partner/jobSeekers.js";
import {
  requireActiveConnection,
  listConnectionsForPartner,
  getConnection,
  revokeConnection,
  partnerProfileCacheKey,
  ConnectionRequiredError,
} from "../services/partner/connections.js";
import { mintEmbedToken } from "../services/partner/tokens.js";
import { handleCreateResume } from "../services/resume/ResumeService.js";
import { buildResumeParserPort } from "../services/resume/deps.js";
import { buildRepos } from "../repositories/index.js";
import { refreshDiffPercentFor } from "../services/resume/view.js";
import { looksLikeBinaryText, stripResumeControlChars } from "../services/resume/parse.js";
import {
  PARTNER_EMBED_KINDS,
  PARTNER_EMBED_THEMES,
  PARTNER_RESUME_UPLOAD_MAX_BYTES,
  type PartnerScope,
} from "../../../shared/partner.js";

/** Content types we can't turn into text in-Worker yet (no PDF/DOCX byte
 *  extractor here — that's a roadmap item). Partners send extracted `rawText`
 *  or structured `content` for these until then. */
const BINARY_RESUME_MIME_RE = /pdf|msword|officedocument|octet-stream/i;

/** Decode a base64 (optionally data-URL) résumé `file` to plain `rawText`.
 *  Enforces the size ceiling and rejects binary formats with a typed code so
 *  the SDK can branch. */
function decodePartnerResumeFile(
  file: string,
  contentType: string | undefined,
): { ok: true; rawText: string } | { ok: false; status: 413 | 415 | 422; code: string; message: string } {
  const b64 = file.includes(",") ? file.slice(file.indexOf(",") + 1) : file;
  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return { ok: false, status: 422, code: "INVALID_RESUME", message: "`file` is not valid base64." };
  }
  if (bytes.length > PARTNER_RESUME_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: `Résumé file exceeds ${PARTNER_RESUME_UPLOAD_MAX_BYTES} bytes. Send extracted text via \`rawText\` for large files.`,
    };
  }
  if (contentType && BINARY_RESUME_MIME_RE.test(contentType)) {
    return {
      ok: false,
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message:
        "Binary résumés (PDF/DOC/DOCX) can't be parsed server-side yet. Extract the text client-side and send it as `rawText` (or `content`).",
    };
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (looksLikeBinaryText(text)) {
    return {
      ok: false,
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message:
        "`file` decoded to binary, not text. Only text/JSON files parse server-side; send PDF/DOCX text as `rawText`.",
    };
  }
  const rawText = stripResumeControlChars(text).trim();
  if (!rawText) {
    return { ok: false, status: 422, code: "INVALID_RESUME", message: "`file` decoded to empty text." };
  }
  return { ok: true, rawText };
}

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

// A résumé write payload — structured `content`, `rawText`, or a base64 `file`
// (text/JSON only; binary PDF/DOCX rejected with UNSUPPORTED_MEDIA_TYPE).
const ResumeWriteBody = z.object({
  title: z.string().min(1).max(200).default("Resume"),
  content: z.record(z.string(), z.unknown()).optional(),
  rawText: z.string().max(60_000).optional(),
  /** Base64 (optionally a data: URL). */
  file: z.string().max(400_000).optional(),
  filename: z.string().max(255).optional(),
  contentType: z.string().max(120).optional(),
  privacy: z.enum(["public", "unlisted", "private"]).optional(),
});
type ResumeWriteInput = z.infer<typeof ResumeWriteBody>;

/** Normalize a résumé write to `{ content | rawText }`, decoding `file` when
 *  that's the only source. ONE resolver for create + uploadResume (DRY). */
function resolveResumeWrite(
  r: ResumeWriteInput,
): { ok: true; data: { title: string; content?: Record<string, unknown>; rawText?: string; privacy?: "public" | "unlisted" | "private" } }
  | { ok: false; status: 400 | 413 | 415 | 422; code: string; message: string } {
  const base = { title: r.title, privacy: r.privacy };
  if (r.content) return { ok: true, data: { ...base, content: r.content } };
  if (r.rawText) return { ok: true, data: { ...base, rawText: r.rawText } };
  if (r.file) {
    const decoded = decodePartnerResumeFile(r.file, r.contentType);
    if (!decoded.ok) return decoded;
    return { ok: true, data: { ...base, rawText: decoded.rawText } };
  }
  return {
    ok: false,
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Provide `content` (JSON Resume), `rawText`, or a base64 `file`.",
  };
}

// ── POST /v1/job-seekers — create an account (+ optional first resume) ──────
const CreateJobSeekerBody = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  password: z.string().min(8).max(200).optional(),
  externalUserId: z.string().max(255).optional(),
  resume: ResumeWriteBody.optional(),
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

  // Idempotent hit (#5): this externalUserId was already provisioned. Return the
  // existing account (200) without re-creating or duplicating a résumé.
  if (result.alreadyExisted) {
    return c.json(
      success({
        userId: result.userId,
        connectionId: result.connection.id,
        status: result.connection.status,
        claimUrl: result.claimUrl,
        resumeId: await getPrimaryResumeId(result.userId),
        alreadyExisted: true,
      }),
      200,
    );
  }

  // Optional first resume — reuse the canonical write path.
  let resumeId: string | null = null;
  if (parsed.data.resume) {
    const resolved = resolveResumeWrite(parsed.data.resume);
    // A malformed résumé must not orphan the just-created account — surface the
    // decode error but keep the account (the partner can retry uploadResume).
    if (!resolved.ok) {
      return c.json(
        success({
          userId: result.userId,
          connectionId: result.connection.id,
          status: result.connection.status,
          claimUrl: result.claimUrl,
          resumeId: null,
          alreadyExisted: false,
          resumeError: { code: resolved.code, message: resolved.message },
        }),
        201,
      );
    }
    const res = await handleCreateResume(partnerResumeDeps(), result.userId, {
      ...resolved.data,
      privacy: resolved.data.privacy ?? "private",
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
      alreadyExisted: false,
    }),
    201,
  );
});

// ── POST /v1/job-seekers/:userId/resumes — upload a resume ──────────────────
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
  const parsed = ResumeWriteBody.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  const resolved = resolveResumeWrite(parsed.data);
  if (!resolved.ok) {
    return c.json(error(resolved.code, resolved.message), resolved.status as any);
  }

  const res = await handleCreateResume(partnerResumeDeps(), userId, resolved.data);
  if (res.status === 201) {
    invalidateCachedKey(partnerProfileCacheKey(partnerId, userId));
  }
  return c.json(res.body as any, res.status as any);
});

// ── GET /v1/job-seekers/by-external/:externalUserId — reconcile mapping ──────
// Resolve the partner's own user id → Hired.Video account + connection status
// (#5/#7). Not active-gated: a partner can learn the mapping even while a
// connect() consent is still pending.
partnerRoutes.get(
  "/v1/job-seekers/by-external/:externalUserId",
  partnerAuth("read:connections"),
  async (c) => {
    const { partnerId } = c.var.partner!;
    const externalUserId = c.req.param("externalUserId");
    const found = await getByExternalUserIdForPartner(partnerId, externalUserId);
    if (!found) return c.json(error("NOT_FOUND", "No connection for that externalUserId."), 404);
    return c.json(success(found), 200);
  },
);

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
  // ETag from the résumé/profile updatedAt so a polling partner can send
  // If-None-Match and get a cheap 304 when nothing changed (#6 polling).
  const etag = payload.updatedAt ? `"${payload.updatedAt}"` : null;
  if (etag) {
    c.header("ETag", etag);
    if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
  }
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
  /** Forwarded to the embed page as `?theme=` / `?locale=`. */
  theme: z.enum(PARTNER_EMBED_THEMES).optional(),
  locale: z.string().max(10).optional(),
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
  // The embed reuses the canonical `/embedded/resume/:identifier` page — the
  // token rides as `?pt=` and grants owner-level read of the connected job
  // seeker's (possibly private) resume. No bespoke partner embed page/endpoint.
  const resumeId = await getPrimaryResumeId(parsed.data.userId);
  const base = (
    process?.env?.FRONTEND_URL || (globalThis as any).__ENV?.FRONTEND_URL || "https://hired.video"
  ).replace(/\/$/, "");
  let embedUrl: string | null = null;
  if (resumeId) {
    const params = new URLSearchParams({ pt: token });
    if (parsed.data.theme) params.set("theme", parsed.data.theme);
    if (parsed.data.locale) params.set("locale", parsed.data.locale);
    embedUrl = `${base}/embedded/resume/${resumeId}?${params.toString()}`;
  }
  return c.json(
    success({
      token,
      kind: parsed.data.kind,
      theme: parsed.data.theme ?? null,
      locale: parsed.data.locale ?? null,
      resumeId,
      embedUrl,
      expiresAt: expiresAt.toISOString(),
    }),
    200,
  );
});

partnerRoutes.all("*", (c) =>
  c.json(error("NOT_FOUND", "Partner API route not found"), 404),
);
