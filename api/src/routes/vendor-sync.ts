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
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import type { MergeDecision } from "../services/resume/merge.js";
import { listRuns } from "../services/sync/sync-run-service.js";
import {
  executeVendorMerge,
  importVendorProfile,
  listConnectorsWithLastRun,
  markManualSync,
  renderVendorBlocks,
} from "../services/sync/vendor-sync.js";
import { clampLimit } from "../utils/pagination.js";
import { success, error } from "../types/index.js";
import { validateJson, type InvalidBodyHook } from "./helpers/validate.js";

export const vendorSyncRoutes = new Hono<AppEnv>();

const invalidBody: InvalidBodyHook = (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten());

// ---------------------------------------------------------------------------
// GET /connectors — registry + per-user last-synced overlay
// ---------------------------------------------------------------------------

vendorSyncRoutes.get("/connectors", async (c) => {
  // Public read: the registry itself has no user-bound data — only the
  // per-user `lastRun` overlay does. Skipping the overlay for anon
  // visitors lets /tools/vendor-sync render its real vendor catalog
  // before the seeker signs in, without changing the response shape.
  const connectors = await listConnectorsWithLastRun(c.var.user?.sub ?? null);
  return c.json(success({ connectors }), 200);
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
  targetResumeId: UuidLikeSchema,
});

vendorSyncRoutes.post("/:connectorId/import", validateJson(ImportSchema, invalidBody, { emptyBody: null }), async (c) => {
  const data = await importVendorProfile(c.env as any, c.var.user, c.req.param("connectorId"), c.req.valid("json"));
  return c.json(success(data), 200);
});

// ---------------------------------------------------------------------------
// POST /:connectorId/execute — commit reviewed merge into master
// ---------------------------------------------------------------------------

const ExecuteSchema = z.object({
  syncRunId: UuidLikeSchema,
  sourceContent: z.record(z.string(), z.unknown()),
  targetResumeId: UuidLikeSchema,
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

vendorSyncRoutes.post("/:connectorId/execute", validateJson(ExecuteSchema, invalidBody, { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const result = await executeVendorMerge(c.var.user.sub, c.req.param("connectorId"), {
    ...body,
    decisions: body.decisions as MergeDecision[],
  });
  return c.json(success(result), body.createNew ? 201 : 200);
});

// ---------------------------------------------------------------------------
// POST /:connectorId/blocks — render export paste-blocks from a resume
// ---------------------------------------------------------------------------

const BlocksSchema = z.object({
  resumeId: UuidLikeSchema,
});

vendorSyncRoutes.post("/:connectorId/blocks", validateJson(BlocksSchema, invalidBody, { emptyBody: null }), async (c) => {
  const data = await renderVendorBlocks(c.var.user.sub, c.req.param("connectorId"), c.req.valid("json").resumeId);
  return c.json(success(data), 200);
});

// ---------------------------------------------------------------------------
// POST /runs — manual "I synced this" mark
// ---------------------------------------------------------------------------

const ManualRunSchema = z.object({
  connectorId: z.string().min(1),
  sourceResumeId: UuidLikeSchema,
  notes: z.string().max(500).optional(),
});

vendorSyncRoutes.post("/runs", validateJson(ManualRunSchema, invalidBody, { emptyBody: null }), async (c) => {
  const run = await markManualSync(c.var.user.sub, c.req.valid("json"));
  return c.json(success({ run }), 201);
});

// ---------------------------------------------------------------------------
// GET /runs — audit history
// ---------------------------------------------------------------------------

vendorSyncRoutes.get("/runs", async (c) => {
  const user = c.var.user;
  const connectorId = c.req.query("connectorId") || undefined;
  const resumeId = c.req.query("resumeId") || undefined;
  const runs = await listRuns({
    userId: user.sub,
    connectorId,
    resumeId,
    // Same default/bounds listRuns applies (50, 1..200).
    limit: clampLimit(c.req.query("limit"), 50, 200),
  });

  return c.json(success({ runs }), 200);
});
