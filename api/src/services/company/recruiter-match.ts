/**
 * Recruiter Match Scoring Service
 *
 * Handles background scoring of candidates against jobs and vice versa.
 * Called by the scheduled worker when processing queue items of type
 * `recruiter_score_candidates` and `recruiter_score_jobs`.
 *
 * Reuses the LLM calling pattern from match routes.
 */

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey, type LLMClient } from "../adapters/llm-client.js";
import { type ApiDeps, defaultApiDeps } from "../apiDeps.js";

/** Narrow Deps slice. Repo isn't surfaced for `extractedProfiles` yet, so
 *  the raw `db` handle stays in for that one read; the rest goes through
 *  repo + llm ports. `env` is injected so tests don't read c.env. */
export interface RecruiterMatchDeps {
  repos: ApiDeps["repos"];
  db: ReturnType<typeof getDb>;
  env: Readonly<Record<string, string | undefined>>;
}

const resolveDeps = (deps?: Partial<RecruiterMatchDeps>): RecruiterMatchDeps => {
  const api = defaultApiDeps();
  return {
    repos: deps?.repos ?? api.repos,
    db: deps?.db ?? getDb(),
    env: deps?.env ?? api.env,
  };
};

const ScoreResponseSchema = z.object({
  score: z.number().min(0).max(100),
  summaryRecommendations: z.string(),
});

/** Convert a resume / extracted-profile JSON blob to readable text. */
function profileToText(data: Record<string, unknown>): string {
  const parts: string[] = [];
  if (data.name) parts.push(`Name: ${data.name}`);
  if (data.title) parts.push(`Title: ${data.title}`);
  if (data.company) parts.push(`Company: ${data.company}`);
  if (data.location) parts.push(`Location: ${data.location}`);
  if (data.summary) parts.push(`Summary: ${data.summary}`);

  const skills = data.skills;
  if (Array.isArray(skills) && skills.length > 0) {
    parts.push(`Skills: ${skills.join(", ")}`);
  }

  const experience = data.experience;
  if (Array.isArray(experience)) {
    for (const exp of experience) {
      if (typeof exp === "object" && exp) {
        const e = exp as Record<string, unknown>;
        parts.push(
          `\nExperience: ${e.title ?? ""} at ${e.company ?? ""} (${e.duration ?? ""})`,
        );
        if (e.description) parts.push(String(e.description).slice(0, 500));
      }
    }
  }

  const education = data.education;
  if (Array.isArray(education)) {
    for (const edu of education) {
      if (typeof edu === "object" && edu) {
        const e = edu as Record<string, unknown>;
        parts.push(`Education: ${e.degree ?? ""} at ${e.institution ?? ""}`);
      }
    }
  }

  return parts.join("\n").slice(0, 6000) || JSON.stringify(data).slice(0, 4000);
}

/** Convert a job row to readable text for scoring. */
function jobToText(job: typeof schema.jobItems.$inferSelect): string {
  const parts: string[] = [];
  parts.push(`Title: ${job.title}`);
  if (job.company) parts.push(`Company: ${job.company}`);
  if (job.location) parts.push(`Location: ${job.location}`);
  if (job.jobType) parts.push(`Type: ${job.jobType}`);
  if (job.description) parts.push(`\nDescription:\n${job.description}`);

  const details = ((job as any).details ?? {}) as Record<string, unknown>;
  const stringify = (label: string, value: unknown) => {
    if (Array.isArray(value) && value.length > 0) {
      parts.push(`\n${label}:\n- ${value.map(String).join("\n- ")}`);
    }
  };
  stringify("Requirements", details.requirements);
  stringify("Qualifications", details.qualifications);

  if (Array.isArray(job.skillsRequired) && job.skillsRequired.length > 0) {
    parts.push(`\nSkills: ${(job.skillsRequired as string[]).join(", ")}`);
  }

  return parts.join("\n").slice(0, 6000);
}

/** Simple keyword-overlap fallback when no API key available. */
function heuristicScore(jobText: string, profileText: string): number {
  const jobWords = new Set(
    jobText
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4),
  );
  const profileWords = profileText
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4);
  const matches = profileWords.filter((w) => jobWords.has(w)).length;
  return Math.min(100, Math.round((matches / Math.max(jobWords.size, 1)) * 150));
}

/**
 * Score all of a recruiter's active talent pool candidates against a job.
 * Skips candidates that already have a score for this job.
 * Processes up to `batchSize` candidates per invocation.
 */
