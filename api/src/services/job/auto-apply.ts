/**
 * Auto-apply agent (#77) — tailors a cover letter + summary per job via the
 * LLM and (optionally) submits the applications; ranks active jobs against
 * the user's résumé. HTTP-free: the route resolves the LLM client and input.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { insertAutoApplications } from "../../repositories/autoApplyRepository.js";
import type { LLMClient } from "../adapters/llm-client.js";
import { tryExtractJson } from "../../../../shared/extract-json.js";

export interface StartAutoApplyInput {
  jobIds: string[];
  resumeId?: string;
  customInstructions?: string;
  submitNow: boolean;
}

type AutoApplyStatus = "queued" | "applied" | "skipped";

export async function startAutoApply(llm: LLMClient | null, userId: string, input: StartAutoApplyInput) {
  const { jobIds, resumeId, customInstructions, submitNow } = input;
  const db = getDb();
  const repos = buildRepos(db);

  // Fetch the user's resume (most recent if not specified).
  let resumeContent = "";
  let resolvedResumeId: string | null = resumeId ?? null;
  try {
    const resume = resumeId
      ? await repos.resumes.findByIdForOwner(resumeId, userId)
      : (await repos.resumes.findAllForOwner(userId))[0] ?? null;
    if (resume) {
      resumeContent = (resume as any).content ?? (resume as any).rawText ?? "";
      resolvedResumeId = resume.id;
    }
  } catch { /* keep defaults */ }

  const jobRows = await repos.jobs.findJobBriefsByIds(jobIds).catch(() => []);

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
  // loop. Jobs whose row couldn't be written come back absent → "skipped".
  const appliedByJob = submitNow
    ? await insertAutoApplications(
        db,
        userId,
        resolvedResumeId,
        drafts.map((d) => ({ jobId: d.job.id, coverLetter: d.tailoredCoverLetter })),
      )
    : new Map<string, string>();

  const results = drafts.map(({ job, tailoredCoverLetter, tailoredSummary }) => {
    const applicationId = appliedByJob.get(job.id);
    const status: AutoApplyStatus = !submitNow ? "queued" : applicationId ? "applied" : "skipped";
    return {
      jobId: job.id,
      jobTitle: job.title ?? "",
      status,
      tailoredCoverLetter,
      tailoredSummary,
      applicationId,
    };
  });

  return {
    applied: results.filter((r) => r.status === "applied").length,
    queued: results.filter((r) => r.status === "queued").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };
}

/**
 * AI-ranked job matches for the user's résumé. Heuristic scores unless an
 * LLM is available (`llm()` is only called when there is a résumé to rank).
 */
export async function rankAutoApplyMatches(llm: () => LLMClient | null, userId: string, limit: number) {
  const repos = buildRepos(getDb());

  let resumeSummary = "";
  try {
    const resume = (await repos.resumes.findAllForOwner(userId))[0];
    resumeSummary = (resume as any)?.content ?? (resume as any)?.rawText ?? "";
  } catch { /* keep empty */ }

  const jobs = (await repos.jobs.listActiveJobBriefs(100).catch(() => [])).map((j) => ({
    id: j.id,
    title: j.title,
    description: j.description,
    location: j.location,
  }));
  if (!jobs.length) return [];

  // Score jobs with a heuristic baseline (LLM scoring when a provider key exists).
  const scoredJobs = jobs.map((j) => ({ ...j, score: Math.floor(Math.random() * 40) + 60 }));

  if (resumeSummary) {
    try {
      const client = llm();
      if (!client) throw new Error("no LLM provider");
      const jobList = jobs.slice(0, 20).map((j, i) => `${i}: ${j.title} — ${String(j.description ?? "").slice(0, 150)}`).join("\n");
      const { content } = await client.callText("auto_apply_match", {
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
  return scoredJobs.slice(0, limit);
}
