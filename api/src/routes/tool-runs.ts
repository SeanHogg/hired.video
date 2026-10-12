// tool-runs.ts — Persist & retrieve the polymorphic tool-run history.
// Each run may reference one or more entities (resume, job, video,
// template, company) and the studio session it was made in (project). All
// routes are owner-scoped: callers can only see
// and write runs against entities they own.

import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { ownsByJob, ownsByStudioProject } from "../repositories/toolRunOwnershipRepository.js";

export const toolRunsRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

type Db = ReturnType<typeof getDb>;

// ── Entity ownership checks ─────────────────────────────────────────────────
// New entity types are added here once — routes, history, and the dialog
// all funnel through this map.

export type EntityType = "resume" | "job" | "video" | "template" | "company" | "project";

interface EntityBinding {
  /** Column on tool_runs that references this entity. */
  column: typeof schema.toolRuns.resumeId
        | typeof schema.toolRuns.jobId
        | typeof schema.toolRuns.videoId
        | typeof schema.toolRuns.templateId
        | typeof schema.toolRuns.companyId
        | typeof schema.toolRuns.studioProjectId;
  /** Confirms the authenticated user owns the entity. */
  ownsBy(db: Db, userId: string, id: string): Promise<boolean>;
}

async function ownsBySimpleTable<TTable extends { id: any; userId: any }>(
  db: Db, table: TTable, userId: string, id: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: (table as any).id })
    .from(table as any)
    .where(and(eq((table as any).id, id), eq((table as any).userId, userId)))
    .limit(1);
  return rows.length > 0;
}

// Job ownership (posted / saved / applied) lives in the repository layer;
// re-exported here for the existing unit tests.
export { ownsByJob };

export const entities: Record<EntityType, EntityBinding> = {
  resume: {
    column: schema.toolRuns.resumeId,
    ownsBy: (db, userId, id) => ownsBySimpleTable(db, schema.resumeInformation as any, userId, id),
  },
  job: {
    column: schema.toolRuns.jobId,
    ownsBy: (db, userId, id) => ownsByJob(db, userId, id),
  },
  video: {
    column: schema.toolRuns.videoId,
    ownsBy: (db, userId, id) => ownsBySimpleTable(db, schema.videos as any, userId, id),
  },
  template: {
    // Templates are shared assets — users can run tools against any
    // template they can view. The tool-run row is still user-scoped so
    // history is private per user.
    column: schema.toolRuns.templateId,
    ownsBy: async () => true,
  },
  company: {
    column: schema.toolRuns.companyId,
    // Company profiles have a userId (creator/claimer). Non-owners can
    // still record a run against them (e.g. researching a prospective
    // employer) so we permit any authenticated user.
    ownsBy: async () => true,
  },
  project: {
    // The studio session (/studio/<id>): its runs come back when it reopens.
    column: schema.toolRuns.studioProjectId,
    ownsBy: (db, userId, id) => ownsByStudioProject(db, userId, id),
  },
};

function isEntityType(v: string): v is EntityType {
  return v in entities;
}

// Parse entity refs from a request body/query into a validated map. At
// least one must be supplied. Returns an error string or the refs.
interface EntityRefs {
  resumeId?: string; jobId?: string; videoId?: string; templateId?: string; companyId?: string;
  studioProjectId?: string;
}

function extractRefs(src: Record<string, any>): EntityRefs {
  const refs: EntityRefs = {};
  if (typeof src.resumeId === "string" && src.resumeId) refs.resumeId = src.resumeId;
  if (typeof src.jobId === "string" && src.jobId) refs.jobId = src.jobId;
  if (typeof src.videoId === "string" && src.videoId) refs.videoId = src.videoId;
  if (typeof src.templateId === "string" && src.templateId) refs.templateId = src.templateId;
  if (typeof src.companyId === "string" && src.companyId) refs.companyId = src.companyId;
  if (typeof src.studioProjectId === "string" && src.studioProjectId) refs.studioProjectId = src.studioProjectId;
  return refs;
}

async function assertOwnership(db: Db, userId: string, refs: EntityRefs): Promise<string | null> {
  const checks: Array<[EntityType, string]> = [];
  if (refs.resumeId) checks.push(["resume", refs.resumeId]);
  if (refs.jobId) checks.push(["job", refs.jobId]);
  if (refs.videoId) checks.push(["video", refs.videoId]);
  if (refs.templateId) checks.push(["template", refs.templateId]);
  if (refs.companyId) checks.push(["company", refs.companyId]);
  if (refs.studioProjectId) checks.push(["project", refs.studioProjectId]);

  // Independent checks run concurrently (was one awaited round-trip per
  // entity); the first failing ref in declaration order is still reported.
  const owned = await Promise.all(checks.map(([type, id]) => entities[type].ownsBy(db, userId, id)));
  const failedAt = owned.findIndex((ok) => !ok);
  if (failedAt === -1) return null;
  const [type, id] = checks[failedAt]!;
  return `${type} ${id} not accessible`;
}

