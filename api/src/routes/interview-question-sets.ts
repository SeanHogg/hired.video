/**
 * Interview Question Sets — reusable library for recruiters / employers.
 *
 * Why this exists: until 0120, every interview assignment was a one-off
 * generate-and-send. To outshine HireVue/VidCruiter we need a library
 * surface — "I built the Senior Backend question set last week, attach it
 * to this job posting and to that ad-hoc invite." That library is owned
 * either by the user (personal scratchpad) OR by a company (shared across
 * the company's recruiters). The xor is enforced by SQL + by the service
 * layer when picking an owner from the request body.
 *
 * Endpoints (mounted at /api/interview-question-sets):
 *   GET    /                     — list mine (user-owned + every active company I'm a member of)
 *   POST   /                     — create
 *   GET    /:id                  — fetch one
 *   PUT    /:id                  — update
 *   DELETE /:id                  — archive (soft-delete via is_archived)
 *
 * Use cases: services/interview/question-sets.ts; data access:
 * repositories/interviewQuestionSetsRepository.ts.
 *
 * Companion endpoints elsewhere consume these sets:
 *   - routes/jobs.ts            — GET/PUT /api/jobs/:id/screening attaches a set to a job
 *   - routes/interview-assignments.ts — assign-from-set helper (POST /assign passes
 *     questionSetId; the route layer copies the set's questions onto the assignment row
 *     so per-candidate edits don't bleed back into the library).
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { success } from "../types/index.js";
import {
  archiveQuestionSet,
  createQuestionSet,
  getReadableQuestionSet,
  listQuestionSets,
  updateQuestionSet,
} from "../services/interview/question-sets.js";
import type { QuestionSetPatch } from "../repositories/interviewQuestionSetsRepository.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const interviewQuestionSetRoutes = new Hono<AppEnv>();
interviewQuestionSetRoutes.use("*", attachTokenBudget());

// ─── Schemas ────────────────────────────────────────────────────────────────

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
  companyId: UuidLikeSchema.optional(),
});

const UpdateSchema = CreateSchema.partial().omit({ companyId: true }).extend({
  isArchived: z.boolean().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// LIST — every set the user can see (their own + their companies')
// ═══════════════════════════════════════════════════════════════════════════

interviewQuestionSetRoutes.get("/", async (c) => {
  const userId = requireUser(c);
  const sets = await listQuestionSets(
    { userId, roles: c.var.user.roles },
    c.req.query("includeArchived") === "true",
  );
  return c.json(success({ sets }));
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════════════════

interviewQuestionSetRoutes.post("/", validateJson(CreateSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const created = await createQuestionSet(
    { userId, roles: c.var.user.roles },
    { ...body, description: body.description ?? null, targetRole: body.targetRole ?? null },
  );
  return c.json(success(created), 201);
});

// ═══════════════════════════════════════════════════════════════════════════
// READ ONE
// ═══════════════════════════════════════════════════════════════════════════

interviewQuestionSetRoutes.get("/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getReadableQuestionSet(userId, c.req.param("id"))));
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE — only the fields present in the body are written
// ═══════════════════════════════════════════════════════════════════════════

interviewQuestionSetRoutes.put("/:id", validateJson(UpdateSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const patch = Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined),
  ) as QuestionSetPatch;
  return c.json(success(await updateQuestionSet(userId, c.req.param("id"), patch)));
});

// ═══════════════════════════════════════════════════════════════════════════
// ARCHIVE (soft-delete)
// ═══════════════════════════════════════════════════════════════════════════

interviewQuestionSetRoutes.delete("/:id", async (c) => {
  const userId = requireUser(c);
  await archiveQuestionSet(userId, c.req.param("id"));
  return c.json(success({ archived: true }));
});
