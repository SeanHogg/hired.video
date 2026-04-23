/**
 * Pure resume handlers — extracted from routes/resumes.ts so the Hono
 * layer is a thin adapter and every business rule can be exercised with
 * mocked dependencies.
 *
 * Layering:
 *   • Routes (routes/resumes.ts)                — parse request, call handler, return response.
 *   • Handlers (this file)                       — business rules, coord + orchestration.
 *   • Services (services/resume-*-service.ts)    — content heal+validate, view extras, diff.
 *   • Repository (repositories/resumeRepository) — THE only Drizzle caller for resume tables.
 *
 * No handler in this file imports `schema.resumeInformation` / `.watchedResumes`
 * / `.resumeViews` or touches Drizzle. Every read/write goes through
 * `deps.repo` (ResumeRepository); every write of `content` is first run
 * through `healAndValidateContent` from the content service.
 */

import {
  CreateResumeSchema,
  UpdateResumeSchema,
} from "../../../../shared/resume.js";
import { computeDiffPercent } from "../../utils/resume-diff.js";
import type { IResumeRepository } from "../../repositories/index.js";
import {
  healAndValidateContent,
  preserveMetaData,
} from "../../services/resume/content.js";
import {
  computeViewerExtras,
  computeViewerExtrasBatch,
  recordResumeView as recordResumeViewService,
} from "../../services/resume/view.js";

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/** AI-backed resume parser. Pure wrapper so tests can return deterministic
 *  content without firing LLM calls. */
export interface ResumeParserPort {
  parseRawText(text: string): Promise<Record<string, unknown>>;
  tryParseJsonResume(text: string): Record<string, unknown> | null;
  normalizeJsonResume(content: unknown): Record<string, unknown>;
}

/** Diff recomputation port — the live implementation walks the parent/
 *  child relationship via the repository; tests inject a stub that
 *  records which resume ids were recomputed. */
export interface DiffRecomputePort {
  refresh(repo: IResumeRepository, userId: string, resumeId: string): Promise<void>;
}

export interface ResumeDeps {
  /** The ONLY data-access point for resume tables. Do not add a `db`
   *  field here — layering rule forbids handlers from touching Drizzle
   *  directly. If a new query is needed, add a method to the repo. */
  repo: IResumeRepository;
  parser: ResumeParserPort;
  diff: DiffRecomputePort;
  now: () => Date;
}

/** Per-request context the route strips out of Hono's c. */
export interface ResumeRequestContext {
  viewerId: string | null;
  ipHash: string | null;
  referrer: string | null;
  userAgent: string | null;
}

// Result envelope + auth guard live in the shared handler module.
import { ok, fail, requireAuth, type HandlerResult } from "../../handlers/shared.js";
export { ok, fail };
export type { HandlerResult };

// Pure serializers + constants live in the serializer module. DB calls
// have been extracted to services/repositories and are never imported
// here again — the serializer is pure as of this refactor.
import {
  UUID_RE,
  PRIVACY_TO_LEVEL,
  EMPTY_VIEWER_EXTRAS,
  rowToResume,
  rowToResumeSummary,
} from "../../handlers/resume-serializer.js";

/** Re-shape the per-request context into the viewer object the view
 *  service expects. Kept local so the service layer stays ignorant of
 *  Hono's request-context type. */
async function recordResumeView(
  deps: ResumeDeps,
  resumeId: string,
  ownerId: string,
  ctx: ResumeRequestContext,
): Promise<void> {
  await recordResumeViewService(deps.repo, resumeId, ownerId, {
    userId: ctx.viewerId,
    ipHash: ctx.ipHash,
    referrer: ctx.referrer,
    userAgent: ctx.userAgent,
  });
}

/** Translate a `HealResult` into the `VALIDATION_ERROR` envelope. Shared
 *  by every handler that persists `content` — keeps the error body
 *  consistent across create/update/clone/variation/save. */
