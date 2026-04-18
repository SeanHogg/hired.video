// autofill.ts — Application form analysis and AI answer generation (#autofill)
// Endpoints for analyzing forms (HTML or raw questions), generating answers
// using the user's profile/resume/job context, saving submissions, and
// managing the per-user answer cache.

import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { getApiKey, type LLMUsage } from "../services/ai.js";
import {
  analyzeForm,
  generateAnswers,
  hashQuestion,
  normalizeQuestion,
} from "../services/autofill.js";
import { recordTokenUsage } from "../services/billing.js";
import { resumeContentToText } from "../services/resume-parse.js";

export const autofillRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

/** Record AI usage for billing/audit. Fire-and-forget. */
function recordAutofillUsage(userId: string, featureKey: string, usage: LLMUsage) {
  void recordTokenUsage({
    userId,
    model: usage.model,
    featureKey,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  });
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
  jobId: z.string().uuid().optional(),
  jobDescription: z.string().max(10000).optional(),
  resumeId: z.string().uuid().optional(),
  customInstructions: z.string().max(1000).optional(),
});

const SaveSubmissionSchema = z.object({
  fields: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.string(),
    name: z.string().optional(),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    selector: z.string().optional(),
    category: z.string().optional(),
  })),
  answers: z.record(z.string(), z.string()),
  sourceUrl: z.string().max(2000).optional(),
  jobId: z.string().uuid().optional(),
  savedJobId: z.string().uuid().optional(),
  resumeId: z.string().uuid().optional(),
  atsProvider: z.string().max(50).optional(),
  jobDescription: z.string().max(10000).optional(),
  status: z.enum(["draft", "submitted", "reviewed"]).optional(),
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

  const apiKey = getApiKey((c.env as any) ?? {});
  const result = await analyzeForm(apiKey, parsed.data);

  if (result.usage) {
    recordAutofillUsage(userId, "autofill_analyze", result.usage);
  }

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
  const apiKey = getApiKey((c.env as any) ?? {});

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

  // Load resume (prefer provided ID, fall back to active/master)
  let resumeContent: any = null;
  if (resumeId) {
    const [resume] = await db.select()
      .from(schema.resumeInformation)
      .where(and(eq(schema.resumeInformation.id, resumeId), eq(schema.resumeInformation.userId, userId)))
      .limit(1);
    if (resume) resumeContent = resume.content;
  } else {
    const userResumes = await db.select()
      .from(schema.resumeInformation)
      .where(eq(schema.resumeInformation.userId, userId));
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
    apiKey,
    fields as any,
    profileData,
    resumeContent,
    jdText,
    cachedAnswers.size > 0 ? cachedAnswers : undefined,
    customInstructions,
  );

  if (result.usage) {
    recordAutofillUsage(userId, "autofill_generate", result.usage);
  }

  // Upsert new AI-generated answers into the cache
  for (const answer of result.answers) {
    if (answer.source !== "ai") continue;
    const field = fields.find((f) => f.id === answer.fieldId);
    if (!field || !field.label || field.label.length < 5) continue;

    try {
      const hash = await hashQuestion(field.label);
      await db.insert(schema.answerCache).values({
        userId,
        questionHash: hash,
        questionText: field.label,
        questionCategory: field.category ?? null,
        answer: answer.answer,
      } as any).onConflictDoUpdate({
        target: [schema.answerCache.userId, schema.answerCache.questionHash],
        set: {
          answer: answer.answer,
          timesUsed: sql`${schema.answerCache.timesUsed} + 1`,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
      }).catch(() => {}); // Non-critical — don't fail the request
    } catch { /* ignore cache errors */ }
  }

  return c.json(success({
    answers: result.answers,
    tokensUsed: result.usage?.totalTokens ?? 0,
  }), 200);
});

/**
 * POST /api/autofill/save
 * Save a completed form submission with answers.
 */
