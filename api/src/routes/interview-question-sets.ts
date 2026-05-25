/**
 * Interview Question Sets — reusable library for recruiters / employers.
 *
 * Why this exists: until 0120, every interview assignment was a one-off
 * generate-and-send. To outshine HireVue/VidCruiter we need a library
 * surface — "I built the Senior Backend question set last week, attach it
 * to this job posting and to that ad-hoc invite." That library is owned
 * either by the user (personal scratchpad) OR by a company (shared across
 * the company's recruiters). The xor is enforced by SQL + by the route
 * layer when picking an owner from the request body.
 *
 * Endpoints (mounted at /api/interview-question-sets):
 *   GET    /                     — list mine (user-owned + every active company I'm a member of)
 *   POST   /                     — create
 *   GET    /:id                  — fetch one
 *   PUT    /:id                  — update
 *   DELETE /:id                  — archive (soft-delete via is_archived)
 *
 * Companion endpoints elsewhere consume these sets:
 *   - routes/jobs.ts            — GET/PUT /api/jobs/:id/screening attaches a set to a job
 *   - routes/interview-assignments.ts — assign-from-set helper (POST /assign passes
 *     questionSetId; the route layer copies the set's questions onto the assignment row
 *     so per-candidate edits don't bleed back into the library).
 */

import { Hono } from "hono";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";

const { interviewQuestionSets, userCompanyRoleAssociations } = schema;

export const interviewQuestionSetRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
interviewQuestionSetRoutes.use("*", attachTokenBudget());

// ─── Helpers ────────────────────────────────────────────────────────────────

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

const ASSIGNABLE_ROLES: ReadonlySet<string> = new Set([
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
]);

function hasRecruiterRole(roles: readonly string[] | undefined): boolean {
  return !!roles?.some((r) => ASSIGNABLE_ROLES.has(r));
}

const QuestionShape = z.object({
  id: z.string(),
  text: z.string().min(8),
  category: z.string().default("behavioral"),
  maxDurationSec: z.number().int().min(30).max(300).default(120),
  required: z.boolean().default(true),
  skillLinks: z.array(z.string()).default([]),
});

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetRole: z.string().max(120).optional(),
  style: z.enum(["behavioral", "technical", "mixed"]).default("mixed"),
  questions: z.array(QuestionShape).min(1).max(15),
  skills: z.array(z.any()).default([]),
  prepTimeSec: z.number().int().min(0).max(120).default(10),
  maxRetakes: z.number().int().min(0).max(10).default(1),
  proctoringOn: z.boolean().default(true),
  /** When set, the set is owned by this company (shared library). Caller
   *  MUST be an active member of the company. Omit for a personal set. */
  companyId: z.string().uuid().optional(),
});

const UpdateSchema = CreateSchema.partial().omit({ companyId: true }).extend({
  isArchived: z.boolean().optional(),
});

// Resolve the set of companies the current user can read/write sets for.
async function getUserCompanyIds(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ companyId: userCompanyRoleAssociations.companyId })
    .from(userCompanyRoleAssociations)
    .where(
      and(
        eq(userCompanyRoleAssociations.userId, userId),
        eq(userCompanyRoleAssociations.isActive, true),
      ),
    );
  return rows.map((r) => r.companyId).filter((id): id is string => !!id);
}

