/**
 * Résumé read use cases — GET /api/resumes (every list view), detail,
 * metadata, diff, export, slug check. Return domain data; throw DomainError.
 */
import type { Resume, ResumeContent } from "../../../../shared/resume.js";
import type { ResumeListView } from "../../../../shared/resume-create.js";
import { renderMarkdownFromJsonResume } from "../../../../shared/resume-markdown.js";
import { isUuid } from "../../../../shared/value-types.js";
import { DomainError } from "../../domains/errors.js";
import { EMPTY_VIEWER_EXTRAS, rowToResume, rowToResumeSummary } from "../../handlers/resume-serializer.js";
import { normalizeContent } from "./content.js";
import { resumeNotFound } from "./errors.js";
import type { ResumeDeps, ResumeRequestContext } from "./ports.js";
import { computeViewerExtras, computeViewerExtrasBatch, recordResumeView } from "./view.js";

type ResumeRow = Awaited<ReturnType<ResumeDeps["repo"]["findAllForOwner"]>>[number];

/** Record a view — ONE artifact_views row (kind 'resume', W3-A 0580) that
 *  backs both the résumé `viewCount` and the creator-stats dashboard (#1019).
 *  Telemetry never breaks the page load. */
async function recordView(deps: ResumeDeps, row: ResumeRow, ctx: ResumeRequestContext): Promise<void> {
  await recordResumeView(deps.repo, row.id, row.userId, {
    userId: ctx.viewerId,
    ipHash: ctx.ipHash,
    ipCountry: ctx.ipCountry,
    referrer: ctx.referrer,
    userAgent: ctx.userAgent,
  }).catch(() => undefined);
}

/** One résumé by id or slug. Owner always wins; anyone else only sees a
 *  public résumé (404 RESUME_PRIVATE tells a share-link recipient to ask). */
export async function getResume(
  deps: ResumeDeps,
  ctx: ResumeRequestContext,
  idOrSlug: string,
  opts: { recordView?: boolean } = {},
): Promise<Resume> {
  const row = isUuid(idOrSlug) ? await deps.repo.findById(idOrSlug) : await deps.repo.findByIdOrSlug(idOrSlug);
  if (!row) throw resumeNotFound();

  const isOwner = !!ctx.viewerId && row.userId === ctx.viewerId;
  if (!isOwner && row.privacyLevel !== 0) {
    throw new DomainError(404, "RESUME_PRIVATE", "This resume is private. Ask the owner to share it with you.");
  }
  // Embeds skip view recording — every page load would inflate analytics.
  if (opts.recordView !== false) await recordView(deps, row, ctx);

  const resume = rowToResume(row, await computeViewerExtras(deps.repo, row, ctx.viewerId));
  // Only anonymous viewers are log-walled, so only they need the flag.
  if (!ctx.viewerId && deps.ownerFlags) {
    resume.ownerPromoteWithoutAuth = await deps.ownerFlags.isPromotedWithoutAuth(row.userId);
  }
  return resume;
}

export interface ListOwnedOptions {
  view: ResumeListView;
  includeOwnership: boolean;
  includeArchived: boolean;
}

/** The owner's résumés in one of three shapes: full documents, summaries
 *  (optionally tagged `ownership: "owned"`), or master groups. */
export async function listOwnedResumes(deps: ResumeDeps, ownerId: string, opts: ListOwnedOptions): Promise<unknown[]> {
  const rows = await deps.repo.findAllForOwner(ownerId, { includeArchived: opts.includeArchived });
  const extras = await computeViewerExtrasBatch(deps.repo, rows, ownerId);
  const extrasFor = (r: ResumeRow) => extras.get(r.id) ?? EMPTY_VIEWER_EXTRAS;

  if (opts.view === "groups") return masterGroups(rows, (r) => rowToResume(r, extrasFor(r)));
  if (opts.view === "summary" || opts.includeOwnership) {
    return rows.map((r) => {
      const summary = rowToResumeSummary(r, extrasFor(r));
      return opts.includeOwnership ? { ...summary, ownership: "owned" as const } : summary;
    });
  }
  return rows.map((r) => rowToResume(r, extrasFor(r)));
}

/** Masters with their versions, then standalone résumés as one-member groups. */
function masterGroups(rows: ResumeRow[], toResume: (r: ResumeRow) => Resume) {
  const variations = rows.filter((r) => !!r.parentId);
  return [
    ...rows
      .filter((r) => r.isMaster && !r.parentId)
      .map((m) => ({ masterResume: toResume(m), variations: variations.filter((v) => v.parentId === m.id).map(toResume) })),
    ...rows.filter((r) => !r.isMaster && !r.parentId).map((r) => ({ masterResume: toResume(r), variations: [] })),
  ];
}