function failHealIssues(issues: Array<{ path: string; message: string }>): HandlerResult {
  return fail(400, "VALIDATION_ERROR", "Invalid resume content", { issues });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleGetResume — GET /api/resumes/:id
// ═══════════════════════════════════════════════════════════════════════════

export async function handleGetResume(
  deps: ResumeDeps,
  ctx: ResumeRequestContext,
  id: string,
  opts: { recordView?: boolean } = {},
): Promise<HandlerResult> {
  const row = UUID_RE.test(id)
    ? await deps.repo.findById(id)
    : await deps.repo.findByIdOrSlug(id);
  if (!row) return fail(404, "NOT_FOUND", "Resume not found");

  const isOwner = !!ctx.viewerId && row.userId === ctx.viewerId;
  const isPublic = row.privacyLevel === 0;
  if (!isOwner && !isPublic) {
    return fail(404, "RESUME_PRIVATE", "This resume is private. Ask the owner to share it with you.");
  }

  // Embedded views skip the view recording — if a resume is embedded on
  // a page every pageload would inflate analytics. Owners also never
  // count (handled inside recordResumeView).
  if (opts.recordView !== false) {
    await recordResumeView(deps, row.id, row.userId, ctx);
  }
  const extras = await computeViewerExtras(deps.repo, row, ctx.viewerId);
  return ok(rowToResume(row, extras));
}

// ═══════════════════════════════════════════════════════════════════════════
// handleUpdateResume — PUT /api/resumes/:id
//   • content goes through healAndValidateContent (the write guard).
//   • content.metaData is preserved when caller omits it.
//   • parentId:null clears the stored diff.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleUpdateResume(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  body: unknown,
): Promise<HandlerResult> {
  const parsed = UpdateResumeSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  // Global slug uniqueness check — public slug URLs resolve via
  // /api/resumes/public/:slug with .limit(1), so a collision between two
  // users silently points one public link at the other's resume.
  let slugUpdate: { slug: string | null } | undefined;
  if (parsed.data.slug !== undefined) {
    const slug = parsed.data.slug;
    if (slug !== null) {
      const taken = await deps.repo.findBySlug(slug, id);
      if (taken) {
        return fail(
          409,
          "SLUG_TAKEN",
          `The slug "${slug}" is already in use. Please choose a different slug.`,
        );
      }
    }
    slugUpdate = { slug };
  }

  // Fetch current row so we can preserve metaData across content updates.
  const existing = await deps.repo.findByIdForOwner(id, ownerId);
  const existingMetaData = (existing?.content as Record<string, unknown> | null)?.metaData;

  const { privacy, slug: _slugBody, content: contentBody, ...dbFields } = parsed.data;
  void _slugBody;
  const patch: Record<string, unknown> = {
    ...dbFields,
    ...(slugUpdate ?? {}),
  };

  if (contentBody !== undefined) {
    const merged = preserveMetaData(contentBody, existingMetaData);
    const healResult = healAndValidateContent(merged);
    if (!healResult.ok) return failHealIssues(healResult.issues);
    patch.content = healResult.content as Record<string, unknown>;
  }
  if (privacy !== undefined) {
    patch.privacyLevel = PRIVACY_TO_LEVEL[privacy] ?? 10;
  }
  if (dbFields.parentId === null) {
    patch.diffPercent = null;
  }

  const updated = await deps.repo.updateByIdForOwner(id, ownerId, patch as any);
  if (!updated) return fail(404, "NOT_FOUND", "Resume not found");

  if (patch.content !== undefined) {
    await deps.diff.refresh(deps.repo, ownerId, updated.id);
  }
  return ok(rowToResume(updated, { isOwner: true, isWatched: false, viewCount: 0 }));
}

