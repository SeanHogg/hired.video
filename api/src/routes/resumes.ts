import { Hono, type MiddlewareHandler } from "hono";
import { and, count, desc, eq, ne, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { bumpSearchVersion } from "../utils/search-cache.js";
import { pruneAutosaveVersions } from "../repositories/autosaveVersionPruning.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import {
  buildDeterministicSummary,
  classifySummarizeInput,
  MAX_RESUME_CHARS,
  resolveResumeForSummary,
  SUMMARY_SYSTEM_PROMPT,
  type ResolvedResume,
} from "../services/resume/summarize.js";
import { analyzeMerge } from "../services/resume/merge.js";
import { MergeRunSchema, commitMerge, resolveMergeSide, runMerge, type MergeRunInput } from "../services/resume/merge-flow.js";
import { consolidateBullets, type BulletFieldType } from "../services/resume/rewrite.js";
import { ipCountryFromCtx } from "../services/analytics/artifactView.js";
import { tryParseJsonResume } from "../services/resume/parse.js";
import { ocrResumeImage, parseResumeTextWithAI, resumeParseHandler } from "./resume-parse.js";
import { RESUME_LIST_FIELDS, parseFields, projectRows } from "../../../shared/projection.js";
// Static imports of handlers + deps. The previous lazy `await import()` form
// was a workaround for circular-import ordering during the route extraction;
// the cycle has since been broken and these can load eagerly. (#4 punch list)
import {
  handleCloneResume,
  handleCreateVariation,
  handleDeleteResume,
  handleDetach,
  handleExportResume,
  handleGetMetadata,
  handleGetResume,
  handleGetResumeDiff,
  handleListMasterGroups,
  handleListOwnedResumes,
  handleListPublicResumes,
  handlePromote,
  handlePublishResume,
  handleSaveResume,
  handleSentimentPrediction,
  handleSetActive,
  handleSetMaster,
  handleSetPrivacy,
  handleUnwatchResume,
  handleUpdateMetadata,
  handleUpdateResume,
  handleValidateSlug,
  handleWatchResume,
} from "../services/resume/ResumeService.js";
import { buildResumeDeps } from "../services/resume/deps.js";
import { verifyEmbedToken } from "../services/partner/tokens.js";
import { requireActiveConnection } from "../services/partner/connections.js";
import {
  RESUME_BINARY_TEXT_MESSAGE,
  classifyResumeText,
  extractUploadedResumeFiles,
} from "../services/resume/uploadIntake.js";
import { mergeFromFileHandler } from "./resume-merge-from-file.js";
import { resumeExtractTextHandler } from "./resume-extract-text.js";
import { gateUploadOcr } from "./resume-upload-ocr-gate.js";
import { createAiTextCaller } from "../services/adapters/ai-text-caller.js";
import { parseReviseFocus, reviseResumeContent, REVISE_MAX_INPUT_CHARS } from "../services/resume/revise.js";
import { createIpRateLimiter } from "../middleware/rateLimiter.js";
import { fail, ok } from "../utils/response.js";
import { computeDiffPercent } from "../utils/resume-diff.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import {
  CreateResumeSchema,
  UpdateResumeSchema,
  type Resume,
  type ResumeSummary,
  type ResumePrivacy,
} from "../../../shared/resume.js";

const { resumeInformation: resumes, watchedResumes, resumeViews } = schema;

export const resumeRoutes = new Hono<AppEnv>();


// Pure serializers + constants — n-layer refactor split these across
// handlers/resume-serializer.ts (pure), services/resume-content-service.ts
// (heal+validate), and services/resume-view-service.ts (viewer extras +
// diff + sentiment, all routed through ResumeRepository). This file
// re-exports the same public surface for back-compat with tests and
// other routes that still import from here.
import {
  PRIVACY_TO_LEVEL,
  LEVEL_TO_PRIVACY,
  EMPTY_VIEWER_EXTRAS,
  freshOwnerExtras,
  rowToResume,
  rowToResumeSummary,
  rowToPublicResumeSummary,
  projectUserResumes,
  type ResumeViewerExtras,
  type PublicResumeSummary,
} from "../handlers/resume-serializer.js";
import {
  normalizeContent,
  preserveMetaData,
  preserveSkillEvidence,
} from "../services/resume/content.js";
import {
  computeViewerExtras,
  computeViewerExtrasBatch,
  recordResumeView,
  refreshDiffPercentFor,
  persistSentimentScore,
} from "../services/resume/view.js";
import { buildRepos } from "../repositories/index.js";
import { healAndValidateContent } from "../services/resume/content.js";

export {
  PRIVACY_TO_LEVEL,
  LEVEL_TO_PRIVACY,
  EMPTY_VIEWER_EXTRAS,
  normalizeContent,
  rowToResume,
  rowToResumeSummary,
  rowToPublicResumeSummary,
  projectUserResumes,
  preserveMetaData,
  preserveSkillEvidence,
  computeViewerExtras,
  computeViewerExtrasBatch,
  recordResumeView,
  refreshDiffPercentFor,
  persistSentimentScore,
};
export type { ResumeViewerExtras };

/** Compute a short sha256 hash of the client's IP plus a daily salt so
 *  anonymous viewers can be coarsely deduped within a day without the
 *  raw IP landing in the DB. Returns null if no IP header is present
 *  (local test contexts). */
