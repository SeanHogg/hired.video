/**
 * POST /api/interview-assignments/generate use case — resolve the source
 * (résumé / saved job / pasted text / bare target role), extract skills,
 * and have the LLM build interview questions. No DB writes.
 */
import { getDb } from "../../db/index.js";
import type { Env, JwtPayload } from "../../types/index.js";
import type { ResumeContent } from "../../../../shared/resume.js";
import { buildRepos } from "../../repositories/index.js";
import { hasAnyLLMProviderKey, createLLMClient } from "../adapters/llm-client.js";
import { extractSkills, type SkillExtractInput, type Skill } from "../resume/skills.js";
import { parsedJobFromRow } from "../job/match-handlers.js";
import { generateQuestionsFromSkills, type GeneratedQuestion } from "./question-generator.js";
import { failWith, succeed, type AssignmentResult } from "./assignment-result.js";

export interface GenerateQuestionsInput {
  resumeId?: string;
  jobId?: string;
  content?: string;
  sourceType?: "job" | "resume";
  targetRole?: string;
  seniority?: string;
  style: "behavioral" | "technical" | "mixed";
  count: number;
  sourceContext: "tool" | "ai-coach" | "career-360" | "pipeline";
}

export interface GenerateQuestionsOutput {
  skills: Skill[];
  questions: GeneratedQuestion[];
  sourceContext: GenerateQuestionsInput["sourceContext"];
  sourceResumeId: string | null;
  sourceJobId: string | null;
  targetRole: string | null;
  sourceDescription: string | null;
}

interface ResolvedSource {
  skillInput: SkillExtractInput;
  /** Best-guess target role for the AI Coach hand-off + LLM prompt.
   *  Used only when the caller didn't pass one explicitly; the JD title
   *  wins for jobs, the most-recent work entry's position for resumes. */
  resolvedTargetRole: string | null;
  /** Human-readable provenance shown in the practise prompt so the LLM
   *  doesn't have to ask the candidate what the questions are based on. */
  sourceDescription: string | null;
}

function stringField(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v ? v : null;
}

async function resolveSource(
  userId: string,
  input: GenerateQuestionsInput,
): Promise<AssignmentResult<ResolvedSource>> {
  if (input.resumeId) {
    const repos = buildRepos(getDb());
    const row = await repos.resumes.findByIdForOwner(input.resumeId, userId);
    if (!row?.content) return failWith(404, "NOT_FOUND", "Resume not found");
    const content = row.content as ResumeContent;
    const recentTitle =
      (Array.isArray(content?.work) && (content.work as Array<{ position?: string }>)[0]?.position) || null;
    const label = stringField(row as unknown as Record<string, unknown>, "title") ?? "your resume";
    return succeed({
      skillInput: { kind: "resume-json", content },
      resolvedTargetRole: typeof recentTitle === "string" ? recentTitle : null,
      sourceDescription: `your resume "${label}"`,
    });
  }
  if (input.jobId) {
    const repos = buildRepos(getDb());
    const row = await repos.jobs.findJobById(input.jobId);
    if (!row) return failWith(404, "NOT_FOUND", "Job not found");
    const jobRow = row as unknown as Record<string, unknown>;
    const job = parsedJobFromRow(jobRow);
    const jobTitle = typeof job?.title === "string" ? job.title : null;
    const company = stringField(jobRow, "company") ?? stringField(jobRow, "companyName");
    return succeed({
      skillInput: { kind: "job-json", job },
      resolvedTargetRole: jobTitle,
      sourceDescription: jobTitle
        ? `the JD for ${jobTitle}${company ? ` at ${company}` : ""}`
        : "the saved job description",
    });
  }
  if (input.content) {
    return succeed({
      skillInput: { kind: "text", sourceType: input.sourceType ?? "resume", text: input.content },
      resolvedTargetRole: null,
      sourceDescription: input.sourceType === "job" ? "the pasted job description" : "the pasted resume",
    });
  }
  // Pure-targetRole path — skill list stays empty; prompt rebalances to "role-fit".
  return succeed({
    skillInput: { kind: "text", sourceType: "job", text: input.targetRole ?? "" },
    resolvedTargetRole: input.targetRole ?? null,
    sourceDescription: input.targetRole ? `the target role "${input.targetRole}"` : null,
  });
}

export async function generateInterviewQuestions(
  env: Env,
  user: JwtPayload,
  input: GenerateQuestionsInput,
): Promise<AssignmentResult<GenerateQuestionsOutput>> {
  const source = await resolveSource(user.sub, input);
  if (!source.ok) return source;

  const llm = hasAnyLLMProviderKey(env) ? createLLMClient(env, user) : null;

  // Pure-target path — caller supplied targetRole only with no resume/job/
  // content. Skip extraction and let the LLM build role-fit questions from
  // the title alone (skills array is empty, prompt rebalances to "role-fit").
  let skills: Skill[] = [];
  if (input.resumeId || input.jobId || input.content) {
    const extracted = await extractSkills(llm, source.data.skillInput);
    skills = extracted.skills;
  }

  // User-supplied targetRole wins; otherwise fall back to whatever the
  // source resolution produced (JD title / resume most-recent role).
  const effectiveTargetRole = input.targetRole?.trim() || source.data.resolvedTargetRole || null;

  const questions = await generateQuestionsFromSkills(env, user, {
    skills,
    targetRole: effectiveTargetRole ?? undefined,
    seniority: input.seniority,
    style: input.style,
    count: input.count,
  });

  return succeed({
    skills,
    questions,
    sourceContext: input.sourceContext,
    sourceResumeId: input.resumeId ?? null,
    sourceJobId: input.jobId ?? null,
    targetRole: effectiveTargetRole,
    sourceDescription: source.data.sourceDescription,
  });
}