// ═══════════════════════════════════════════════════════════════════════════
// handleCreateResume — POST /api/resumes
//   • First upload on the account auto-promotes to master+active.
//   • rawText triggers JSON-Resume parse then AI parse fallback.
//   • Content goes through healAndValidateContent before insert.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCreateResume(
  deps: ResumeDeps,
  ownerId: string,
  body: unknown,
): Promise<HandlerResult> {
  const parsed = CreateResumeSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid request body", {
      issues: parsed.error.flatten(),
    });
  }

  let content: unknown = parsed.data.content ?? {};
  if (parsed.data.rawText) {
    const structured = deps.parser.tryParseJsonResume(parsed.data.rawText);
    content = structured ?? (await deps.parser.parseRawText(parsed.data.rawText));
  }

  const healResult = healAndValidateContent(content);
  if (!healResult.ok) return failHealIssues(healResult.issues);

  const privacyLevel = PRIVACY_TO_LEVEL[parsed.data.privacy ?? "private"] ?? 10;

  // First-resume auto-promotion — new users shouldn't have to click "Set
  // Master" / "Set Active" before their first upload is usable.
  const existingCount = await deps.repo.countByOwner(ownerId);
  const isFirst = existingCount === 0;
  const isMaster = (parsed.data.isMaster ?? false) || isFirst;

  const created = await deps.repo.insertOne({
    userId: ownerId,
    title: parsed.data.title,
    content: healResult.content as Record<string, unknown>,
    status: parsed.data.status,
    isMaster,
    isActive: isFirst,
    privacyLevel,
  } as any);

  return ok(
    rowToResume(created, { isOwner: true, isWatched: false, viewCount: 0 }),
    201,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// handleDeleteResume — DELETE /api/resumes/:id
//   • Master deletion unparents its variants.
//   • Repo enforces the (id, userId) scope on the delete itself.
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDeleteResume(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  const existing = await deps.repo.findByIdForOwner(id, ownerId);
  if (!existing) return fail(404, "NOT_FOUND", "Resume not found");

  if (existing.isMaster) {
    await deps.repo.clearParentIdForChildren(id, ownerId);
  }

  await deps.repo.deleteByIdForOwner(id, ownerId);
  return ok(undefined);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleWatchResume / handleUnwatchResume
// ═══════════════════════════════════════════════════════════════════════════

export async function handleWatchResume(
  deps: ResumeDeps,
  viewerId: string,
  resumeId: string,
): Promise<HandlerResult> {
  await deps.repo.addWatchIfMissing(viewerId, resumeId);
  return ok({ success: true });
}

export async function handleUnwatchResume(
  deps: ResumeDeps,
  viewerId: string,
  resumeId: string,
): Promise<HandlerResult> {
  await deps.repo.removeWatch(viewerId, resumeId);
  return ok({ success: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleSentimentPrediction — POST /api/resumes/sentimentprediction
// ═══════════════════════════════════════════════════════════════════════════

function scoreSentiment(text: string): number {
  return text.length > 300 ? 78 : text.length > 80 ? 64 : 52;
}

export async function handleSentimentPrediction(
  deps: ResumeDeps,
  ownerId: string,
  body: unknown,
): Promise<HandlerResult> {
  const resumeId = typeof body === "object" && body !== null ? (body as any).resumeId : undefined;
  const text = typeof body === "string"
    ? body
    : typeof (body as any)?.text === "string"
      ? (body as any).text
      : JSON.stringify(body ?? "");

  const score = scoreSentiment(text);

  if (typeof resumeId === "string" && resumeId.length > 0) {
    try {
      await deps.repo.updateSentimentScoreForOwner(resumeId, ownerId, Math.round(score));
    } catch (err) {
      console.warn(
        "[sentimentprediction] persist failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return ok({ score });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleListResumes — GET /api/resumes
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListResumes(
  deps: ResumeDeps,
  ownerId: string,
): Promise<HandlerResult> {
  const rows = await deps.repo.findAllForOwner(ownerId);
  if (rows.length === 0) return ok([]);

  const extrasMap = await computeViewerExtrasBatch(deps.repo, rows, ownerId);
  const serialized = rows.map((r) =>
    rowToResume(r, extrasMap.get(r.id) ?? { ...EMPTY_VIEWER_EXTRAS, isOwner: true }),
  );
  return ok(serialized);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleListOwnedResumes — GET /api/resumes/getresumesownedbyauthuser,
//                          GET /api/resumes/withownership
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListOwnedResumes(
  deps: ResumeDeps,
  ownerId: string,
  opts: { includeOwnership?: boolean } = {},
): Promise<HandlerResult> {
  const rows = await deps.repo.findAllForOwner(ownerId);
  const extrasMap = await computeViewerExtrasBatch(deps.repo, rows, ownerId);
  const summaries = rows.map((r) => {
    const summary = rowToResumeSummary(r, extrasMap.get(r.id) ?? EMPTY_VIEWER_EXTRAS);
    return opts.includeOwnership ? { ...summary, ownership: "owned" as const } : summary;
  });
  return ok(summaries);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleListPublicResumes — GET /api/resumes/public
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListPublicResumes(
  deps: ResumeDeps,
  viewerId: string | null,
  opts: { page?: number; limit?: number } = {},
): Promise<HandlerResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const rows = await deps.repo.findPublicPaginated({ page, limit });

  const items = rows.map((row) =>
    rowToResumeSummary(row, {
      ...EMPTY_VIEWER_EXTRAS,
      isOwner: Boolean(viewerId && row.userId === viewerId),
    }),
  );

  return ok({
    items,
    total: items.length,
    page,
    limit,
    hasNext: items.length === limit,
    hasPrev: page > 1,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleListMasterGroups — GET /api/resumes/mastergroups
// ═══════════════════════════════════════════════════════════════════════════

export async function handleListMasterGroups(
  deps: ResumeDeps,
  ownerId: string,
): Promise<HandlerResult> {
  const all = await deps.repo.findAllForOwner(ownerId);
  const extrasMap = await computeViewerExtrasBatch(deps.repo, all, ownerId);
  const toResume = (r: typeof all[number]) =>
    rowToResume(r, extrasMap.get(r.id) ?? EMPTY_VIEWER_EXTRAS);

  const masters = all.filter((r) => r.isMaster && !r.parentId);
  const variations = all.filter((r) => !!r.parentId);
  const ungrouped = all.filter((r) => !r.isMaster && !r.parentId);

  const masterGroups = [
    ...masters.map((m) => ({
      masterResume: toResume(m),
      variations: variations.filter((v) => v.parentId === m.id).map(toResume),
    })),
    ...ungrouped.map((r) => ({ masterResume: toResume(r), variations: [] })),
  ];

  return ok(masterGroups);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleValidateSlug — GET /api/resumes/validateslug
// ═══════════════════════════════════════════════════════════════════════════

export async function handleValidateSlug(
  deps: ResumeDeps,
  ownerId: string,
  opts: { slug: string; resumeId?: string | null },
): Promise<HandlerResult> {
  void ownerId; // slug uniqueness is global; ownerId retained for API shape compat
  const slug = opts.slug ?? "";
  if (!slug) return ok({ slug, available: false });

  const existing = await deps.repo.findBySlug(slug, opts.resumeId ?? undefined);
  return ok({ slug, available: !existing });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleSaveResume — POST /api/resumes/save
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSaveResume(
  deps: ResumeDeps,
  ownerId: string,
  content: Record<string, unknown>,
): Promise<HandlerResult> {
  const healResult = healAndValidateContent(content);
  if (!healResult.ok) return failHealIssues(healResult.issues);

  // Title fallback order (same as before): top-level `content.title`
  // → top-level `content.name` (older hired.video) → `basics.name` →
  // "Untitled Resume". Computed off the raw input, not the healed
  // content, because heal drops `name` (promoted to `title`).
  const basics = (content as any)?.basics as Record<string, unknown> | undefined;
  const inferred =
    (typeof (content as any)?.title === "string" && (content as any).title.trim()) ||
    (typeof (content as any)?.name === "string" && (content as any).name.trim()) ||
    (typeof basics?.name === "string" && basics.name.trim()) ||
    null;
  const title = inferred || "Untitled Resume";

  const created = await deps.repo.insertOne({
    userId: ownerId,
    title,
    content: healResult.content as Record<string, unknown>,
    status: "draft",
  } as any);

  return ok(rowToResume(created, EMPTY_VIEWER_EXTRAS), 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleCloneResume — POST /api/resumes/:id/clone
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCloneResume(
  deps: ResumeDeps,
  ownerId: string,
  sourceId: string,
): Promise<HandlerResult> {
  const original = await deps.repo.findByIdForOwner(sourceId, ownerId);
  if (!original) return fail(404, "NOT_FOUND", "Resume not found");

  // Heal even on clone — source rows can be legacy, and we want every
  // new row to be canonical by construction.
  const healResult = healAndValidateContent(original.content ?? {});
  if (!healResult.ok) return failHealIssues(healResult.issues);

  const cloned = await deps.repo.insertOne({
    userId: ownerId,
    title: `${original.title} (copy)`,
    content: healResult.content as Record<string, unknown>,
    status: "draft",
  } as any);

  return ok(rowToResume(cloned, EMPTY_VIEWER_EXTRAS), 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// handlePublishResume — POST /api/resumes/:id/publish
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePublishResume(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  const updated = await deps.repo.updateByIdForOwner(id, ownerId, {
    status: "published",
  });
  if (!updated) return fail(404, "NOT_FOUND", "Resume not found");
  return ok(rowToResume(updated, EMPTY_VIEWER_EXTRAS));
}

// ═══════════════════════════════════════════════════════════════════════════
// handleSetMaster / handleSetActive — one-per-user flags.
// ═══════════════════════════════════════════════════════════════════════════

async function flipSingletonFlag(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  field: "isMaster" | "isActive",
): Promise<HandlerResult> {
  const found = await deps.repo.findByIdForOwner(id, ownerId);
  if (!found) return fail(404, "NOT_FOUND", "Resume not found");

  await deps.repo.clearSingletonFlagForOwner(ownerId, field);
  await deps.repo.updateByIdForOwner(id, ownerId, { [field]: true } as any);

  return ok(true);
}

export function handleSetMaster(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  return flipSingletonFlag(deps, ownerId, id, "isMaster");
}

export function handleSetActive(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  return flipSingletonFlag(deps, ownerId, id, "isActive");
}

// ═══════════════════════════════════════════════════════════════════════════
// handleSetPrivacy — POST /api/resumes/:id/setprivacy
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSetPrivacy(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  privacy: string | undefined,
): Promise<HandlerResult> {
  const privacyLevel = privacy && PRIVACY_TO_LEVEL[privacy] !== undefined
    ? PRIVACY_TO_LEVEL[privacy]
    : 10;
  const updated = await deps.repo.updateByIdForOwner(id, ownerId, { privacyLevel });
  if (!updated) return fail(404, "NOT_FOUND", "Resume not found");
  return ok(true);
}

// ═══════════════════════════════════════════════════════════════════════════
// handlePromote — POST /api/resumes/:id/promote
// ═══════════════════════════════════════════════════════════════════════════

export async function handlePromote(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  const found = await deps.repo.findByIdForOwner(id, ownerId);
  if (!found) return fail(404, "NOT_FOUND", "Resume not found");

  await deps.repo.clearSingletonFlagForOwner(ownerId, "isMaster");
  await deps.repo.updateByIdForOwner(id, ownerId, { isMaster: true, parentId: null });

  return ok(true);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleDetach — POST /api/resumes/:id/detach
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDetach(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  const updated = await deps.repo.updateByIdForOwner(id, ownerId, {
    parentId: null,
    diffPercent: null,
  });
  if (!updated) return fail(404, "NOT_FOUND", "Resume not found");
  return ok(true);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleCreateVariation — POST /api/resumes/:id/createvariation
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCreateVariation(
  deps: ResumeDeps,
  ownerId: string,
  sourceId: string,
  body:
    | {
        title?: string;
        name?: string;
        description?: string;
        resumeData?: string;
      }
    | null,
): Promise<HandlerResult> {
  const parent = await deps.repo.findByIdForOwner(sourceId, ownerId);
  if (!parent) return fail(404, "NOT_FOUND", "Resume not found");

  const baseContent: Record<string, unknown> =
    parent.content && typeof parent.content === "object"
      ? { ...(parent.content as Record<string, unknown>) }
      : {};

  const markdown = typeof body?.resumeData === "string" ? body.resumeData.trim() : "";
  if (markdown) {
    baseContent.markdown = markdown;
    try {
      const parsed = await deps.parser.parseRawText(markdown);
      if (parsed && typeof parsed === "object") {
        const carryKeys = [
          "basics", "work", "education", "skills", "volunteer", "awards",
          "certificates", "publications", "languages", "interests",
          "references", "projects",
        ];
        for (const key of carryKeys) {
          if ((parsed as any)[key] !== undefined) {
            baseContent[key] = (parsed as any)[key];
          }
        }
      }
    } catch (err) {
      console.warn(
        "[createvariation] AI parse failed; keeping parent JSON:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (typeof body?.description === "string") {
    baseContent.variationDescription = body.description;
  }

  // Heal the merged blob — AI parse output is a prime source of nulls.
  const healResult = healAndValidateContent(baseContent);
  if (!healResult.ok) return failHealIssues(healResult.issues);

  // Enforce one-level hierarchy — detach the source if it's itself a variant.
  if (parent.parentId) {
    await deps.repo.updateByIdForOwner(parent.id, ownerId, {
      parentId: null,
      diffPercent: null,
    });
  }

  const variantTitle =
    (typeof body?.title === "string" && body.title.trim()) ||
    (typeof body?.name === "string" && body.name.trim()) ||
    null;

  const created = await deps.repo.insertOne({
    userId: ownerId,
    title: variantTitle ?? `${parent.title} Variation`,
    content: healResult.content as Record<string, unknown>,
    status: "draft",
    parentId: parent.id,
    isMaster: false,
    isActive: false,
    privacyLevel: 10,
    diffPercent: computeDiffPercent(
      parent.content as Record<string, unknown>,
      healResult.content as unknown as Record<string, unknown>,
    ),
  } as any);

  return ok(rowToResume(created, { isOwner: true, isWatched: false, viewCount: 0 }), 201);
}

// ═══════════════════════════════════════════════════════════════════════════
// handleGetMetadata / handleUpdateMetadata — GET/PUT /api/resumes/:id/metadata
// ═══════════════════════════════════════════════════════════════════════════

export async function handleGetMetadata(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
): Promise<HandlerResult> {
  const row = await deps.repo.findByIdForOwner(id, ownerId);
  if (!row) return fail(404, "NOT_FOUND", "Resume not found");

  const content = (row.content ?? {}) as Record<string, unknown>;
  return ok(Array.isArray(content.metaData) ? content.metaData : []);
}

export async function handleUpdateMetadata(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  body: unknown,
): Promise<HandlerResult> {
  const metaData = Array.isArray(body) ? body : [];

  const row = await deps.repo.findByIdForOwner(id, ownerId);
  if (!row) return fail(404, "NOT_FOUND", "Resume not found");

  const merged: Record<string, unknown> =
    row.content && typeof row.content === "object"
      ? { ...(row.content as Record<string, unknown>) }
      : {};
  merged.metaData = metaData;

  // Still goes through heal — metaData is only one field; we want the
  // whole blob canonical on the way out.
  const healResult = healAndValidateContent(merged);
  if (!healResult.ok) return failHealIssues(healResult.issues);

  const updated = await deps.repo.updateByIdForOwner(id, ownerId, {
    content: healResult.content as Record<string, unknown>,
  });
  if (!updated) return fail(404, "NOT_FOUND", "Resume not found");

  return ok(rowToResume(updated, { isOwner: true, isWatched: false, viewCount: 0 }));
}

// ═══════════════════════════════════════════════════════════════════════════
// handleGetResumeDiff — GET /api/resumes/:id/diff?compareId=…
// ═══════════════════════════════════════════════════════════════════════════

export async function handleGetResumeDiff(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  compareIdParam: string | null,
): Promise<HandlerResult> {
  const resume = await deps.repo.findByIdForOwner(id, ownerId);
  if (!resume) return fail(404, "NOT_FOUND", "Resume not found");

  const compareId = compareIdParam ?? resume.parentId ?? null;
  if (!compareId) {
    return ok({ message: "No parent or compareId to diff against", changes: [] });
  }

  const other = await deps.repo.findByIdForOwner(compareId, ownerId);
  if (!other) return fail(404, "NOT_FOUND", "Comparison resume not found");

  const aContent = (resume.content ?? {}) as Record<string, unknown>;
  const bContent = (other.content ?? {}) as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(aContent), ...Object.keys(bContent)]);

  const changes: Array<{
    field: string;
    type: "added" | "removed" | "changed";
    before: unknown;
    after: unknown;
  }> = [];
  for (const key of allKeys) {
    const before = bContent[key];
    const after = aContent[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (before === undefined) changes.push({ field: key, type: "added", before: null, after });
    else if (after === undefined) changes.push({ field: key, type: "removed", before, after: null });
    else changes.push({ field: key, type: "changed", before, after });
  }

  return ok({
    resumeId: resume.id,
    compareId: other.id,
    resumeTitle: resume.title,
    compareTitle: other.title,
    changes,
    summary: {
      total: changes.length,
      added: changes.filter((c) => c.type === "added").length,
      removed: changes.filter((c) => c.type === "removed").length,
      changed: changes.filter((c) => c.type === "changed").length,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// handleExportResume — GET /api/resumes/:id/export?format=…
// ═══════════════════════════════════════════════════════════════════════════

export type ExportResult =
  | { kind: "error"; status: number; body: unknown }
  | {
      kind: "download";
      status: number;
      body: string;
      contentType: string;
      filename: string;
      extraHeaders?: Record<string, string>;
    };

export async function handleExportResume(
  deps: ResumeDeps,
  ownerId: string,
  id: string,
  format: string,
  jsonResumeToMarkdown: (content: Record<string, unknown> | null, fallbackTitle: string) => string,
): Promise<ExportResult> {
  const row = await deps.repo.findByIdForOwner(id, ownerId);
  if (!row) {
    return {
      kind: "error",
      status: 404,
      body: (fail(404, "NOT_FOUND", "Resume not found") as any).body,
    };
  }

  const content = row.content as Record<string, unknown> | null;
  const safeName = String(row.title).replace(/[^a-z0-9]/gi, "_");

  const resolveMarkdown = () =>
    typeof content?.markdown === "string"
      ? (content.markdown as string)
      : jsonResumeToMarkdown(content, row.title);

  const fmt = (format ?? "json").toLowerCase();

  if (fmt === "md" || fmt === "markdown") {
    return {
      kind: "download",
      status: 200,
      body: resolveMarkdown(),
      contentType: "text/markdown; charset=utf-8",
      filename: `${safeName}.md`,
    };
  }

  if (fmt === "pdf" || fmt === "docx") {
    return {
      kind: "download",
      status: 200,
      body: resolveMarkdown(),
      contentType: "text/plain; charset=utf-8",
      filename: `${safeName}.txt`,
      extraHeaders: {
        "X-Export-Note":
          "PDF/DOCX rendering not yet available; content returned as plain text",
      },
    };
  }

  const payload = JSON.stringify(
    { id: row.id, title: row.title, content, exportedAt: deps.now().toISOString() },
    null,
    2,
  );
  return {
    kind: "download",
    status: 200,
    body: payload,
    contentType: "application/json",
    filename: `${safeName}.json`,
  };
}

// Intentionally re-export `requireAuth` so callers can import everything
// they need from this module. Keeps the public surface small.
export { requireAuth };