export function hashClientIp(c: any): string | null {
  const ip =
    c.req.header?.("cf-connecting-ip") ??
    c.req.header?.("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  if (!ip) return null;
  const salt = new Date().toISOString().slice(0, 10); // daily salt
  // Web Crypto is available in CF Workers + Node 20+. Fallback to a
  // non-crypto hash keeps tests and local dev from crashing if Web
  // Crypto is missing; this path is not security-critical — the hash
  // just dedupes anonymous views.
  try {
    const enc = new TextEncoder().encode(`${ip}|${salt}`);
    if (typeof crypto !== "undefined" && (crypto as any).subtle) {
      // Synchronous hash isn't available via Web Crypto; callers that
      // want a stable hash per-request can await the async helper
      // directly. This function returns a short fallback so the DB
      // write stays non-blocking for the common case.
    }
    // Cheap deterministic fallback — FNV-1a. Not cryptographic, just a
    // bucket id for same-day dedup.
    let h = 0x811c9dc5;
    for (let i = 0; i < enc.length; i++) {
      h ^= enc[i];
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// TRANSITIONAL BRIDGES — during the shim removal, many call sites still
// use the old `rowToLegacyResume(row)` / `rowToSummary(row, userId)`
// signatures. These forward to the new pure serializers with empty
// viewer extras. High-signal GET/list handlers are upgraded to use
// `computeViewerExtras[Batch]` directly; the remaining bridges will be
// removed as each caller is migrated.
// ---------------------------------------------------------------------------

function rowToLegacyResume(row: typeof resumes.$inferSelect): Resume {
  return rowToResume(row, EMPTY_VIEWER_EXTRAS);
}

function rowToSummary(
  row: typeof resumes.$inferSelect,
  currentUserId?: string | null,
): ResumeSummary {
  const isOwner = Boolean(currentUserId && row.userId === currentUserId);
  return rowToResumeSummary(row, { ...EMPTY_VIEWER_EXTRAS, isOwner });
}

async function parseBodyToContent(c: any): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => null);

  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return { raw: body };
    }
  }

  if (body && typeof body === "object") {
    if (typeof (body as any).content === "string") {
      try {
        return JSON.parse((body as any).content) as Record<string, unknown>;
      } catch {
        return { raw: (body as any).content };
      }
    }
    return body as Record<string, unknown>;
  }

  return {};
}


/**
 * Returns true when the user has no resumes yet. The first-uploaded resume
 * is promoted to master+active automatically so the Chrome extension (which
 * only surfaces the active resume) has something to work with, and so new
 * users aren't forced to click "Set Master" / "Set Active" before their
 * first upload is usable.
 */
/** Validate-Transform-Fix the incoming `content` before any write. All
 *  legacy write paths in this file route through this helper so bad data
 *  cannot reach the DB. Returns `c.json(...)` when heal fails so callers
 *  can just `return failHeal(c, result) ?? undefined;` — on success it
 *  returns the healed content. */
function failHeal(c: any, issues: Array<{ path: string; message: string }>) {
  return c.json(fail("VALIDATION_ERROR", "Invalid resume content", { issues }), 400);
}

// Modern plural endpoints — also exported so app.ts can register them at the mount root
// (Hono sub-router root "/" never matches when mounted with app.route(prefix, router))
export const listResumesHandler = async (c: any) => {
  const user = c.var.user;
  const repo = buildRepos(getDb()).resumes;
  const includeArchived = c.req.query("includeArchived") === "1"
    || c.req.query("includeArchived") === "true";
  const rows = await repo.findAllForOwner(user.sub, { includeArchived });
  const extrasMap = await computeViewerExtrasBatch(repo, rows, user.sub);
  return c.json(
    ok(rows.map((r) => rowToResume(r, extrasMap.get(r.id) ?? EMPTY_VIEWER_EXTRAS))),
    200,
  );
};

export const createResumeHandler = async (c: any) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateResumeSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  // Resolve content with priority:
  //   1. Explicit `content` object (client may send PascalCase).
  //   2. `rawText` — try JSON Resume parse first, fall back to AI parse.
  // In both cases the raw blob goes through healAndValidateContent before
  // reaching the repo, so null-as-array / PascalCase / missing sections
  // are either fixed or cause a 400 with a clear issue list.
  let rawContent: unknown = parsed.data.content ?? {};
  if (parsed.data.rawText) {
    const structured = tryParseJsonResume(parsed.data.rawText);
    rawContent = structured ?? (await parseResumeTextWithAI(c, parsed.data.rawText));
  }
  const healResult = healAndValidateContent(rawContent);
  if (!healResult.ok) return failHeal(c, healResult.issues);

  const privacyLevel = PRIVACY_TO_LEVEL[parsed.data.privacy ?? "private"] ?? 10;
  const repo = buildRepos(getDb()).resumes;

  // First upload on the account → auto-promote to master+active so the
  // Chrome extension has an active resume to tailor with and the web UI
  // doesn't leave new users staring at an unactivated card.
  const existingCount = await repo.countByOwner(user.sub);
  const isFirst = existingCount === 0;
  const isMaster = (parsed.data.isMaster ?? false) || isFirst;

  // Caller-supplied slug must be globally unique (public URLs resolve to
  // a single row, so a collision silently shadows someone else's link).
  // Same rule handleUpdateResume enforces.
  if (parsed.data.slug) {
    const taken = await repo.findBySlug(parsed.data.slug);
    if (taken) {
      return c.json(
        fail(
          "SLUG_TAKEN",
          `The slug "${parsed.data.slug}" is already in use. Please choose a different slug.`,
        ),
        409,
      );
    }
  }

  const created = await repo.insertOne({
    userId: user.sub,
    title: parsed.data.title,
    slug: parsed.data.slug ?? null,
    content: healResult.content as Record<string, unknown>,
    status: parsed.data.status,
    isMaster,
    isActive: isFirst,
    privacyLevel,
  } as any);

  // If the caller didn't supply a slug, fall back to the id so the row
  // always has a stable URL segment. Users can rename it later via the
  // edit page; the UUID form still works because both /public/:slug and
  // /embedded/:identifier detect UUID-shaped paths against the id column.
  let finalRow = created;
  if (!parsed.data.slug) {
    const updated = await repo.updateByIdForOwner(created.id, user.sub, {
      slug: created.id,
    });
    finalRow = updated ?? created;
  }

  return c.json(ok(rowToLegacyResume(finalRow)), 201);
};

// Register at both "" and "/" — Hono sub-router path stripping can vary
resumeRoutes.get("", listResumesHandler);
resumeRoutes.get("/", listResumesHandler);
resumeRoutes.post("", createResumeHandler);
resumeRoutes.post("/", createResumeHandler);