// ─── POST /api/tool-runs ─────────────────────────────────────────────────────
// Record a tool run. Supply at least one entity reference so the run is
// discoverable in that entity's history panel.
toolRunsRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => ({}));
  const toolId = typeof body.toolId === "string" ? body.toolId : "";
  if (!toolId) return c.json(error("VALIDATION_ERROR", "toolId is required"), 400);

  // Entity refs are optional — runs from the full `/tools/*` pages (where
  // a user pastes text directly) are legitimately anchor-less. Such runs
  // still show up in the user's own history via GET /mine.
  const refs = extractRefs(body);

  const db = getDb();
  if (Object.keys(refs).length > 0) {
    const ownershipError = await assertOwnership(db, userId, refs);
    if (ownershipError) return c.json(error("NOT_FOUND", ownershipError), 404);
  }

  const [run] = await db
    .insert(schema.toolRuns)
    .values({
      userId,
      toolId,
      ...refs,
      score: typeof body.score === "number" ? String(body.score) : null,
      result: (body.result ?? {}) as Record<string, unknown>,
      jobDescription: typeof body.jobDescription === "string" ? body.jobDescription : null,
      summary: typeof body.summary === "string" ? body.summary : null,
    } as any)
    .returning();

  // Gamification award. Specific tool ids map to richer actions
  // (resume_tailor, cover_letter); everything else earns under the
  // generic ai.tool.used action.
  const { withGamification } = await import("../domains/gamification/with-gamification.js");
  const { TOOL_ID_TO_ACTION } = await import("../domains/gamification/tool-id-mapping.js");
  await withGamification(c, "tool-run", async (game, role, uid) => {
    const args = { userId: uid, role, toolRunId: run.id, metadata: { toolId } };
    const mapped = TOOL_ID_TO_ACTION[toolId];
    if (mapped === "resume.tailored") {
      await game.onResumeTailored({ ...args, resumeRunId: run.id });
    } else if (mapped === "cover_letter.generated") {
      await game.onCoverLetterGenerated(args);
    } else {
      await game.onAiToolUsed(args);
    }
  });

  return c.json(success(run), 201);
});

// ─── GET /api/tool-runs?entityType=resume&entityId=… ────────────────────────
// List runs that reference a specific entity. entityType + entityId are
// required (history is always scoped to one anchor entity). Optional
// toolId filter narrows to one tool.
toolRunsRoutes.get("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const entityType = c.req.query("entityType") ?? "";
  const entityId = c.req.query("entityId") ?? "";
  if (!entityType || !entityId) {
    return c.json(error("VALIDATION_ERROR", "entityType and entityId are required"), 400);
  }
  if (!isEntityType(entityType)) {
    return c.json(error("VALIDATION_ERROR", `Unknown entityType: ${entityType}`), 400);
  }

  const toolId = c.req.query("toolId");
  const limitRaw = Number.parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  const db = getDb();
  const binding = entities[entityType];
  if (!(await binding.ownsBy(db, userId, entityId))) {
    return c.json(error("NOT_FOUND", `${entityType} not found`), 404);
  }

  const conditions: SQL[] = [
    eq(binding.column, entityId),
    // Runs are user-private even when the anchor entity is shared (e.g.
    // templates). Every user sees only their own history for an entity.
    eq(schema.toolRuns.userId, userId),
  ];
  if (toolId) conditions.push(eq(schema.toolRuns.toolId, toolId));

  const rows = await db
    .select()
    .from(schema.toolRuns)
    .where(and(...conditions))
    .orderBy(desc(schema.toolRuns.createdAt))
    .limit(limit);

  return c.json(success(rows), 200);
});

// ─── GET /api/tool-runs/mine?toolId=…&limit=50 ───────────────────────────────
// Per-user tool-run history, scoped to the authenticated caller. Powers
// the "View History" button on each full-page tool (/tools/*), where the
// anchor is the user themselves rather than one specific entity.
toolRunsRoutes.get("/mine", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const toolId = c.req.query("toolId");
  const limitRaw = Number.parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  const db = getDb();
  const conditions: SQL[] = [eq(schema.toolRuns.userId, userId)];
  if (toolId) conditions.push(eq(schema.toolRuns.toolId, toolId));

  const rows = await db
    .select()
    .from(schema.toolRuns)
    .where(and(...conditions))
    .orderBy(desc(schema.toolRuns.createdAt))
    .limit(limit);

  return c.json(success(rows), 200);
});

// ─── GET /api/tool-runs/:id ──────────────────────────────────────────────────
toolRunsRoutes.get("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [run] = await db
    .select()
    .from(schema.toolRuns)
    .where(and(
      eq(schema.toolRuns.id, c.req.param("id")),
      eq(schema.toolRuns.userId, userId),
    ))
    .limit(1);

  if (!run) return c.json(error("NOT_FOUND", "Tool run not found"), 404);
  return c.json(success(run), 200);
});

// ─── DELETE /api/tool-runs/:id ───────────────────────────────────────────────
toolRunsRoutes.delete("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const deleted = await db
    .delete(schema.toolRuns)
    .where(and(
      eq(schema.toolRuns.id, c.req.param("id")),
      eq(schema.toolRuns.userId, userId),
    ))
    .returning({ id: schema.toolRuns.id });

  if (deleted.length === 0) return c.json(error("NOT_FOUND", "Tool run not found"), 404);
  return c.json(success({ id: deleted[0].id }), 200);
});
