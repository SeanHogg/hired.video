/**
 * Synchronous bulk resume scoring — recruiter selects N candidate resumes
 * and a target job, gets a ranked score per resume in a single response.
 *
 * Heuristic-based v1 (no LLM call): scores skill overlap and title-keyword
 * match. Predictable + free; the existing /api/recruiter/match/score-candidates
 * queue path is for richer LLM scoring when the user wants that.
 *
 * Closes audit gap #5 (bulk resume scoring & screening was missing).
 */
import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const bulkScoringRoutes = new Hono<{ Variables: Variables }>();

const BulkScoreSchema = z.object({
  resumeIds: z.array(z.string().uuid()).min(1).max(200),
  jobId: z.string().uuid(),
  /** Optional weight overrides — defaults sum to 100 to keep the score
   *  capped at 0–100. The frontend doesn't expose these yet; they exist
   *  so a future Strategy / config-driven scorer can swap in cleanly. */
  weights: z
    .object({
      skill: z.number().min(0).max(100).default(70),
      title: z.number().min(0).max(100).default(20),
      description: z.number().min(0).max(100).default(10),
    })
    .optional(),
});

interface ScoringWeights {
  skill: number;
  title: number;
  description: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = { skill: 70, title: 20, description: 10 };

interface ScoreResult {
  resumeId: string;
  candidateName: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  titleMatch: boolean;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were",
]);

function tokenize(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function extractResumeSkills(content: any): string[] {
  if (!content || typeof content !== "object") return [];
  const skills: string[] = [];
  // JSON Resume style
  if (Array.isArray(content.skills)) {
    for (const s of content.skills) {
      if (typeof s === "string") skills.push(s);
      else if (s && typeof s === "object") {
        if (typeof s.name === "string") skills.push(s.name);
        if (Array.isArray(s.keywords)) for (const k of s.keywords) if (typeof k === "string") skills.push(k);
      }
    }
  }
  return skills.map((s) => s.toLowerCase().trim()).filter(Boolean);
}

function extractResumeTitles(content: any): string[] {
  if (!content || typeof content !== "object") return [];
  const titles: string[] = [];
  if (content.basics?.label) titles.push(String(content.basics.label));
  if (Array.isArray(content.work)) {
    for (const w of content.work) if (w && typeof w.position === "string") titles.push(w.position);
  }
  return titles.map((t) => t.toLowerCase());
}

function extractCandidateName(content: any, label: string | null): string {
  if (label) return label;
  if (content?.basics?.name) return String(content.basics.name);
  return "Unnamed candidate";
}

bulkScoringRoutes.post("/score", async (c) => {
  const userId = c.var.user?.sub;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = BulkScoreSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid bulk score request", parsed.error.flatten()), 400);
  }

  const db = getDb();

  // Job must exist; description + skillsRequired drive the comparison.
  const [job] = await db
    .select({
      id: schema.jobItems.id,
      title: schema.jobItems.title,
      description: schema.jobItems.description,
      skillsRequired: schema.jobItems.skillsRequired,
    })
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, parsed.data.jobId))
    .limit(1);

  if (!job) return c.json(error("NOT_FOUND", "Job not found"), 404);

  // Job's required skills + description tokens make up the target keyword set.
  const jobSkills = Array.isArray(job.skillsRequired)
    ? (job.skillsRequired as unknown[])
        .map((s) => (typeof s === "string" ? s : (s as any)?.name))
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.toLowerCase().trim())
    : [];
  const jobDescTokens = new Set(tokenize(job.description));
  const jobTitleTokens = new Set(tokenize(job.title));
  const jobSkillSet = new Set(jobSkills);

  const resumes = await db
    .select({
      id: schema.candidateResumes.id,
      label: schema.candidateResumes.label,
      content: schema.candidateResumes.content,
    })
    .from(schema.candidateResumes)
    .where(inArray(schema.candidateResumes.id, parsed.data.resumeIds));

  const weights: ScoringWeights = {
    skill: parsed.data.weights?.skill ?? DEFAULT_WEIGHTS.skill,
    title: parsed.data.weights?.title ?? DEFAULT_WEIGHTS.title,
    description: parsed.data.weights?.description ?? DEFAULT_WEIGHTS.description,
  };

  const results: ScoreResult[] = resumes.map((r) =>
    scoreOne({
      resume: { id: r.id, label: r.label, content: r.content },
      jobSkills,
      jobTitleTokens,
      jobDescTokens,
      weights,
    }),
  );

  results.sort((a, b) => b.score - a.score);

  return c.json(
    success({
      jobId: job.id,
      jobTitle: job.title,
      jobSkillCount: jobSkills.length,
      weights,
      results,
      scored: results.length,
    }),
    200,
  );
});

/** Pure scoring function — exported so it can be unit-tested or swapped
 *  for an LLM strategy later without touching the route handler. */
export function scoreOne(input: {
  resume: { id: string; label: string | null; content: any };
  jobSkills: string[];
  jobTitleTokens: Set<string>;
  jobDescTokens: Set<string>;
  weights: ScoringWeights;
}): ScoreResult {
  const { resume, jobSkills, jobTitleTokens, jobDescTokens, weights } = input;
  const resumeSkills = new Set(extractResumeSkills(resume.content));
  const resumeTitles = extractResumeTitles(resume.content);

  const matchedSkills = jobSkills.filter((s) => resumeSkills.has(s));
  const missingSkills = jobSkills.filter((s) => !resumeSkills.has(s));
  const skillScore =
    jobSkills.length > 0 ? (matchedSkills.length / jobSkills.length) * weights.skill : weights.skill / 2;

  const titleMatch = resumeTitles.some((t) => {
    const tokens = tokenize(t);
    return tokens.some((tok) => jobTitleTokens.has(tok));
  });
  const titleScore = titleMatch ? weights.title : 0;

  let descOverlap = 0;
  for (const skill of resumeSkills) {
    for (const tok of tokenize(skill)) {
      if (jobDescTokens.has(tok)) descOverlap += 1;
    }
  }
  const descScore = Math.min(weights.description, descOverlap);

  return {
    resumeId: resume.id,
    candidateName: extractCandidateName(resume.content, resume.label),
    score: Math.round(skillScore + titleScore + descScore),
    matchedSkills,
    missingSkills: missingSkills.slice(0, 8),
    titleMatch,
  };
}
