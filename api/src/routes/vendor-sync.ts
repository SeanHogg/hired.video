/**
 * Vendor Sync routes — `/api/vendor-sync/*`
 *
 * Backend half of the master-resume ↔ third-party-profile sync flow.
 * The tool page at `/tools/vendor-sync` and the seeker Chrome extension
 * are the two front doors.
 *
 * Route map:
 *   GET    /connectors                  → registry + last-synced per vendor
 *   POST   /:connectorId/import         → HTML in → JSON Resume + MergeAnalysis out
 *   POST   /:connectorId/execute        → commit a reviewed merge into master
 *   POST   /:connectorId/blocks         → render export paste-blocks
 *   POST   /runs                        → user marks a manual sync done
 *   GET    /runs                        → audit history
 *
 * The import → execute split mirrors the existing `/api/resumes/merge/*`
 * flow so the frontend can reuse `MergeResumeDialog` unchanged. The
 * shape of `/import`'s response matches `/api/resumes/merge/from-file`'s
 * `{ parsedContent → sourceContent, targetContent, analysis }` plus a
 * `syncRunId` so the audit row can be finalized on execute.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { analyzeMerge, executeMerge, type MergeDecision } from "../services/resume/merge.js";
import { healAndValidateContent } from "../services/resume/content.js";
import { normalizeJsonResume } from "../services/resume/parse.js";
import { buildRepos } from "../repositories/index.js";
import { getConnector, listConnectors } from "../services/sync/connectors/index.js";
import { extractFromHtml, ExtractedJsonResumeSchema } from "../services/sync/extract-from-html.js";
import {
  finalizeRun,
  lastRunPerConnector,
  listRuns,
  recordExportRun,
  recordImportStart,
} from "../services/sync/sync-run-service.js";
import type { ResumeContent } from "../../../shared/resume.js";

export const vendorSyncRoutes = new Hono<AppEnv>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}
function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /connectors — registry + per-user last-synced overlay
// ---------------------------------------------------------------------------

vendorSyncRoutes.get("/connectors", async (c) => {
  // Public read: the registry itself has no user-bound data — only the
  // per-user `lastRun` overlay does. Skipping the overlay for anon
  // visitors lets /tools/vendor-sync render its real vendor catalog
  // before the seeker signs in (instead of blocking the entire surface
  // behind AuthOverlay), without changing the shape of the response.
  const user = c.var.user;
  const lastByConnector = user ? await lastRunPerConnector(user.sub) : {};

  const data = listConnectors().map((v) => ({
    id: v.id,
    label: v.label,
    iconKey: v.iconKey,
    category: v.category,
    description: v.description,
    editProfileUrl: v.editProfileUrl,
    supportsExtensionExtract: v.supportsExtensionExtract,
    supportsExtensionWrite: v.supportsExtensionWrite,
    lastRun: lastByConnector[v.id]
      ? {
          id: lastByConnector[v.id].id,
          direction: lastByConnector[v.id].direction,
          startedAt: lastByConnector[v.id].startedAt,
          completedAt: lastByConnector[v.id].completedAt,
        }
      : null,
  }));

  return c.json(ok({ connectors: data }), 200);
});

// ---------------------------------------------------------------------------
// POST /:connectorId/import — HTML → JSON Resume → MergeAnalysis
// ---------------------------------------------------------------------------

const ImportSchema = z.object({
  /** Outer HTML of the focused profile pane, captured by the extension's
   *  content script. The extractor strips and truncates internally. */
  html: z.string().min(50),
  sourceUrl: z.string().min(1),
  /** Master (or any owned) resume to merge INTO. Frontend defaults to
   *  the user's master via the resume list page. */
  targetResumeId: z.string().uuid(),
});

