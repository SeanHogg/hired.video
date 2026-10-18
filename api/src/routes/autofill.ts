// autofill.ts — Application form analysis and AI answer generation (#autofill)
// Endpoints for analyzing forms (HTML or raw questions), generating answers
// using the user's profile/resume/job context, saving submissions, and
// managing the per-user answer cache.

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { analyzeForm } from "../services/user/autofill.js";
import { generateAutofillAnswers, listAutofillCache } from "../services/user/autofill-generate.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { parsePagination } from "../utils/pagination.js";
import {
  defaultAutofillDeps as autofillDeps,
  handleDeleteCacheEntry,
  handleHistoryDetail,
  handleHistoryList,
  handleSaveSubmission,
  handleUpdateCacheEntry,
} from "../services/user/autofill-handlers.js";
import { sendHandlerResult, requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const autofillRoutes = new Hono<AppEnv>();
autofillRoutes.use("*", attachTokenBudget());

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
autofillRoutes.post("/analyze", validateJson(AnalyzeFormSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const body = c.req.valid("json");

  const llm = hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null;
  const result = await analyzeForm(llm, body);

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
autofillRoutes.post("/generate", validateJson(GenerateAnswersSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const body = c.req.valid("json");

  const llm = hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null;
  return c.json(success(await generateAutofillAnswers(llm, userId, body)), 200);
});

/**
 * POST /api/autofill/save
 * Save a completed form submission with answers.
 */
autofillRoutes.post("/save", async (c) => {
  const body = await c.req.json().catch(() => null);
  return sendHandlerResult(c, await handleSaveSubmission(autofillDeps(), c.var.userId, body));
});

/**
 * GET /api/autofill/history
 * Paginated list of the user's form submissions.
 * Query: ?jobId=, ?page=1, ?limit=20
 */
autofillRoutes.get("/history", async (c) => {
  const userId = requireUser(c);

  const { page, limit } = parsePagination(c, { defaultLimit: 20, maxLimit: 50 });
  const jobId = c.req.query("jobId");
  return sendHandlerResult(c, await handleHistoryList(autofillDeps(), userId, { page, limit, jobId }));
});

/**
 * GET /api/autofill/history/:id
 * Single submission detail with full fields + answers.
 */
autofillRoutes.get("/history/:id", async (c) =>
  sendHandlerResult(c, await handleHistoryDetail(autofillDeps(), c.var.userId, c.req.param("id"))),
);

/**
 * GET /api/autofill/cache
 * List the user's cached answers, ordered by most-used.
 */
autofillRoutes.get("/cache", async (c) => {
  const userId = requireUser(c);

  const rows = await listAutofillCache(userId);
  return c.json(success(rows), 200);
});

/**
 * PUT /api/autofill/cache/:id
 * Update a cached answer.
 */
autofillRoutes.put("/cache/:id", async (c) => {
  const body = await c.req.json().catch(() => null);
  return sendHandlerResult(c, await handleUpdateCacheEntry(autofillDeps(), c.var.userId, c.req.param("id"), body));
});

/**
 * DELETE /api/autofill/cache/:id
 * Delete a cached answer.
 */
autofillRoutes.delete("/cache/:id", async (c) =>
  sendHandlerResult(c, await handleDeleteCacheEntry(autofillDeps(), c.var.userId, c.req.param("id"))),
);
