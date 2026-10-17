// autofill.ts — Application form analysis and AI answer generation (#autofill)
// Endpoints for analyzing forms (HTML or raw questions), generating answers
// using the user's profile/resume/job context, saving submissions, and
// managing the per-user answer cache.

import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import {
  analyzeForm,
  generateAnswers,
  hashQuestion,
  normalizeQuestion,
} from "../services/user/autofill.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import type { FormField } from "../../../shared/autofill.js";
import { parsePagination } from "../utils/pagination.js";
import {
  handleDeleteCacheEntry,
  handleHistoryDetail,
  handleHistoryList,
  handleSaveSubmission,
  handleUpdateCacheEntry,
  type AutofillDeps,
} from "../services/user/autofill-handlers.js";
import { sendHandlerResult } from "./helpers/routerHelpers.js";

export const autofillRoutes = new Hono<AppEnv>();
autofillRoutes.use("*", attachTokenBudget());

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

/** Deps for the pure write/history handlers (services/user/autofill-handlers.ts). */
function autofillDeps(): AutofillDeps {
  return { db: getDb(), now: () => new Date() };
}

// =====================================================================
// Schemas
// =====================================================================

const AnalyzeFormSchema = z.object({
  html: z.string().max(50000).optional(),
  questions: z.array(z.string().max(2000)).max(50).optional(),
  url: z.string().url().max(2000).optional(),
}).refine((v) => !!(v.html || v.questions?.length || v.url), {
  message: "Provide html, questions, or url",
});

const GenerateAnswersSchema = z.object({
  fields: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.string(),
    name: z.string().optional(),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
    selector: z.string().optional(),
    category: z.string().optional(),
  })).min(1).max(100),
  jobId: UuidLikeSchema.optional(),
  jobDescription: z.string().max(10000).optional(),
  resumeId: UuidLikeSchema.optional(),
  customInstructions: z.string().max(1000).optional(),
});

// =====================================================================
// Routes
// =====================================================================

/**
 * POST /api/autofill/analyze
 * Analyze a form: extract fields from HTML, raw questions, or a URL.
 */
autofillRoutes.post("/analyze", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = AnalyzeFormSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const llm = hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null;
  const result = await analyzeForm(llm, parsed.data);

  return c.json(success({
    fields: result.fields,
    atsProvider: result.atsProvider ?? null,
    formTitle: result.formTitle ?? null,
  }), 200);
});

/**
 * POST /api/autofill/generate
 * Generate answers for form fields using profile + resume + job context.
 */