export async function scoreAllCandidatesForJob(
  recruiterId: string,
  jobId: string,
  env?: Record<string, unknown>,
  batchSize = 50,
  deps?: Partial<RecruiterMatchDeps>,
): Promise<{ scored: number; skipped: number }> {
  const d = resolveDeps(deps);
  const db = d.db;
  // `env` param kept as legacy compat with existing callers that pass
  // c.env directly; prefer `deps.env` for the DI path.
  const resolvedEnv = (env ?? d.env) as Record<string, string | undefined>;
  void resolvedEnv;

  // Load the job
  const [job] = await db
    .select()
    .from(schema.jobItems)
    .where(eq(schema.jobItems.id, jobId))
    .limit(1);
  if (!job) return { scored: 0, skipped: 0 };

  const jobText = jobToText(job);

  // Load recruiter's active candidates
  const candidates = await db
    .select()
    .from(schema.talentPoolCandidates)
    .where(
      and(
        eq(schema.talentPoolCandidates.recruiterId, recruiterId),
        eq(schema.talentPoolCandidates.status, "active"),
      ),
    );

  // Load existing scores to skip already-scored candidates
  const existingScores = await db
    .select({ candidateId: schema.recruiterMatchScores.candidateId })
    .from(schema.recruiterMatchScores)
    .where(
      and(
        eq(schema.recruiterMatchScores.recruiterId, recruiterId),
        eq(schema.recruiterMatchScores.jobId, jobId),
      ),
    );
  const scoredSet = new Set(existingScores.map((s) => s.candidateId));

  const toScore = candidates.filter((c) => !scoredSet.has(c.id)).slice(0, batchSize);
  const llm = buildBackgroundLLM(resolvedEnv, recruiterId);
  let scored = 0;

  // Extracted profiles for every candidate in this batch — ONE query (was
  // one per candidate). LLM scoring + the score insert stay per candidate.
  const profilesByCandidate = await loadExtractedProfiles(
    db,
    recruiterId,
    toScore.map((c) => c.id),
  );

  for (const candidate of toScore) {
    // Get extracted profile data if available
    const profile = profilesByCandidate.get(candidate.id);

    const profileData = (profile?.extractedData as Record<string, unknown>) ?? {
      name: candidate.candidateName,
      title: candidate.currentTitle ?? candidate.candidateTitle ?? "",
      company: candidate.currentCompany ?? "",
    };
    const profileText = profileToText(profileData);

    let score: number;
    let recommendations = "";

    if (llm) {
      try {
        const { data: result } = await llm.callJson(
          "recruiter_match_score_candidates",
          {
            useCase: "recruiter_match",
            systemPrompt:
              "You are a recruiter matching analyst. Score how well a candidate matches a job (0-100). Return JSON with score and brief recommendations.",
            userMessage: `Job:\n${jobText}\n\n---\n\nCandidate:\n${profileText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<2-3 sentences>" }`,
            responseFormat: "json_object",
          },
          ScoreResponseSchema,
        );
        score = result.score;
        recommendations = result.summaryRecommendations;
      } catch {
        score = heuristicScore(jobText, profileText);
        recommendations = `Keyword overlap score: ${score}/100`;
      }
    } else {
      score = heuristicScore(jobText, profileText);
      recommendations = `Keyword overlap score: ${score}/100`;
    }

    await db.insert(schema.recruiterMatchScores).values({
      recruiterId,
      jobId,
      candidateId: candidate.id,
      score,
      recommendations,
    } as any);
    scored++;
  }

  return { scored, skipped: scoredSet.size };
}

/** Extracted profile per talent-pool candidate for one recruiter, in ONE
 *  query. First row per candidate wins (mirrors the old `.limit(1)` read). */
async function loadExtractedProfiles(
  db: RecruiterMatchDeps["db"],
  recruiterId: string,
  candidateIds: string[],
): Promise<Map<string, typeof schema.extractedProfiles.$inferSelect>> {
  const out = new Map<string, typeof schema.extractedProfiles.$inferSelect>();
  if (candidateIds.length === 0) return out;
  const rows = await db
    .select()
    .from(schema.extractedProfiles)
    .where(
      and(
        eq(schema.extractedProfiles.recruiterId, recruiterId),
        inArray(schema.extractedProfiles.talentPoolCandidateId, candidateIds),
      ),
    );
  for (const r of rows) {
    if (r.talentPoolCandidateId && !out.has(r.talentPoolCandidateId)) out.set(r.talentPoolCandidateId, r);
  }
  return out;
}

/** Build an LLM client for background workers that don't have a real
 *  Hono context. The synthetic JwtPayload only needs `sub` (for billing)
 *  and `roles` — anonymous-shaped fields are zeroed. The client is null
 *  when no provider key is configured; callers fall back to keyword
 *  scoring in that case. */