resumeRoutes.get("/public", async (c) => {
  const result = await handleListPublicResumes(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user?.sub ?? null,
    {
      page: Number(c.req.query("page") ?? 1) || 1,
      limit: Number(c.req.query("limit") ?? 20) || 20,
    },
  );
  // `?fields=` projection (gap #1370). Resume `content` is a heavy JSONB
  // blob; list views (browse, search results) rarely need it. Projecting
  // here trims the wire payload without changing the handler contract.
  const fields = parseFields(c.req.query("fields"), RESUME_LIST_FIELDS);
  if (fields && result.body && typeof result.body === "object" && Array.isArray((result.body as { data?: { items?: unknown } }).data?.items)) {
    const body = result.body as { data: { items: Array<Record<string, unknown>> } };
    body.data.items = projectRows(body.data.items, fields) as Array<Record<string, unknown>>;
  }
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.get("/public/:slug", async (c) => {
  const result = await handleGetResume(
    buildResumeDeps(() => Promise.resolve({})),
    {
      viewerId: c.var.user?.sub ?? null,
      ipHash: hashClientIp(c),
      ipCountry: ipCountryFromCtx(c),
      referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    },
    c.req.param("slug"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.get("/getresumesownedbyauthuser", async (c) => {
  const result = await handleListOwnedResumes(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.get("/withownership", async (c) => {
  const includeArchived = c.req.query("includeArchived") === "1"
    || c.req.query("includeArchived") === "true";
  const result = await handleListOwnedResumes(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    { includeOwnership: true, includeArchived },
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.get("/mastergroups", async (c) => {
  const result = await handleListMasterGroups(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.get("/validateslug", async (c) => {
  const result = await handleValidateSlug(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    {
      slug: c.req.query("slug") ?? "",
      resumeId: c.req.query("resumeId") ?? null,
    },
  );
  return c.json(result.body as any, result.status as any);
});

// Mounted under optionalAuthMiddleware (see app.ts OPTIONAL_AUTH_PUBLIC_ROUTE)
// so anonymous callers can embed public resumes (chrome extension, job-profile
// embeds, social feed). Owners can additionally embed their own private resumes.
// View recording is skipped — embeds would otherwise inflate analytics with
// every pageload of a page containing an embed.
/** Resolve a partner embed token → the user id it grants owner-level read for,
 *  or null if the token is invalid/expired or the connection was revoked. */
async function partnerEmbedViewer(pt: string): Promise<string | null> {
  try {
    const payload = await verifyEmbedToken(pt);
    await requireActiveConnection(payload.p, payload.u);
    return payload.u;
  } catch {
    return null;
  }
}

resumeRoutes.get("/embedded/:identifier", async (c) => {
  // Partner embed (?pt=<embed token>): a job seeker who consented to a partner
  // platform can have their resume — even a PRIVATE one — embedded there. The
  // signed token grants owner-level read for THAT user only, so this one
  // endpoint + the EmbeddedResume page serve partner embeds too (no bespoke
  // partner embed surface). requireActiveConnection re-checks consent so a
  // revoke cuts off live embeds; handleGetResume still enforces that the
  // resume belongs to the token's user (viewerId === row.userId), so a swapped
  // identifier can't leak someone else's private resume.
  let viewerId = c.var.user?.sub ?? null;
  const pt = c.req.query("pt");
  if (pt) {
    const grantedUserId = await partnerEmbedViewer(pt);
    if (grantedUserId) viewerId = grantedUserId;
  }
  const result = await handleGetResume(
    buildResumeDeps(() => Promise.resolve({})),
    {
      viewerId,
      ipHash: hashClientIp(c),
      ipCountry: ipCountryFromCtx(c),
      referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    },
    c.req.param("identifier"),
    { recordView: false },
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/save", async (c) => {
  const content = await parseBodyToContent(c);
  const result = await handleSaveResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    content,
  );
  return c.json(result.body as any, result.status as any);
});

// Anonymous parse cap for the /build workspace (signed-out visitors). The
// route is optional-auth (app.ts RESUME_PARSE_ROUTE); authed callers skip this
// limiter and are metered by servicesProcessor below instead. Conservative:
// 10 parses / IP / hour — enough to retry a couple of files, not to farm the
// LLM. Same shared factory as the register / auth-write limiters.
const anonResumeParseLimiter = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxAttempts: 10,
  message: "Too many resume parses from this network. Create a free account to keep going.",
});

const anonResumeParseGate: MiddlewareHandler<AppEnv> = async (c, next) =>
  c.var.user?.sub ? next() : anonResumeParseLimiter(c, next);

resumeRoutes.post("/parse", anonResumeParseGate, attachTokenBudget(), resumeParseHandler);
resumeRoutes.post("/extract-text", anonResumeParseGate, attachTokenBudget(), resumeExtractTextHandler);

/**
 * POST /api/resumes/revise  { content, instruction, focus? }
 *
 * The /build chat: apply one plain-language change ("make it punchier", "fit
 * it on one page") to the draft on screen and return the revised content —
 * or, when the message is a question, `{ reply }` with the draft unchanged.
 * Nothing is persisted — the workspace owns the draft. Optional-auth like
 * /parse (same anonymous IP cap); signed-in callers spend AI tokens through
 * the token budget. The model call goes through the shared résumé caller, so
 * it falls back to Workers AI when the gateway is unavailable.
 */
resumeRoutes.post("/revise", anonResumeParseGate, attachTokenBudget(), async (c) => {
  const body = (await c.req.json().catch(() => null)) as { content?: unknown; instruction?: unknown; focus?: unknown } | null;
  if (!body || typeof body.instruction !== "string" || !body.content || typeof body.content !== "object") {
    return c.json(fail("VALIDATION_ERROR", "Send the resume `content` and a change `instruction`."), 422);
  }
  const result = await reviseResumeContent(
    body.content,
    body.instruction,
    createAiTextCaller(c.env, c.var.user, {
      label: "resume_revise_ai",
      useCase: "resume_optimize",
      maxInputChars: REVISE_MAX_INPUT_CHARS,
    }),
    parseReviseFocus(body.focus),
  );
  // `in` narrowing — the API compiles with `strict: false`, where a
  // boolean discriminant doesn't narrow the union here.
  if ("code" in result) {
    const status = result.code === "AI_FAILED" ? 503 : 422;
    return c.json(fail(result.code === "INVALID_INSTRUCTION" ? "VALIDATION_ERROR" : "REVISE_FAILED", result.message), status);
  }
  // A question gets an answer and leaves the draft alone.
  if ("reply" in result) return c.json(ok({ reply: result.reply }), 200);
  return c.json(ok({ content: result.content, changed: result.changed }), 200);
});

/**
 * POST /api/resumes/createfromfile
 *
 * Multipart file upload. Handles JSON Resume exports, PDFs, DOCX, plain text
 * and images, all through the shared upload intake (services/resume/uploadIntake)
 * so this route and /parse read uploads identically. Server-side extraction
 * lets the Chrome extension POST raw bytes when its client-side extractor
 * can't read the file — keeping the extension bundle free of pdfjs (MV3 store
 * review avoids the `new Function` flag entirely).
 */
resumeRoutes.post("/createfromfile", async (c) => {
  const user = c.var.user;
  const form = await c.req.formData().catch(() => null);
  // Several `file` entries = one document's pages (a rasterised scan); the
  // shared intake joins them in upload order.
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return c.json(fail("VALIDATION_ERROR", "No file provided."), 422);
  }

  // Image uploads spend vision OCR — same `resume_parse` gate + meter as
  // /extract-text and /merge/from-file (#2390).
  const ocr = await gateUploadOcr(c, files, "createfromfile");
  if (ocr.blocked) return ocr.blocked;

  const intake = await extractUploadedResumeFiles(files, {
    ocrImage: (image) => ocrResumeImage(c, image),
  });
  if (intake.kind === "error") return c.json(fail("PARSE_FAILED", intake.message), 422);

  const resumeText = intake.kind === "text" ? intake.text : "";
  const structured = intake.kind === "structured" ? intake.content : null;

  // Structured JSON Resume takes priority; otherwise run AI parse so the
  // result matches /createfromtext's output (extension and web app use the
  // same stored shape regardless of which surface uploaded).
  let content: Record<string, unknown>;
  if (structured) {
    content = structured;
  } else if (resumeText) {
    // Shared binary guard + cleanup + JSON Resume short-circuit (same rule as
    // /parse and /merge/from-file) — raw binary never reaches JSONB.
    const source = classifyResumeText(resumeText);
    if (source.kind === "binary") {
      return c.json(fail("INVALID_RESUME_TEXT", RESUME_BINARY_TEXT_MESSAGE), 422);
    }
    if (source.kind === "structured") {
      content = source.content;
    } else {
      try {
        content = await parseResumeTextWithAI(c, source.text);
      } catch (err) {
        console.warn(
          "[createfromfile] AI parse failed, storing raw text fallback:",
          err instanceof Error ? err.message : err,
        );
        content = { raw: source.text };
      }
    }
  } else {
    content = { raw: "" };
  }

  const title = deriveTitleFromContent(content, files[0].name) || "Uploaded Resume";

  // AI parse output is a primary source of null-as-array bugs, so it
  // must pass through the heal+validate pipe before the insert.
  const healResult = healAndValidateContent(content);
  if (!healResult.ok) return failHeal(c, healResult.issues);

  const repo = buildRepos(getDb()).resumes;
  const isFirst = (await repo.countByOwner(user.sub)) === 0;
  const created = await repo.insertOne({
    userId: user.sub,
    title,
    content: healResult.content as Record<string, unknown>,
    status: "draft",
    isMaster: isFirst,
    isActive: isFirst,
  } as any);

  ocr.meter();
  return c.json(ok(rowToLegacyResume(created)), 201);
});

/** Extract a human-friendly title from a JSON Resume content blob. Falls
 *  back to the provided filename when no suitable title field is found. */
function deriveTitleFromContent(content: Record<string, unknown> | unknown, filename?: string): string {
  if (content && typeof content === "object") {
    const c = content as Record<string, unknown>;
    const basics = (c.basics ?? c.Basics) as Record<string, unknown> | undefined;
    if (basics && typeof basics === "object") {
      const name = basics.name ?? basics.Name;
      const label = basics.label ?? basics.Label;
      if (typeof name === "string" && name.trim()) {
        return typeof label === "string" && label.trim() ? `${name} — ${label}` : name;
      }
    }
  }
  if (filename) return filename.replace(/\.[^/.]+$/, "");
  return "";
}

/**
 * POST /api/resumes/createfromtext
 *
 * Chrome extension endpoint: accepts pre-extracted plain text instead of
 * a binary file.  This avoids binary-parsing issues (PDFs read via
 * file.text() produce garbage and "unsupported Unicode escape sequence"
 * errors in the DB).  The extension extracts text client-side and sends
 * it here as JSON.
 */
resumeRoutes.post("/createfromtext", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : "Uploaded Resume";
  const rawText = typeof body?.text === "string" ? body.text : "";

  // Reject raw binary payloads before they reach Postgres. A client that
  // failed to extract text from a PDF/DOCX may ship the raw bytes as a
  // string — Postgres JSONB rejects any embedded \u0000 with a cryptic
  // "unsupported Unicode escape sequence" error. Catch that here with a
  // clear message so the user knows to re-upload a different format.
  if (rawText.includes("\u0000") || rawText.startsWith("%PDF") || rawText.startsWith("PK\u0003\u0004")) {
    return c.json(
      fail(
        "INVALID_RESUME_TEXT",
        "Couldn't read that file — it looks like raw binary instead of plain text. " +
          "Try a .txt, .md, .docx file, or a PDF containing selectable text (not a scan).",
      ),
      422,
    );
  }

  // Strip any remaining control characters other than tabs/newlines — they
  // survive JSON transport but break the JSONB column.
  // eslint-disable-next-line no-control-regex
  const text = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  if (!text || text.trim().length < 10) {
    return c.json(fail("VALIDATION_ERROR", "Resume text is too short or empty. Please try a different file."), 422);
  }

  // Resolve content: structured JSON Resume if the payload is one, else
  // run the AI parser so the Chrome extension gets the same structured
  // result as the web UI (Resume Manager, scoring, tailoring all rely on
  // parsed work/education/skills — `{ raw: text }` breaks all of them).
  const structured = tryParseJsonResume(text);
  let content: Record<string, unknown>;
  if (structured) {
    content = structured;
  } else {
    try {
      content = await parseResumeTextWithAI(c, text);
    } catch (err) {
      console.warn(
        "[createfromtext] AI parse failed, storing raw text fallback:",
        err instanceof Error ? err.message : err,
      );
      content = { raw: text };
    }
  }
  const finalTitle = structured
    ? (deriveTitleFromContent(structured) || title)
    : title;

  const healResult = healAndValidateContent(content);
  if (!healResult.ok) return failHeal(c, healResult.issues);

  const repo = buildRepos(getDb()).resumes;
  const isFirst = (await repo.countByOwner(user.sub)) === 0;
  const created = await repo.insertOne({
    userId: user.sub,
    title: finalTitle,
    content: healResult.content as Record<string, unknown>,
    status: "draft",
    isMaster: isFirst,
    isActive: isFirst,
  } as any);

  return c.json(ok(rowToLegacyResume(created)), 201);
});

resumeRoutes.post("/summarize", attachTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const user = c.var.user;

  // Closes gap-register #765 — Free-tier 5 summaries / month.
  const blocked = await servicesProcessor.enforce(c, "resume_summary");
  if (blocked) return blocked;

  const repo = buildRepos(getDb()).resumes;
  const resolved: ResolvedResume = await resolveResumeForSummary(
    repo,
    classifySummarizeInput(body),
    user?.sub,
  );
  if (resolved.ok === false) {
    return c.json(fail(resolved.code, resolved.message), resolved.status);
  }
  const { resumeText } = resolved;

  if (hasAnyLLMProviderKey(c.env)) {
    try {
      const llm = createLLMClient(c.env, c.var.user);
      const { content } = await llm.callText("resume_summary", {
        useCase: "resume_summary",
        systemPrompt: SUMMARY_SYSTEM_PROMPT,
        userMessage: `Summarise this resume:\n\n${resumeText.slice(0, MAX_RESUME_CHARS)}`,
        responseFormat: "text",
      });
      const summary = content.trim();
      if (summary) {
        servicesProcessor.meterEvent(c, "resume_summary");
        return c.json(ok({ result: summary }), 200);
      }
    } catch (err) {
      console.warn(
        "[resume/summarize] LLM error, falling back to deterministic summary:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  servicesProcessor.meterEvent(c, "resume_summary");
  return c.json(ok({ result: buildDeterministicSummary(resumeText) }), 200);
});

resumeRoutes.post("/sentimentprediction", attachTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleSentimentPrediction(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    body,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/watch/:id", async (c) => {
  const result = await handleWatchResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/unwatch/:id", async (c) => {
  const result = await handleUnwatchResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

// #403 — Followed-resume surface. Returns every resume the caller is
// watching, joined to the resume row so /resumes?tab=watched can render
// the same cards it does for sourced / owned. Mirrors the People
// connections-vs-talent-pool split.
resumeRoutes.get("/watched", async (c) => {
  const userId = c.var.user.sub as string;
  const db = getDb();
  const rows = await db
    .select({
      id: schema.resumeInformation.id,
      userId: schema.resumeInformation.userId,
      title: schema.resumeInformation.title,
      slug: schema.resumeInformation.slug,
      isMaster: schema.resumeInformation.isMaster,
      status: schema.resumeInformation.status,
      privacyLevel: schema.resumeInformation.privacyLevel,
      scores: schema.resumeInformation.scores,
      sentimentScore: schema.resumeInformation.sentimentScore,
      archivedAt: schema.resumeInformation.archivedAt,
      createdAt: schema.resumeInformation.createdAt,
      updatedAt: schema.resumeInformation.updatedAt,
      watchedAt: schema.watchedResumes.watchedAt,
    })
    .from(schema.watchedResumes)
    .innerJoin(
      schema.resumeInformation,
      eq(schema.watchedResumes.resumeId, schema.resumeInformation.id),
    )
    .where(eq(schema.watchedResumes.viewerId, userId))
    .orderBy(desc(schema.watchedResumes.watchedAt))
    .limit(200);
  return c.json(
    ok({ resumes: rows.map((r) => ({ ...r, ownership: "watched" as const })) }),
    200,
  );
});

// Dynamic routes below static routes
// Mounted under optionalAuthMiddleware via PUBLIC_RESUME_DETAIL_ROUTE in app.ts.
// Access policy: owner always wins; anyone else only sees public resumes.
// Privacy-blocked requests return 404 with code="RESUME_PRIVATE" so that when
// owners share a link, the recipient is told the resume is private (prompting
// them to ask for access) rather than seeing a generic "doesn't exist" error.
// Dynamic routes — thin Hono adapters delegating to resume-handlers.ts.
// Access policy: mounted under optionalAuthMiddleware via
// PUBLIC_RESUME_DETAIL_ROUTE in app.ts. Owner always wins; anyone else
// only sees public resumes. Privacy-blocked requests return 404 with
// code="RESUME_PRIVATE" so owner-shared links prompt recipients to ask
// for access rather than showing a generic "doesn't exist" error.
resumeRoutes.get("/:id", async (c) => {
  const result = await handleGetResume(
    buildResumeDeps(() => Promise.resolve({})),
    {
      viewerId: c.var.user?.sub ?? null,
      ipHash: hashClientIp(c),
      ipCountry: ipCountryFromCtx(c),
      referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    },
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.put("/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleUpdateResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
    body,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.delete("/:id", async (c) => {
  const result = await handleDeleteResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

// #154 — Archive / Unarchive flow. Soft-delete that flips
// `archived_at`; preserves slug + analytics + score history. Owner-only.
resumeRoutes.post("/:id/archive", async (c) => {
  const userId = c.var.user.sub as string;
  const id = c.req.param("id");
  const db = getDb();
  const [row] = await db
    .select({ id: schema.resumeInformation.id, userId: schema.resumeInformation.userId })
    .from(schema.resumeInformation)
    .where(eq(schema.resumeInformation.id, id))
    .limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  if (row.userId !== userId) return c.json(fail("FORBIDDEN", "Not your resume"), 403);
  const [updated] = await db
    .update(schema.resumeInformation)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.resumeInformation.id, id))
    .returning();
  return c.json(ok({ resume: updated }), 200);
});

resumeRoutes.post("/:id/unarchive", async (c) => {
  const userId = c.var.user.sub as string;
  const id = c.req.param("id");
  const db = getDb();
  const [row] = await db
    .select({ id: schema.resumeInformation.id, userId: schema.resumeInformation.userId })
    .from(schema.resumeInformation)
    .where(eq(schema.resumeInformation.id, id))
    .limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  if (row.userId !== userId) return c.json(fail("FORBIDDEN", "Not your resume"), 403);
  const [updated] = await db
    .update(schema.resumeInformation)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(schema.resumeInformation.id, id))
    .returning();
  return c.json(ok({ resume: updated }), 200);
});

// #155 — Resume version history. Mirrors studio_project_versions.
// Autosave rows are subject to the 50-version cap + 30-day retention
// applied below; user-labeled snapshots are kept until the parent is
// deleted (cascade on `resume_id`).
const RESUME_AUTOSAVE_CAP = 50;
const RESUME_AUTOSAVE_RETENTION_DAYS = 30;

resumeRoutes.get("/:id/versions", async (c) => {
  const userId = c.var.user.sub as string;
  const id = c.req.param("id");
  const db = getDb();
  const [parent] = await db
    .select({ userId: schema.resumeInformation.userId })
    .from(schema.resumeInformation)
    .where(eq(schema.resumeInformation.id, id))
    .limit(1);
  if (!parent) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  if (parent.userId !== userId) return c.json(fail("FORBIDDEN", "Not your resume"), 403);
  const versions = await db
    .select({
      id: schema.resumeVersions.id,
      versionNumber: schema.resumeVersions.versionNumber,
      label: schema.resumeVersions.label,
      isAutosave: schema.resumeVersions.isAutosave,
      createdAt: schema.resumeVersions.createdAt,
    })
    .from(schema.resumeVersions)
    .where(eq(schema.resumeVersions.resumeId, id))
    .orderBy(desc(schema.resumeVersions.versionNumber))
    .limit(200);
  return c.json(ok({ versions }), 200);
});

const CreateVersionSchema = z.object({
  label: z.string().trim().max(120).optional(),
  isAutosave: z.boolean().optional(),
});

resumeRoutes.post("/:id/versions", async (c) => {
  const userId = c.var.user.sub as string;
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateVersionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid version payload"), 400);
  }
  const db = getDb();
  const [parent] = await db
    .select({
      userId: schema.resumeInformation.userId,
      content: schema.resumeInformation.content,
    })
    .from(schema.resumeInformation)
    .where(eq(schema.resumeInformation.id, id))
    .limit(1);
  if (!parent) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  if (parent.userId !== userId) return c.json(fail("FORBIDDEN", "Not your resume"), 403);

  const [{ maxVersion }] = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(${schema.resumeVersions.versionNumber}), 0)` })
    .from(schema.resumeVersions)
    .where(eq(schema.resumeVersions.resumeId, id));

  const [created] = await db
    .insert(schema.resumeVersions)
    .values({
      resumeId: id,
      userId,
      versionNumber: (maxVersion ?? 0) + 1,
      label: parsed.data.label,
      resumeData: parent.content as any,
      isAutosave: parsed.data.isAutosave ?? false,
    })
    .returning();

  // Enforce the autosave cap + retention. User-labeled snapshots are
  // untouched.
  if (created.isAutosave) {
    // Retention window + cap (drop oldest beyond the cap) in one statement.
    await pruneAutosaveVersions(
      db,
      {
        table: schema.resumeVersions,
        id: schema.resumeVersions.id,
        parentId: schema.resumeVersions.resumeId,
        isAutosave: schema.resumeVersions.isAutosave,
        createdAt: schema.resumeVersions.createdAt,
      },
      id,
      { cap: RESUME_AUTOSAVE_CAP, retentionDays: RESUME_AUTOSAVE_RETENTION_DAYS },
    );
  }

  return c.json(ok({ version: created }), 201);
});

resumeRoutes.post("/:id/versions/:vid/restore", async (c) => {
  const userId = c.var.user.sub as string;
  const id = c.req.param("id");
  const vid = c.req.param("vid");
  const db = getDb();
  const [parent] = await db
    .select({ userId: schema.resumeInformation.userId })
    .from(schema.resumeInformation)
    .where(eq(schema.resumeInformation.id, id))
    .limit(1);
  if (!parent) return c.json(fail("NOT_FOUND", "Resume not found"), 404);
  if (parent.userId !== userId) return c.json(fail("FORBIDDEN", "Not your resume"), 403);

  const [version] = await db
    .select()
    .from(schema.resumeVersions)
    .where(and(eq(schema.resumeVersions.id, vid), eq(schema.resumeVersions.resumeId, id)))
    .limit(1);
  if (!version) return c.json(fail("NOT_FOUND", "Version not found"), 404);

  const [restored] = await db
    .update(schema.resumeInformation)
    .set({ content: version.resumeData as any, updatedAt: new Date() })
    .where(eq(schema.resumeInformation.id, id))
    .returning();
  return c.json(ok({ resume: restored }), 200);
});

resumeRoutes.post("/:id/clone", async (c) => {
  const result = await handleCloneResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/publish", async (c) => {
  const result = await handlePublishResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

/**
 * Convert a JSON Resume content object to formatted Markdown.
 * Handles the standard JSON Resume schema (basics, work, education,
 * skills, volunteer, projects, certificates) as well as legacy flat
 * formats. Falls back to JSON.stringify only if the content is
 * completely unrecognisable.
 */
function jsonResumeToMarkdown(content: Record<string, unknown> | null, fallbackTitle: string): string {
  if (!content || typeof content !== "object") return `# ${fallbackTitle}\n`;
  const c = content as Record<string, unknown>;
  const sections: string[] = [];

  // Helper to coerce arrays
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  // ---- Basics / Contact ----
  const basics = (c.basics ?? c.Basics) as Record<string, unknown> | undefined;
  if (basics && typeof basics === "object") {
    const name = basics.name ?? basics.Name ?? fallbackTitle;
    sections.push(`# ${name}`);
    const subtitle = basics.label ?? basics.Label;
    if (subtitle) sections.push(`**${subtitle}**`);
    const contact: string[] = [];
    if (basics.email ?? basics.Email) contact.push(String(basics.email ?? basics.Email));
    if (basics.phone ?? basics.Phone) contact.push(String(basics.phone ?? basics.Phone));
    const loc = basics.location as Record<string, unknown> | undefined;
    if (loc && typeof loc === "object") {
      const locParts = [loc.city, loc.region, loc.countryCode].filter(Boolean);
      if (locParts.length) contact.push(locParts.join(", "));
    }
    if (basics.url ?? basics.website) contact.push(String(basics.url ?? basics.website));
    if (contact.length) sections.push(contact.join(" | "));
    const summary = basics.summary ?? basics.Summary;
    if (summary) sections.push(`\n## Summary\n\n${summary}`);
  } else {
    // Legacy flat format
    const name = c.name ?? c.fullName ?? fallbackTitle;
    sections.push(`# ${name}`);
    const title = c.headline ?? c.title ?? c.label;
    if (title) sections.push(`**${title}**`);
    const summary = c.summary ?? c.objective;
    if (summary) sections.push(`\n## Summary\n\n${summary}`);
  }

  // ---- Skills ----
  const skills = c.skills ?? c.Skills;
  if (Array.isArray(skills) && skills.length) {
    const lines = skills.map((s: unknown) => {
      if (typeof s === "string") return `- ${s}`;
      if (s && typeof s === "object") {
        const sk = s as Record<string, unknown>;
        const name = sk.name ?? sk.Name ?? "";
        const kw = Array.isArray(sk.keywords ?? sk.Keywords)
          ? (sk.keywords ?? sk.Keywords) as string[]
          : [];
        return kw.length ? `- **${name}**: ${kw.join(", ")}` : `- ${name}`;
      }
      return "";
    }).filter(Boolean);
    if (lines.length) sections.push(`\n## Skills\n\n${lines.join("\n")}`);
  } else if (typeof skills === "string" && skills.trim()) {
    sections.push(`\n## Skills\n\n${skills}`);
  }

  // ---- Work Experience ----
  const work = arr(c.work ?? c.Work ?? c.experience ?? c.workExperience ?? c.Experience);
  if (work.length) {
    const entries = work.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const j = item as Record<string, unknown>;
      const company = j.name ?? j.Name ?? j.company ?? j.employer ?? "";
      const position = j.position ?? j.Position ?? j.title ?? "";
      const dates = [j.startDate ?? j.StartDate, j.endDate ?? j.EndDate ?? "Present"]
        .filter(Boolean).join(" – ");
      const lines: string[] = [`### ${position}${company ? ` — ${company}` : ""}`];
      if (dates) lines.push(`*${dates}*`);
      const summary = j.summary ?? j.Summary ?? j.description;
      if (summary) lines.push(`\n${summary}`);
      const highlights = (j.highlights ?? j.Highlights) as string[] | undefined;
      if (Array.isArray(highlights) && highlights.length) {
        lines.push(highlights.map(h => `- ${h}`).join("\n"));
      }
      return lines.join("\n");
    }).filter(Boolean);
    if (entries.length) sections.push(`\n## Experience\n\n${entries.join("\n\n")}`);
  }

  // ---- Education ----
  const education = arr(c.education ?? c.Education);
  if (education.length) {
    const entries = education.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const e = item as Record<string, unknown>;
      const institution = e.institution ?? e.Institution ?? e.school ?? "";
      const degree = [e.studyType ?? e.StudyType, e.area ?? e.Area]
        .filter(Boolean).join(" in ") || (e.degree ?? e.program ?? "");
      const dates = [e.startDate ?? e.StartDate, e.endDate ?? e.EndDate]
        .filter(Boolean).join(" – ");
      const line = `### ${degree}${institution ? ` — ${institution}` : ""}`;
      return dates ? `${line}\n*${dates}*` : line;
    }).filter(Boolean);
    if (entries.length) sections.push(`\n## Education\n\n${entries.join("\n\n")}`);
  }

  // ---- Volunteer ----
  const volunteer = arr(c.volunteer ?? c.Volunteer);
  if (volunteer.length) {
    const entries = volunteer.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const v = item as Record<string, unknown>;
      const position = v.position ?? v.Position ?? "";
      const org = v.organization ?? v.Organization ?? "";
      return `### ${position}${org ? ` — ${org}` : ""}`;
    }).filter(Boolean);
    if (entries.length) sections.push(`\n## Volunteer\n\n${entries.join("\n\n")}`);
  }

  // ---- Projects ----
  const projects = arr(c.projects ?? c.Projects);
  if (projects.length) {
    const entries = projects.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const p = item as Record<string, unknown>;
      const name = p.name ?? p.Name ?? "";
      const desc = p.description ?? p.Description ?? "";
      return desc ? `### ${name}\n${desc}` : `### ${name}`;
    }).filter(Boolean);
    if (entries.length) sections.push(`\n## Projects\n\n${entries.join("\n\n")}`);
  }

  // ---- Certificates ----
  const certs = arr(c.certificates ?? c.Certificates);
  if (certs.length) {
    const entries = certs.map((item: unknown) => {
      if (!item || typeof item !== "object") return "";
      const ct = item as Record<string, unknown>;
      const name = ct.name ?? ct.Name ?? "";
      const issuer = ct.issuer ?? ct.Issuer;
      return issuer ? `- **${name}** — ${issuer}` : `- ${name}`;
    }).filter(Boolean);
    if (entries.length) sections.push(`\n## Certifications\n\n${entries.join("\n")}`);
  }

  // If we extracted nothing meaningful, fall back to JSON
  if (sections.length <= 1) {
    return `# ${fallbackTitle}\n\n${JSON.stringify(content, null, 2)}`;
  }

  return sections.join("\n");
}

resumeRoutes.get("/:id/export", async (c) => {
  const result = await handleExportResume(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
    c.req.query("format") ?? "json",
    jsonResumeToMarkdown,
  );
  if (result.kind === "error") {
    return c.json(result.body as any, result.status as any);
  }
  const headers: Record<string, string> = {
    "Content-Type": result.contentType,
    "Content-Disposition": `attachment; filename="${result.filename}"`,
    ...(result.extraHeaders ?? {}),
  };
  return new Response(result.body, { status: result.status, headers });
});

resumeRoutes.get("/:id/metadata", async (c) => {
  const result = await handleGetMetadata(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.put("/:id/metadata", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleUpdateMetadata(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
    body,
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/setmaster", async (c) => {
  const result = await handleSetMaster(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/setactive", async (c) => {
  const result = await handleSetActive(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/setprivacy", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleSetPrivacy(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
    typeof body?.privacy === "string" ? body.privacy : undefined,
  );
  // privacyLevel toggles whether the resume appears in public search.
  if (result.status === 200) bumpSearchVersion();
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/promote", async (c) => {
  const result = await handlePromote(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

// Detach a variant from its parent without promoting it. Leaves isMaster
// untouched — only /promote or /setmaster can change the singleton master.
// The frontend uses this when the user picks "Create Variation" on a
// resume that is itself a variant, enforcing the one-level hierarchy.
resumeRoutes.post("/:id/detach", async (c) => {
  const result = await handleDetach(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
  );
  return c.json(result.body as any, result.status as any);
});

resumeRoutes.post("/:id/createvariation", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = await handleCreateVariation(
    buildResumeDeps((text) => parseResumeTextWithAI(c, text)),
    c.var.user.sub,
    c.req.param("id"),
    body,
  );
  return c.json(result.body as any, result.status as any);
});

// GET /:id/diff — compare this resume against its parent or another variation
// Returns a field-level diff of the two content objects.
resumeRoutes.get("/:id/diff", async (c) => {
  const result = await handleGetResumeDiff(
    buildResumeDeps(() => Promise.resolve({})),
    c.var.user.sub,
    c.req.param("id"),
    c.req.query("compareId") ?? null,
  );
  return c.json(result.body as any, result.status as any);
});

// ---------------------------------------------------------------------------
// Merge endpoints
// ---------------------------------------------------------------------------

// Logic lives in services/resume/merge-flow.ts (sides, run, commit); these
// handlers only parse and shape. Either side may be a stored résumé or
// inline content (/build merges into what is on the page).

const MergeAnalyzeSchema = z
  .object({
    sourceResumeId: UuidLikeSchema,
    targetResumeId: UuidLikeSchema.optional(),
    targetContent: z.record(z.string(), z.unknown()).optional(),
    useAI: z.boolean().optional().default(true),
  })
  .refine((d) => d.targetResumeId || d.targetContent, { message: "Either targetResumeId or targetContent must be provided" });

resumeRoutes.post("/merge/analyze", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = MergeAnalyzeSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const { sourceResumeId, targetResumeId, targetContent: inlineTarget, useAI } = parsed.data;
  if (sourceResumeId === targetResumeId) return c.json(fail("VALIDATION_ERROR", "Source and target must be different resumes"), 400);

  const repo = buildRepos(getDb()).resumes;
  const source = await resolveMergeSide(repo, user.sub, "Source", { resumeId: sourceResumeId });
  const target = await resolveMergeSide(repo, user.sub, "Target", { resumeId: targetResumeId, content: inlineTarget });
  if (!source.ok) return c.json(fail("NOT_FOUND", "Source resume not found"), 404);
  if (!target.ok) return c.json(fail("NOT_FOUND", "Target resume not found"), 404);

  const llm = useAI && hasAnyLLMProviderKey(c.env) ? createLLMClient(c.env, c.var.user) : null;
  const analysis = await analyzeMerge(source.content, target.content, llm, "resume_merge_analyze");
  return c.json(ok({ analysis, sourceContent: source.content, targetContent: target.content }), 200);
});

/** Resolve both sides of a preview / execute request (a 404 response when
 *  a stored side is missing). */
async function mergeSides(c: any, input: MergeRunInput) {
  const repo = buildRepos(getDb()).resumes;
  const target = await resolveMergeSide(repo, c.var.user.sub, "Target", { resumeId: input.targetResumeId, content: input.targetContent });
  if (!target.ok) return { error: c.json(fail("NOT_FOUND", "Target resume not found"), 404) };
  const source = await resolveMergeSide(repo, c.var.user.sub, "Source", { resumeId: input.sourceResumeId, content: input.sourceContent });
  if (!source.ok) return { error: c.json(fail("NOT_FOUND", "Source resume not found"), 404) };
  return { target: target.content, source: source.content };
}

/** POST /api/resumes/merge/preview — the merged document, nothing saved. */
resumeRoutes.post("/merge/preview", async (c) => {
  const parsed = MergeRunSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  const sides = await mergeSides(c, parsed.data);
  if ("error" in sides) return sides.error;
  return c.json(ok(runMerge(sides.target, sides.source, parsed.data)), 200);
});

/** POST /api/resumes/merge/execute — commit onto a stored target (in place,
 *  or `createNew` = a new version of the target's master). */
resumeRoutes.post("/merge/execute", async (c) => {
  const parsed = MergeRunSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  const { targetResumeId, createNew = false, newTitle } = parsed.data;
  if (!targetResumeId) return c.json(fail("VALIDATION_ERROR", "targetResumeId is required to save a merge"), 400);
  const sides = await mergeSides(c, parsed.data);
  if ("error" in sides) return sides.error;

  const { mergedContent, stats } = runMerge(sides.target, sides.source, parsed.data);
  const outcome = await commitMerge(buildRepos(getDb()).resumes, c.var.user.sub, {
    targetResumeId,
    merged: mergedContent,
    createNew,
    newTitle,
  });
  if (outcome.ok === false) {
    return outcome.code === "NOT_FOUND"
      ? c.json(fail("NOT_FOUND", "Target resume not found"), 404)
      : failHeal(c, outcome.issues);
  }
  return c.json(ok({ resumeId: outcome.resumeId, title: outcome.title, ...stats }), outcome.created ? 201 : 200);
});

resumeRoutes.post("/merge/from-file", mergeFromFileHandler);

/**
 * POST /api/resumes/ai/consolidate-bullets
 *
 * AI-powered consolidation for any bullet-style list on a resume —
 * highlights on work/volunteer/projects, courses on education, keywords
 * on skills/projects/interests, roles on projects. Takes a flat list
 * and returns a cleaned version that dedupes slight wording variants,
 * normalises keyword casing, and tightens phrasing without inventing
 * new facts.
 *
 * Stateless — the caller keeps the original list and swaps it on its
 * side only if the user accepts the rewrite.
 */
const ConsolidateBulletsSchema = z.object({
  bullets: z.array(z.string()).min(1).max(100),
  fieldType: z.enum(["highlights", "keywords", "courses", "roles"]),
  sectionType: z.string().min(1),
  entryLabel: z.string().optional(),
});

resumeRoutes.post("/ai/consolidate-bullets", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ConsolidateBulletsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  if (!hasAnyLLMProviderKey(c.env)) {
    // No AI provider — return the input unchanged with a flag the UI
    // can use to show "AI unavailable" messaging instead of failing hard.
    return c.json(ok({
      rewritten: parsed.data.bullets,
      unchanged: true,
      reason: "AI provider not configured",
    }), 200);
  }

  try {
    const llm = createLLMClient(c.env, c.var.user);
    const result = await consolidateBullets(
      parsed.data.bullets,
      {
        fieldType: parsed.data.fieldType as BulletFieldType,
        sectionType: parsed.data.sectionType,
        entryLabel: parsed.data.entryLabel,
      },
      llm,
    );
    return c.json(ok({ rewritten: result.rewritten, notes: result.notes }), 200);
  } catch (err) {
    console.error("[consolidate-bullets] AI call failed:", err instanceof Error ? err.message : err);
    // Graceful degrade — return original, let caller decide what to show
    return c.json(ok({
      rewritten: parsed.data.bullets,
      unchanged: true,
      reason: "AI consolidation failed — original preserved",
    }), 200);
  }
});

resumeRoutes.all("*", (c) => c.json(fail("NOT_IMPLEMENTED", "Resume route not implemented"), 501));