autofillRoutes.post("/generate", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = GenerateAnswersSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const { fields, jobId, jobDescription, resumeId, customInstructions } = parsed.data;
  const db = getDb();
  const llm = hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null;

  // Load user profile
  const [user] = await db.select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) return c.json(error("NOT_FOUND", "User not found"), 404);

  const [profile] = await db.select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, userId)).limit(1);

  const profileData = {
    name: user.name,
    email: user.email,
    phone: profile?.phone,
    location: profile?.location,
    linkedIn: profile?.linkedIn,
    github: profile?.github,
    twitter: profile?.twitter,
    website: profile?.website,
    headline: profile?.headline,
    summary: profile?.summary,
    currentRole: profile?.currentRole,
    currentCompany: profile?.currentCompany,
    yearsOfExperience: profile?.yearsOfExperience,
    skills: (profile?.skills as string[] | null) ?? [],
    salaryExpectation: profile?.salaryExpectation,
    salaryCurrency: profile?.salaryCurrency,
  };

  // Load resume (prefer provided ID, fall back to active/master).
  // All `resume_information` access routes through ResumeRepository per
  // the layering rule — no direct Drizzle calls on this table.
  const resumeRepo = buildRepos(db).resumes;
  let resumeContent: any = null;
  if (resumeId) {
    const resume = await resumeRepo.findByIdForOwner(resumeId, userId);
    if (resume) resumeContent = resume.content;
  } else {
    const userResumes = await resumeRepo.findAllForOwner(userId);
    const active = userResumes.find((r) => r.isActive) ?? userResumes.find((r) => r.isMaster) ?? userResumes[0];
    if (active) resumeContent = active.content;
  }

  // Load job description if jobId provided
  let jdText = jobDescription;
  if (!jdText && jobId) {
    const [job] = await db.select({ title: schema.jobItems.title, description: schema.jobItems.description, company: schema.jobItems.company })
      .from(schema.jobItems)
      .where(eq(schema.jobItems.id, jobId))
      .limit(1);
    if (job) {
      jdText = `Title: ${job.title}\nCompany: ${job.company ?? "Unknown"}\n\n${job.description ?? ""}`;
    }
  }

  // Load cached answers for this user
  const cachedRows = await db.select()
    .from(schema.answerCache)
    .where(eq(schema.answerCache.userId, userId))
    .catch(() => []);

  const cachedAnswers = new Map<string, string>();
  for (const row of cachedRows) {
    const normalized = normalizeQuestion(row.questionText);
    cachedAnswers.set(normalized, row.answer);
  }

  // Generate answers
  const result = await generateAnswers(
    llm,
    fields as FormField[],
    profileData,
    resumeContent,
    jdText,
    cachedAnswers.size > 0 ? cachedAnswers : undefined,
    customInstructions,
  );

  // Upsert new AI-generated answers into the cache — hash everything first,
  // then ONE multi-row upsert (was one round-trip per answer).
  try {
    const fieldsById = new Map<string, (typeof fields)[number]>();
    for (const f of fields) if (!fieldsById.has(f.id)) fieldsById.set(f.id, f);
    const toCache = result.answers.flatMap((answer) => {
      if (answer.source !== "ai") return [];
      const field = fieldsById.get(answer.fieldId);
      if (!field || !field.label || field.label.length < 5) return [];
      return [{ field, answer: answer.answer }];
    });
    const entries = await Promise.all(
      toCache.map(async ({ field, answer }) => ({
        questionHash: await hashQuestion(field.label),
        questionText: field.label,
        questionCategory: field.category ?? null,
        answer,
      })),
    );
    await buildRepos(db).autofill.recordGeneratedAnswers(userId, entries);
  } catch { /* Non-critical cache write — don't fail the request */ }

  return c.json(success({
    answers: result.answers,
  }), 200);
});

/**
 * POST /api/autofill/save
 * Save a completed form submission with answers.
 */
autofillRoutes.post("/save", async (c) => {
  const body = await c.req.json().catch(() => null);
  return sendHandlerResult(c, await handleSaveSubmission(autofillDeps(), uid(c), body));
});

/**
 * GET /api/autofill/history
 * Paginated list of the user's form submissions.
 * Query: ?jobId=, ?page=1, ?limit=20
 */
autofillRoutes.get("/history", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const { page, limit } = parsePagination(c, { defaultLimit: 20, maxLimit: 50 });
  const jobId = c.req.query("jobId");
  return sendHandlerResult(c, await handleHistoryList(autofillDeps(), userId, { page, limit, jobId }));
});

/**
 * GET /api/autofill/history/:id
 * Single submission detail with full fields + answers.
 */
autofillRoutes.get("/history/:id", async (c) =>
  sendHandlerResult(c, await handleHistoryDetail(autofillDeps(), uid(c), c.req.param("id"))),
);

/**
 * GET /api/autofill/cache
 * List the user's cached answers, ordered by most-used.
 */
autofillRoutes.get("/cache", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const rows = await db.select({
    id: schema.answerCache.id,
    questionText: schema.answerCache.questionText,
    questionCategory: schema.answerCache.questionCategory,
    answer: schema.answerCache.answer,
    timesUsed: schema.answerCache.timesUsed,
    lastUsedAt: schema.answerCache.lastUsedAt,
  })
    .from(schema.answerCache)
    .where(eq(schema.answerCache.userId, userId))
    .orderBy(desc(schema.answerCache.timesUsed))
    .limit(100);

  return c.json(success(rows), 200);
});

/**
 * PUT /api/autofill/cache/:id
 * Update a cached answer.
 */
autofillRoutes.put("/cache/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  return sendHandlerResult(c, await handleUpdateCacheEntry(autofillDeps(), uid(c), c.req.param("id"), body));
});

/**
 * DELETE /api/autofill/cache/:id
 * Delete a cached answer.
 */
autofillRoutes.delete("/cache/:id", async (c) =>
  sendHandlerResult(c, await handleDeleteCacheEntry(autofillDeps(), uid(c), c.req.param("id"))),
);

autofillRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Autofill endpoint not found" } }, 404),
);