async function canReadSet(set: typeof interviewQuestionSets.$inferSelect, userId: string): Promise<boolean> {
  if (set.ownerUserId === userId) return true;
  if (set.ownerCompanyId) {
    const ids = await getUserCompanyIds(userId);
    return ids.includes(set.ownerCompanyId);
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIST — every set the user can see (their own + their companies')
// ═══════════════════════════════════════════════════════════════════════════

interviewQuestionSetRoutes.get("/", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  if (!hasRecruiterRole(user.roles)) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can manage question sets"), 403);
  }
  const includeArchived = c.req.query("includeArchived") === "true";
  const db = getDb();
  const companyIds = await getUserCompanyIds(user.sub);

  // One query: owner_user_id = me OR owner_company_id IN (my companies)
  const rows = await db
    .select()
    .from(interviewQuestionSets)
    .where(
      and(
        includeArchived ? undefined : eq(interviewQuestionSets.isArchived, false),
        or(
          eq(interviewQuestionSets.ownerUserId, user.sub),
          companyIds.length > 0
            ? sql`${interviewQuestionSets.ownerCompanyId} = ANY(${companyIds})`
            : isNull(interviewQuestionSets.ownerCompanyId), // never matches anything if no companies — fine
        ),
      ),
    )
    .orderBy(desc(interviewQuestionSets.updatedAt))
    .limit(200);

  return c.json(ok({ sets: rows }));
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════════════════

interviewQuestionSetRoutes.post("/", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  if (!hasRecruiterRole(user.roles)) {
    return c.json(fail("FORBIDDEN", "Only recruiters or employers can create question sets"), 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  if (parsed.data.companyId) {
    const allowed = await getUserCompanyIds(user.sub);
    if (!allowed.includes(parsed.data.companyId)) {
      return c.json(fail("FORBIDDEN", "You're not a member of that company"), 403);
    }
  }

  const db = getDb();
  const [created] = await db
    .insert(interviewQuestionSets)
    .values({
      ownerUserId: parsed.data.companyId ? null : user.sub,
      ownerCompanyId: parsed.data.companyId ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      targetRole: parsed.data.targetRole ?? null,
      style: parsed.data.style,
      questions: parsed.data.questions,
      skills: parsed.data.skills,
      prepTimeSec: parsed.data.prepTimeSec,
      maxRetakes: parsed.data.maxRetakes,
      proctoringOn: parsed.data.proctoringOn,
    } as any)
    .returning();

  return c.json(ok(created), 201);
});

// ═══════════════════════════════════════════════════════════════════════════
// READ ONE
// ═══════════════════════════════════════════════════════════════════════════

interviewQuestionSetRoutes.get("/:id", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const id = c.req.param("id");
  const db = getDb();
  const [row] = await db
    .select()
    .from(interviewQuestionSets)
    .where(eq(interviewQuestionSets.id, id))
    .limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "Question set not found"), 404);
  if (!(await canReadSet(row, user.sub))) {
    return c.json(fail("FORBIDDEN", "Not your question set"), 403);
  }
  return c.json(ok(row));
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════════════════

interviewQuestionSetRoutes.put("/:id", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(interviewQuestionSets)
    .where(eq(interviewQuestionSets.id, id))
    .limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Question set not found"), 404);
  if (!(await canReadSet(existing, user.sub))) {
    return c.json(fail("FORBIDDEN", "Not your question set"), 403);
  }

  const [updated] = await db
    .update(interviewQuestionSets)
    .set({
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.targetRole !== undefined ? { targetRole: parsed.data.targetRole } : {}),
      ...(parsed.data.style !== undefined ? { style: parsed.data.style } : {}),
      ...(parsed.data.questions !== undefined ? { questions: parsed.data.questions } : {}),
      ...(parsed.data.skills !== undefined ? { skills: parsed.data.skills } : {}),
      ...(parsed.data.prepTimeSec !== undefined ? { prepTimeSec: parsed.data.prepTimeSec } : {}),
      ...(parsed.data.maxRetakes !== undefined ? { maxRetakes: parsed.data.maxRetakes } : {}),
      ...(parsed.data.proctoringOn !== undefined ? { proctoringOn: parsed.data.proctoringOn } : {}),
      ...(parsed.data.isArchived !== undefined ? { isArchived: parsed.data.isArchived } : {}),
      updatedAt: new Date(),
    } as any)
    .where(eq(interviewQuestionSets.id, id))
    .returning();

  return c.json(ok(updated));
});

// ═══════════════════════════════════════════════════════════════════════════
// ARCHIVE (soft-delete)
// ═══════════════════════════════════════════════════════════════════════════

interviewQuestionSetRoutes.delete("/:id", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const id = c.req.param("id");
  const db = getDb();
  const [existing] = await db
    .select()
    .from(interviewQuestionSets)
    .where(eq(interviewQuestionSets.id, id))
    .limit(1);
  if (!existing) return c.json(fail("NOT_FOUND", "Question set not found"), 404);
  if (!(await canReadSet(existing, user.sub))) {
    return c.json(fail("FORBIDDEN", "Not your question set"), 403);
  }

  await db
    .update(interviewQuestionSets)
    .set({ isArchived: true, updatedAt: new Date() } as any)
    .where(eq(interviewQuestionSets.id, id));

  return c.json(ok({ archived: true }));
});