function buildBackgroundLLM(
  env: Record<string, string | undefined>,
  userId: string,
): LLMClient | null {
  if (!hasAnyLLMProviderKey(env)) return null;
  const syntheticUser = {
    sub: userId,
    email: "",
    roles: [],
    emailVerified: true,
    mustChangePassword: false,
  };
  return createLLMClient(env, syntheticUser);
}

/**
 * Score a single candidate against all of a recruiter's tracked jobs.
 * Skips jobs that already have a score for this candidate.
 */
export async function scoreAllJobsForCandidate(
  recruiterId: string,
  candidateId: string,
  env?: Record<string, unknown>,
  batchSize = 50,
  deps?: Partial<RecruiterMatchDeps>,
): Promise<{ scored: number; skipped: number }> {
  const d = resolveDeps(deps);
  const db = d.db;
  const resolvedEnv = (env ?? d.env) as Record<string, string | undefined>;
  void resolvedEnv;

  // Load the candidate
  const [candidate] = await db
    .select()
    .from(schema.talentPoolCandidates)
    .where(
      and(
        eq(schema.talentPoolCandidates.id, candidateId),
        eq(schema.talentPoolCandidates.recruiterId, recruiterId),
      ),
    )
    .limit(1);
  if (!candidate) return { scored: 0, skipped: 0 };

  // Get extracted profile data
  const [profile] = await db
    .select()
    .from(schema.extractedProfiles)
    .where(
      and(
        eq(schema.extractedProfiles.recruiterId, recruiterId),
        eq(schema.extractedProfiles.talentPoolCandidateId, candidateId),
      ),
    )
    .limit(1);

  const profileData = (profile?.extractedData as Record<string, unknown>) ?? {
    name: candidate.candidateName,
    title: candidate.currentTitle ?? candidate.candidateTitle ?? "",
    company: candidate.currentCompany ?? "",
  };
  const profileText = profileToText(profileData);

  // Load recruiter's tracked/saved jobs
  const savedJobRows = await db
    .select({ jobId: schema.savedJobs.jobId })
    .from(schema.savedJobs)
    .where(eq(schema.savedJobs.userId, recruiterId));

  if (savedJobRows.length === 0) return { scored: 0, skipped: 0 };

  const jobIds = savedJobRows.map((r) => r.jobId);

  // Load existing scores to skip
  const existingScores = await db
    .select({ jobId: schema.recruiterMatchScores.jobId })
    .from(schema.recruiterMatchScores)
    .where(
      and(
        eq(schema.recruiterMatchScores.recruiterId, recruiterId),
        eq(schema.recruiterMatchScores.candidateId, candidateId),
      ),
    );
  const scoredSet = new Set(existingScores.map((s) => s.jobId));

  const toScoreIds = jobIds.filter((id) => !scoredSet.has(id)).slice(0, batchSize);
  if (toScoreIds.length === 0) return { scored: 0, skipped: scoredSet.size };

  const llm = buildBackgroundLLM(resolvedEnv, recruiterId);
  let scored = 0;

  // Every job in this batch in ONE query (was one SELECT per job). LLM
  // scoring + the score insert stay per job, in the original order.
  const jobsById = new Map(
    (await d.repos.jobs.findJobsByIds(toScoreIds)).map((j) => [j.id, j]),
  );

  for (const jobId of toScoreIds) {
    const job = jobsById.get(jobId);
    if (!job) continue;

    const jobText = jobToText(job);
    let score: number;
    let recommendations = "";

    if (llm) {
      try {
        const { data: result } = await llm.callJson(
          "recruiter_match_score_jobs",
          {
            useCase: "recruiter_match",
            systemPrompt:
              "You are a recruiter matching analyst. Score how well a candidate matches a job (0-100). Return JSON with score and brief recommendations.",
            userMessage: `Job:\n${jobText}\n\n---\n\nCandidate:\n${profileText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<2-3 sentences>" }`,
            responseFormat: "json_object",
          },
          ScoreResponseSchema,
        );
        score = result.score;
        recommendations = result.summaryRecommendations;
      } catch {
        score = heuristicScore(jobText, profileText);
        recommendations = `Keyword overlap score: ${score}/100`;
      }
    } else {
      score = heuristicScore(jobText, profileText);
      recommendations = `Keyword overlap score: ${score}/100`;
    }

    await db.insert(schema.recruiterMatchScores).values({
      recruiterId,
      jobId,
      candidateId,
      score,
      recommendations,
    } as any);
    scored++;
  }

  return { scored, skipped: scoredSet.size };
}