/** GET /api/resumes/public — the discovery feed. */
export async function listPublicResumes(
  deps: ResumeDeps,
  viewerId: string | null,
  opts: { page?: number; limit?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const rows = await deps.repo.findPublicPaginated({ page, limit });
  const items = rows.map((row) =>
    rowToResumeSummary(row, { ...EMPTY_VIEWER_EXTRAS, isOwner: Boolean(viewerId && row.userId === viewerId) }),
  );
  return { items, total: items.length, page, limit, hasNext: items.length === limit, hasPrev: page > 1 };
}

/** Slug uniqueness is global (public URLs resolve to one row). */
export async function validateSlug(deps: ResumeDeps, slug: string, resumeId: string | null) {
  if (!slug) return { slug, available: false };
  const existing = await deps.repo.findBySlug(slug, resumeId ?? undefined);
  return { slug, available: !existing };
}

async function ownedRow(deps: ResumeDeps, ownerId: string, id: string, message?: string): Promise<ResumeRow> {
  const row = await deps.repo.findByIdForOwner(id, ownerId);
  if (!row) throw resumeNotFound(message);
  return row;
}

export async function getMetadata(deps: ResumeDeps, ownerId: string, id: string): Promise<unknown[]> {
  const content = ((await ownedRow(deps, ownerId, id)).content ?? {}) as Record<string, unknown>;
  return Array.isArray(content.metaData) ? content.metaData : [];
}

/** Field-level diff of a résumé against its parent (or `compareId`). */
export async function getResumeDiff(deps: ResumeDeps, ownerId: string, id: string, compareIdParam: string | null) {
  const resume = await ownedRow(deps, ownerId, id);
  const compareId = compareIdParam ?? resume.parentId ?? null;
  if (!compareId) return { message: "No parent or compareId to diff against", changes: [] };
  const other = await ownedRow(deps, ownerId, compareId, "Comparison resume not found");

  const a = (resume.content ?? {}) as Record<string, unknown>;
  const b = (other.content ?? {}) as Record<string, unknown>;
  const changes: Array<{ field: string; type: "added" | "removed" | "changed"; before: unknown; after: unknown }> = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const before = b[key];
    const after = a[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (before === undefined) changes.push({ field: key, type: "added", before: null, after });
    else if (after === undefined) changes.push({ field: key, type: "removed", before, after: null });
    else changes.push({ field: key, type: "changed", before, after });
  }
  const countOf = (type: string) => changes.filter((c) => c.type === type).length;
  return {
    resumeId: resume.id,
    compareId: other.id,
    resumeTitle: resume.title,
    compareTitle: other.title,
    changes,
    summary: { total: changes.length, added: countOf("added"), removed: countOf("removed"), changed: countOf("changed") },
  };
}

export interface ResumeDownload {
  body: string;
  contentType: string;
  filename: string;
  extraHeaders?: Record<string, string>;
}

/** The stored markdown when the résumé has one, else the shared renderer. */
function resumeMarkdown(content: Record<string, unknown> | null, title: string): string {
  if (typeof content?.markdown === "string") return content.markdown;
  const rendered = renderMarkdownFromJsonResume(normalizeContent(content ?? {}) as unknown as ResumeContent).trim();
  return rendered || `# ${title}\n`;
}

/** GET /api/resumes/:id/export?format=json|md|pdf|docx */
export async function exportResume(deps: ResumeDeps, ownerId: string, id: string, format: string): Promise<ResumeDownload> {
  const row = await ownedRow(deps, ownerId, id);
  const content = row.content as Record<string, unknown> | null;
  const safeName = String(row.title).replace(/[^a-z0-9]/gi, "_");
  const fmt = (format || "json").toLowerCase();

  if (fmt === "md" || fmt === "markdown") {
    return { body: resumeMarkdown(content, row.title), contentType: "text/markdown; charset=utf-8", filename: `${safeName}.md` };
  }
  if (fmt === "pdf" || fmt === "docx") {
    return {
      body: resumeMarkdown(content, row.title),
      contentType: "text/plain; charset=utf-8",
      filename: `${safeName}.txt`,
      extraHeaders: { "X-Export-Note": "PDF/DOCX rendering not yet available; content returned as plain text" },
    };
  }
  return {
    body: JSON.stringify({ id: row.id, title: row.title, content, exportedAt: deps.now().toISOString() }, null, 2),
    contentType: "application/json",
    filename: `${safeName}.json`,
  };
}