autofillRoutes.post("/save", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = SaveSubmissionSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const { fields, answers, sourceUrl, jobId, savedJobId, resumeId, atsProvider, jobDescription, status } = parsed.data;
  const db = getDb();

  const [inserted] = await db.insert(schema.applicationFormAnswers).values({
    userId,
    jobId: jobId ?? null,
    savedJobId: savedJobId ?? null,
    resumeId: resumeId ?? null,
    sourceUrl: sourceUrl ?? null,
    atsProvider: atsProvider ?? null,
    formFields: fields,
    answers,
    jobDescription: jobDescription ?? null,
    status: status ?? "draft",
    submittedAt: status === "submitted" ? new Date() : null,
  } as any).returning({ id: schema.applicationFormAnswers.id });

  // If marking as submitted and a savedJob is linked, update pipeline status
  if (status === "submitted" && savedJobId) {
    await db.update(schema.savedJobs)
      .set({
        status: "applied",
        appliedAt: new Date(),
        statusChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.savedJobs.id, savedJobId),
        eq(schema.savedJobs.userId, userId),
      ))
      .catch(() => {}); // Non-critical
  }

  return c.json(success({ id: inserted?.id }), 201);
});

/**
 * GET /api/autofill/history
 * Paginated list of the user's form submissions.
 * Query: ?jobId=, ?page=1, ?limit=20
 */
autofillRoutes.get("/history", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20)));
  const jobId = c.req.query("jobId");
  const db = getDb();

  const conditions = [eq(schema.applicationFormAnswers.userId, userId)];
  if (jobId) conditions.push(eq(schema.applicationFormAnswers.jobId, jobId));

  const rows = await db.select({
    id: schema.applicationFormAnswers.id,
    sourceUrl: schema.applicationFormAnswers.sourceUrl,
    atsProvider: schema.applicationFormAnswers.atsProvider,
    status: schema.applicationFormAnswers.status,
    jobId: schema.applicationFormAnswers.jobId,
    createdAt: schema.applicationFormAnswers.createdAt,
    submittedAt: schema.applicationFormAnswers.submittedAt,
  })
    .from(schema.applicationFormAnswers)
    .where(and(...conditions))
    .orderBy(desc(schema.applicationFormAnswers.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  // Enrich with job title/company
  const enriched = [];
  for (const row of rows) {
    let jobTitle: string | undefined;
    let company: string | undefined;
    if (row.jobId) {
      const [job] = await db.select({ title: schema.jobItems.title, company: schema.jobItems.company })
        .from(schema.jobItems)
        .where(eq(schema.jobItems.id, row.jobId))
        .limit(1)
        .catch(() => []);
      jobTitle = job?.title;
      company = job?.company ?? undefined;
    }
    enriched.push({ ...row, jobTitle, company });
  }

  return c.json(success(enriched), 200);
});

/**
 * GET /api/autofill/history/:id
 * Single submission detail with full fields + answers.
 */
autofillRoutes.get("/history/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const id = c.req.param("id");
  const db = getDb();

  const [row] = await db.select()
    .from(schema.applicationFormAnswers)
    .where(and(
      eq(schema.applicationFormAnswers.id, id),
      eq(schema.applicationFormAnswers.userId, userId),
    ))
    .limit(1);

  if (!row) return c.json(error("NOT_FOUND", "Submission not found"), 404);

  // Enrich with job info
  let jobTitle: string | undefined;
  let company: string | undefined;
  if (row.jobId) {
    const [job] = await db.select({ title: schema.jobItems.title, company: schema.jobItems.company })
      .from(schema.jobItems)
      .where(eq(schema.jobItems.id, row.jobId))
      .limit(1)
      .catch(() => []);
    jobTitle = job?.title;
    company = job?.company ?? undefined;
  }

  return c.json(success({ ...row, jobTitle, company }), 200);
});

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
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({ answer: z.string().min(1).max(5000) }).safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const db = getDb();
  const [updated] = await db.update(schema.answerCache)
    .set({ answer: parsed.data.answer, updatedAt: new Date() })
    .where(and(eq(schema.answerCache.id, id), eq(schema.answerCache.userId, userId)))
    .returning({ id: schema.answerCache.id });

  if (!updated) return c.json(error("NOT_FOUND", "Cached answer not found"), 404);

  return c.json(success({ id: updated.id }), 200);
});

/**
 * DELETE /api/autofill/cache/:id
 * Delete a cached answer.
 */
autofillRoutes.delete("/cache/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const id = c.req.param("id");
  const db = getDb();

  const [deleted] = await db.delete(schema.answerCache)
    .where(and(eq(schema.answerCache.id, id), eq(schema.answerCache.userId, userId)))
    .returning({ id: schema.answerCache.id });

  if (!deleted) return c.json(error("NOT_FOUND", "Cached answer not found"), 404);

  return c.json(success({ id: deleted.id }), 200);
});

autofillRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Autofill endpoint not found" } }, 404),
);
