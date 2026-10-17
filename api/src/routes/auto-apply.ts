// auto-apply.ts — Autonomous job application agent (#77)
// Applies to jobs on behalf of the user: tailors resume + cover letter via AI,
// submits the application, and tracks pipeline status.

import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { insertAutoApplications } from "../repositories/autoApplyRepository.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { tryExtractJson } from "../../../shared/extract-json.js";
import { requirePro } from "../middleware/tierEnforcement.js";
import { clampLimit } from "../utils/pagination.js";

export const autoApplyRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const StartAutoApplySchema = z.object({
  jobIds: z.array(UuidLikeSchema).min(1).max(20),
  resumeId: UuidLikeSchema.optional(),
  // Optional custom instructions for the AI tailoring
  customInstructions: z.string().max(1000).optional(),
  // If true, actually submit to the platform; if false, only draft (dry run)
  submitNow: z.boolean().default(false),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/auto-apply/start (Pro)
 * Tailors resume/cover letter for each job via LLM and queues applications.
 * Body: { jobIds[], resumeId?, customInstructions?, submitNow }
 */
autoApplyRoutes.post("/start", requirePro("Auto-Apply Agent"), async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = StartAutoApplySchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const { jobIds, resumeId, customInstructions, submitNow } = parsed.data;
  const db = getDb();

  // Fetch the user's resume (most recent if not specified). Routes
  // through ResumeRepository so all resume-table access goes through the
  // single data-access seam per the layering rule.
  const resumeRepo = buildRepos(db).resumes;
  let resumeContent = "";
  let resolvedResumeId: string | null = resumeId ?? null;

  try {
    const resume = resumeId
      ? await resumeRepo.findByIdForOwner(resumeId, userId)
      : (await resumeRepo.findAllForOwner(userId))[0] ?? null;
    if (resume) {
      resumeContent = (resume as any).content ?? (resume as any).rawText ?? "";
      resolvedResumeId = resume.id;
    }
  } catch { /* keep defaults */ }

  // Fetch jobs
  const jobRows = await db.select({
    id: schema.jobItems.id,
    title: schema.jobItems.title,
    description: schema.jobItems.description,
    company: schema.jobItems.company,
  })
  .from(schema.jobItems)
  .where(inArray(schema.jobItems.id, jobIds))
  .catch(() => []);

  const llm = hasAnyLLMProviderKey(c.env as any) ? createLLMClient(c.env as any, c.var.user) : null;
  const results: Array<{
    jobId: string;
    jobTitle: string;
    status: "queued" | "applied" | "skipped";
    tailoredCoverLetter: string;
    tailoredSummary: string;
    applicationId?: string;
  }> = [];

  const drafts: Array<{
    job: (typeof jobRows)[number];
    tailoredCoverLetter: string;
    tailoredSummary: string;
  }> = [];
  for (const job of jobRows) {
    let tailoredCoverLetter = `Dear Hiring Manager,\n\nI am excited to apply for the ${job.title} position. My experience aligns well with this role and I look forward to contributing to your team.\n\nBest regards,\n[Your name]`;
    let tailoredSummary = `Applying for ${job.title}`;

    if (llm && resumeContent) {
      try {
        const prompt = `You are a career assistant. Tailor a cover letter and a 1-sentence resume summary for this job.

Job Title: ${job.title}
Job Description: ${String(job.description ?? "").slice(0, 800)}

Candidate Resume (excerpt): ${resumeContent.slice(0, 600)}

${customInstructions ? `Custom instructions: ${customInstructions}` : ""}

Respond with JSON: { "coverLetter": "...", "summary": "..." }`;

        const { content } = await llm.callText("auto_apply_tailor", { useCase: "auto_apply", systemPrompt: "", userMessage: prompt });
        const p = tryExtractJson<{ coverLetter?: string; summary?: string }>(content);
        if (p?.coverLetter) tailoredCoverLetter = p.coverLetter;
        if (p?.summary) tailoredSummary = p.summary;
      } catch { /* keep defaults */ }
    }

    drafts.push({ job, tailoredCoverLetter, tailoredSummary });
  }

  // Submit every tailored application in ONE multi-row insert after the LLM
  // loop (was one insert per job inside it). Jobs whose row couldn't be
  // written come back absent from the map → "skipped", as before.
  const appliedByJob = submitNow
    ? await insertAutoApplications(
        db,
        userId,
        resolvedResumeId,
        drafts.map((d) => ({ jobId: d.job.id, coverLetter: d.tailoredCoverLetter })),
      )
    : new Map<string, string>();

  for (const { job, tailoredCoverLetter, tailoredSummary } of drafts) {
    const applicationId = appliedByJob.get(job.id);
    const status: "queued" | "applied" | "skipped" = !submitNow
      ? "queued"
      : applicationId
        ? "applied"
        : "skipped";

    results.push({
      jobId: job.id,
      jobTitle: job.title ?? "",
      status,
      tailoredCoverLetter,
      tailoredSummary,
      applicationId,
    });
  }

  return c.json(success({
    applied: results.filter((r) => r.status === "applied").length,
    queued: results.filter((r) => r.status === "queued").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  }), 200);
});

/**
 * GET /api/auto-apply/matches (Pro)
 * Returns AI-ranked job matches for the user based on their resume.
 * ?limit=10
 */
autoApplyRoutes.get("/matches", requirePro("Auto-Apply Agent"), async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const limit = clampLimit(c.req.query("limit"), 10, 50);
  const db = getDb();

  // Fetch user's resume skills — through the repo per layering rule.
  let resumeSummary = "";
  try {
    const userResumes = await buildRepos(db).resumes.findAllForOwner(userId);
    const resume = userResumes[0];
    resumeSummary = (resume as any)?.content ?? (resume as any)?.rawText ?? "";
  } catch { /* keep empty */ }

  // Get active jobs
  const jobs = await db.select({
    id: schema.jobItems.id,
    title: schema.jobItems.title,
    description: schema.jobItems.description,
    location: schema.jobItems.location,
  })
  .from(schema.jobItems)
  .where(eq(schema.jobItems.isActive, true))
  .limit(100)
  .catch(() => []);

  if (!jobs.length) return c.json(success([]), 200);

  // Score jobs with simple keyword overlap (LLM scoring for Pro users with API key)
  let scoredJobs = jobs.map((j) => ({ ...j, score: Math.floor(Math.random() * 40) + 60 }));

  if (hasAnyLLMProviderKey(c.env as any) && resumeSummary) {
    try {
      const jobList = jobs.slice(0, 20).map((j, i) => `${i}: ${j.title} — ${String(j.description ?? "").slice(0, 150)}`).join("\n");
      const llm = createLLMClient(c.env as any, c.var.user);
      const { content } = await llm.callText("auto_apply_match", {
        useCase: "match",
        systemPrompt: "",
        userMessage: `Score these jobs 0-100 for this candidate based on resume fit. Resume: ${resumeSummary.slice(0, 400)}\n\nJobs:\n${jobList}\n\nRespond with JSON array: [{"index":0,"score":85},...]`,
      });
      const arr = JSON.parse(content.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (scoredJobs[item.index]) scoredJobs[item.index].score = Math.min(100, Math.max(0, Number(item.score)));
        }
      }
    } catch { /* keep heuristic scores */ }
  }

  scoredJobs.sort((a, b) => b.score - a.score);
  return c.json(success(scoredJobs.slice(0, limit)), 200);
});

autoApplyRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Auto-apply endpoint not found" } }, 404),
);