vendorSyncRoutes.post("/:connectorId/import", async (c) => {
  const user = c.var.user;
  const connectorId = c.req.param("connectorId");
  const connector = getConnector(connectorId);
  if (!connector) return c.json(fail("NOT_FOUND", `Unknown connector: ${connectorId}`), 404);
  if (!connector.supportsExtensionExtract) {
    return c.json(fail("NOT_SUPPORTED", `${connector.label} does not support extension-driven extraction yet`), 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const { html, sourceUrl, targetResumeId } = parsed.data;

  const repo = buildRepos(getDb()).resumes;
  const target = await repo.findByIdForOwner(targetResumeId, user.sub);
  if (!target) return c.json(fail("NOT_FOUND", "Target resume not found"), 404);

  if (!hasAnyLLMProviderKey(c.env as any)) {
    return c.json(fail("AI_UNAVAILABLE", "Vendor extraction requires an LLM provider — none configured"), 503);
  }
  const llm = createLLMClient(c.env as any, c.var.user);

  // Persist `pending` BEFORE the LLM call so a hung extract still leaves
  // a row to debug from. Finalized on /execute or on extractor failure
  // below.
  const run = await recordImportStart({
    userId: user.sub,
    connectorId,
    targetResumeId,
    sourceUrl,
  });

  let extracted;
  try {
    extracted = await extractFromHtml(llm, { html, sourceUrl, connectorId });
  } catch (err) {
    await finalizeRun({
      runId: run.id,
      userId: user.sub,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "extractor failed",
    });
    return c.json(fail("AI_ERROR", "Failed to extract profile from page HTML"), 502);
  }

  const sourceContent = normalizeJsonResume(extracted as Record<string, unknown>);
  const targetContent = normalizeJsonResume((target.content ?? {}) as Record<string, unknown>);

  const analysis = await analyzeMerge(sourceContent, targetContent, llm);

  return c.json(ok({
    syncRunId: run.id,
    sourceContent,
    targetContent,
    analysis,
  }), 200);
});

// ---------------------------------------------------------------------------
// POST /:connectorId/execute — commit reviewed merge into master
// ---------------------------------------------------------------------------

const ExecuteSchema = z.object({
  syncRunId: z.string().uuid(),
  sourceContent: z.record(z.string(), z.unknown()),
  targetResumeId: z.string().uuid(),
  decisions: z.array(z.object({
    sectionType: z.string(),
    sourceIndex: z.number(),
    targetIndex: z.number().nullable(),
    action: z.enum(["merge", "replace", "skip", "add"]),
    mergeHighlights: z.enum(["combine", "source_only", "target_only"]).optional(),
    selectedHighlights: z.array(z.string()).optional(),
    scalarChoices: z.record(z.string(), z.enum(["source", "target"])).optional(),
  })),
  basicDecisions: z.record(z.string(), z.enum(["source", "target"])).optional(),
  /** True → write a fresh resume row (e.g. user wants a vendor-sync'd
   *  variant); false → patch the master in place. Mirrors MergeResumeDialog. */
  createNew: z.boolean(),
  newTitle: z.string().optional(),
});

vendorSyncRoutes.post("/:connectorId/execute", async (c) => {
  const user = c.var.user;
  const connectorId = c.req.param("connectorId");
  const connector = getConnector(connectorId);
  if (!connector) return c.json(fail("NOT_FOUND", `Unknown connector: ${connectorId}`), 404);

  const body = await c.req.json().catch(() => null);
  const parsed = ExecuteSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const {
    syncRunId, sourceContent, targetResumeId, decisions, basicDecisions, createNew, newTitle,
  } = parsed.data;

  const repo = buildRepos(getDb()).resumes;
  const target = await repo.findByIdForOwner(targetResumeId, user.sub);
  if (!target) return c.json(fail("NOT_FOUND", "Target resume not found"), 404);

  // Merge is a pure transform; healAndValidate hardens the result before
  // it touches the DB — same pattern as /api/resumes/merge/execute.
  const mergedContent = executeMerge(
    (target.content ?? {}) as Record<string, any>,
    sourceContent as Record<string, any>,
    decisions as MergeDecision[],
    basicDecisions,
  );
  const heal = healAndValidateContent(mergedContent);
  if (!heal.ok) {
    await finalizeRun({
      runId: syncRunId,
      userId: user.sub,
      status: "failed",
      errorMessage: "Merge produced invalid content",
    });
    return c.json(fail("MERGE_INVALID", "Merged content failed validation", heal.issues), 400);
  }
  const healedContent = heal.content as Record<string, unknown>;

  const mergedCount = decisions.filter((d) => d.action === "merge" || d.action === "replace").length;
  const skippedCount = decisions.filter((d) => d.action === "skip").length;
  const newCount = decisions.filter((d) => d.action === "add").length;

  let resultResumeId: string;
  let resultTitle: string;
  if (createNew) {
    const title = newTitle || `${target.title} (synced from ${connector.label})`;
    const created = await repo.insertOne({
      userId: user.sub,
      title,
      content: healedContent,
      status: "draft",
      isMaster: false,
      isActive: false,
      parentId: targetResumeId,
      privacyLevel: target.privacyLevel ?? 10,
    } as any);
    resultResumeId = created.id;
    resultTitle = title;
  } else {
    await repo.updateByIdForOwner(targetResumeId, user.sub, { content: healedContent });
    resultResumeId = targetResumeId;
    resultTitle = target.title;
  }

  const result = {
    resumeId: resultResumeId,
    title: resultTitle,
    mergedSections: mergedCount,
    skippedSections: skippedCount,
    newSections: newCount,
  };

  await finalizeRun({
    runId: syncRunId,
    userId: user.sub,
    status: "success",
    decisionsSnapshot: decisions,
    resultSnapshot: result,
  });

  return c.json(ok(result), createNew ? 201 : 200);
});

// ---------------------------------------------------------------------------
// POST /:connectorId/blocks — render export paste-blocks from a resume
// ---------------------------------------------------------------------------

const BlocksSchema = z.object({
  resumeId: z.string().uuid(),
});

vendorSyncRoutes.post("/:connectorId/blocks", async (c) => {
  const user = c.var.user;
  const connectorId = c.req.param("connectorId");
  const connector = getConnector(connectorId);
  if (!connector) return c.json(fail("NOT_FOUND", `Unknown connector: ${connectorId}`), 404);

  const body = await c.req.json().catch(() => null);
  const parsed = BlocksSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const repo = buildRepos(getDb()).resumes;
  const resume = await repo.findByIdForOwner(parsed.data.resumeId, user.sub);
  if (!resume) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  const content = normalizeJsonResume((resume.content ?? {}) as Record<string, unknown>) as ResumeContent;
  const blocks = connector.renderExportBlocks(content);

  return c.json(ok({
    connectorId: connector.id,
    resumeId: resume.id,
    resumeTitle: resume.title,
    editProfileUrl: connector.editProfileUrl,
    blocks,
  }), 200);
});

// ---------------------------------------------------------------------------
// POST /runs — manual "I synced this" mark
// ---------------------------------------------------------------------------

const ManualRunSchema = z.object({
  connectorId: z.string().min(1),
  sourceResumeId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

vendorSyncRoutes.post("/runs", async (c) => {
  const user = c.var.user;
  const body = await c.req.json().catch(() => null);
  const parsed = ManualRunSchema.safeParse(body);
  if (!parsed.success) return c.json(fail("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);

  const connector = getConnector(parsed.data.connectorId);
  if (!connector) return c.json(fail("NOT_FOUND", `Unknown connector: ${parsed.data.connectorId}`), 404);

  const repo = buildRepos(getDb()).resumes;
  const resume = await repo.findByIdForOwner(parsed.data.sourceResumeId, user.sub);
  if (!resume) return c.json(fail("NOT_FOUND", "Resume not found"), 404);

  const run = await recordExportRun({
    userId: user.sub,
    connectorId: parsed.data.connectorId,
    sourceResumeId: parsed.data.sourceResumeId,
    notes: parsed.data.notes ?? null,
  });

  return c.json(ok({ run }), 201);
});

// ---------------------------------------------------------------------------
// GET /runs — audit history
// ---------------------------------------------------------------------------

vendorSyncRoutes.get("/runs", async (c) => {
  const user = c.var.user;
  const connectorId = c.req.query("connectorId") || undefined;
  const resumeId = c.req.query("resumeId") || undefined;
  const limitRaw = c.req.query("limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;

  const runs = await listRuns({
    userId: user.sub,
    connectorId,
    resumeId,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  return c.json(ok({ runs }), 200);
});
