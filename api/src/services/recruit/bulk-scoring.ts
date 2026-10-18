/**
 * Synchronous bulk résumé scoring (heuristic v1, no LLM): skill overlap +
 * title-keyword + description-token match of N candidate résumés against a
 * job, ranked. Only résumés of the caller's own companies are scored.
 */
import { DomainError } from "../../domains/errors.js";
import { getDb } from "../../db/index.js";
import { JobsRepository } from "../../repositories/jobsRepository.js";
import { findCandidateResumeContentsForCompanies } from "../../repositories/candidateResumesRepository.js";
import { getUserCompanyIds } from "../company/scope.js";
import { resumeSkillNames } from "../job/match-skills.js";

export interface ScoringWeights {
  skill: number;
  title: number;
  description: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = { skill: 70, title: 20, description: 10 };

export interface ScoreResult {
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

function extractResumeSkills(content: unknown): string[] {
  return resumeSkillNames(content).map((s) => s.toLowerCase());
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

export async function bulkScoreResumes(
  userId: string,
  input: { jobId: string; resumeIds: string[]; weights?: Partial<ScoringWeights> },
) {
  // Job must exist; description + skillsRequired drive the comparison.
  const job = await new JobsRepository(getDb()).findJobScoringBrief(input.jobId);
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found");

  // Job's required skills + description tokens make up the target keyword set.
  const jobSkills = Array.isArray(job.skillsRequired)
    ? (job.skillsRequired as unknown[])
        .map((s) => (typeof s === "string" ? s : (s as any)?.name))
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.toLowerCase().trim())
    : [];
  const jobDescTokens = new Set(tokenize(job.description));
  const jobTitleTokens = new Set(tokenize(job.title));

  const resumes = await findCandidateResumeContentsForCompanies(input.resumeIds, await getUserCompanyIds(userId));

  const weights: ScoringWeights = {
    skill: input.weights?.skill ?? DEFAULT_WEIGHTS.skill,
    title: input.weights?.title ?? DEFAULT_WEIGHTS.title,
    description: input.weights?.description ?? DEFAULT_WEIGHTS.description,
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

  return {
    jobId: job.id,
    jobTitle: job.title,
    jobSkillCount: jobSkills.length,
    weights,
    results,
    scored: results.length,
  };
}

/** Pure scoring function — exported so it can be unit-tested or swapped
 *  for an LLM strategy later without touching the use case. */
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
