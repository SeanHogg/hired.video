// tool-runs.ts — Persist & retrieve the polymorphic tool-run history.
// Each run may reference one or more entities (resume, job, video,
// template, company) and the studio session it was made in (project). All
// routes are owner-scoped: callers can only see and write runs against
// entities they own (services/ai-tools/tool-runs.ts).

import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  deleteToolRun,
  extractRefs,
  getToolRun,
  isEntityType,
  listMyRuns,
  listRunsForEntity,
  recordToolRun,
  toolRunAward,
} from "../services/ai-tools/tool-runs.js";
import { clampLimit } from "../utils/pagination.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const toolRunsRoutes = new Hono<AppEnv>();

// ─── POST /api/tool-runs ─────────────────────────────────────────────────────
// Record a tool run. Supply at least one entity reference so the run is
// discoverable in that entity's history panel.
toolRunsRoutes.post("/", async (c) => {
  const userId = requireUser(c);

  const body = await c.req.json().catch(() => ({}));
  const toolId = typeof body.toolId === "string" ? body.toolId : "";
  if (!toolId) return c.json(error("VALIDATION_ERROR", "toolId is required"), 400);

  const run = await recordToolRun(userId, {
    toolId,
    refs: extractRefs(body),
    score: body.score,
    result: body.result,
    jobDescription: body.jobDescription,
    summary: body.summary,
  });

  const { withGamification } = await import("../domains/gamification/with-gamification.js");
  await withGamification(c, "tool-run", toolRunAward(run.id, toolId));

  return c.json(success(run), 201);
});

// ─── GET /api/tool-runs?entityType=resume&entityId=… ────────────────────────
// List runs that reference a specific entity. entityType + entityId are
// required (history is always scoped to one anchor entity). Optional
// toolId filter narrows to one tool.
toolRunsRoutes.get("/", async (c) => {
  const userId = requireUser(c);

  const entityType = c.req.query("entityType") ?? "";
  const entityId = c.req.query("entityId") ?? "";
  if (!entityType || !entityId) {
    return c.json(error("VALIDATION_ERROR", "entityType and entityId are required"), 400);
  }
  if (!isEntityType(entityType)) {
    return c.json(error("VALIDATION_ERROR", `Unknown entityType: ${entityType}`), 400);
  }

  const rows = await listRunsForEntity(userId, entityType, entityId, {
    toolId: c.req.query("toolId"),
    limit: clampLimit(c.req.query("limit"), 50, 200),
  });
  return c.json(success(rows), 200);
});

// ─── GET /api/tool-runs/mine?toolId=…&limit=50 ───────────────────────────────
// Per-user tool-run history, scoped to the authenticated caller. Powers
// the "View History" button on each full-page tool (/tools/*), where the
// anchor is the user themselves rather than one specific entity.
toolRunsRoutes.get("/mine", async (c) => {
  const userId = requireUser(c);
  const rows = await listMyRuns(userId, {
    toolId: c.req.query("toolId"),
    limit: clampLimit(c.req.query("limit"), 50, 200),
  });
  return c.json(success(rows), 200);
});

// ─── GET /api/tool-runs/:id ──────────────────────────────────────────────────
toolRunsRoutes.get("/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getToolRun(userId, c.req.param("id"))), 200);
});

// ─── DELETE /api/tool-runs/:id ───────────────────────────────────────────────
toolRunsRoutes.delete("/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await deleteToolRun(userId, c.req.param("id"))), 200);
});
