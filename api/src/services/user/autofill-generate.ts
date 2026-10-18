/**
 * Autofill answer generation use case (POST /api/autofill/generate):
 * assembles profile + résumé + job context and the user's answer cache,
 * runs `generateAnswers`, then records fresh AI answers back into the cache
 * in ONE multi-row upsert. Also the cache-manager list read.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { buildRepos } from "../../repositories/index.js";
import type { LLMClient } from "../adapters/llm-client.js";
import type { FormField } from "../../../../shared/autofill.js";
import { generateAnswers, hashQuestion, normalizeQuestion } from "./autofill.js";

export interface GenerateAutofillInput {
  /** Client-reported form fields (validated by the route's zod schema). */
  fields: Array<{
    id: string;
    label: string;
    type: string;
    name?: string;
    required: boolean;
    options?: string[];
    placeholder?: string;
    selector?: string;
    category?: string;
  }>;
  jobId?: string;
  jobDescription?: string;
  resumeId?: string;
  customInstructions?: string;
}

export async function generateAutofillAnswers(llm: LLMClient | null, userId: string, input: GenerateAutofillInput) {
  const { fields, jobId, jobDescription, resumeId, customInstructions } = input;
  const repos = buildRepos(getDb());

  const user = await repos.users.findById(userId);
  if (!user) throw new DomainError(404, "NOT_FOUND", "User not found");
  const profile = await repos.users.findProfileByUserId(userId);

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

  // Résumé: prefer the provided id, fall back to active/master/first.
  let resumeContent: any = null;
  if (resumeId) {
    const resume = await repos.resumes.findByIdForOwner(resumeId, userId);
    if (resume) resumeContent = resume.content;
  } else {
    const userResumes = await repos.resumes.findAllForOwner(userId);
    const active = userResumes.find((r) => r.isActive) ?? userResumes.find((r) => r.isMaster) ?? userResumes[0];
    if (active) resumeContent = active.content;
  }

  let jdText = jobDescription;
  if (!jdText && jobId) {
    const [job] = await repos.jobs.findJobBriefsByIds([jobId]);
    if (job) {
      jdText = `Title: ${job.title}\nCompany: ${job.company ?? "Unknown"}\n\n${job.description ?? ""}`;
    }
  }

  const cachedRows = await repos.autofill.findCachedAnswersForUser(userId).catch(() => []);
  const cachedAnswers = new Map<string, string>();
  for (const row of cachedRows) cachedAnswers.set(normalizeQuestion(row.questionText), row.answer);

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
  // then ONE multi-row upsert.
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
    await repos.autofill.recordGeneratedAnswers(userId, entries);
  } catch { /* Non-critical cache write — don't fail the request */ }

  return { answers: result.answers };
}

/** The user's cached answers for the cache manager (top 100, most-used first). */
export async function listAutofillCache(userId: string) {
  return buildRepos(getDb()).autofill.listCachedAnswersByUsage(userId, 100);
}
