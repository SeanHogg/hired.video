// Read-only résumé / job analysis runners (score, optimize, sentiment,
// summarize, tailor, skills, interview questions, job match). Each calls the
// AI tool dispatcher (`aiToolPath`) or its typed service and projects the
// payload into the shared NormalizedToolRunResult card shape.

import { aiToolPath } from "@shared/ai-tools/tool-ids";
import { apiClient } from "@/lib/api-client";
import { matchService } from "@/lib/services/match-service";
import { sentimentService } from "@/lib/services/sentiment-service";
import { resolveResumeText } from "../resume-content";
import { jobLabel } from "../job-label";
import type { NormalizedToolRunResult, ToolRunContext } from "../types";
import { asNumber, asRecord, asString, asStringArray, toRecommendations } from "./shared";

/** Project the merged ResumeAnalysis payload into the chat-card
 *  NormalizedToolRunResult shape. Both the Scorer and the Optimizer
 *  run() go through this — same backend service, same projection. */
function normalizeAnalysisPayload(payload: unknown): NormalizedToolRunResult {
  const data = asRecord(payload);
  const categories: Array<[string, unknown]> = [
    ["ATS Compatibility", data.atsScore],
    ["Content Quality", data.contentScore],
    ["Keywords", data.keywordScore],
    ["Format", data.formatScore],
    ["Impact", data.impactScore],
  ];
  return {
    overallScore: asNumber(data.overallScore),
    grade: typeof data.grade === "string" ? data.grade : undefined,
    categoryScores: categories.flatMap(([label, score]) => (typeof score === "number" ? [{ label, score }] : [])),
    strengths: asStringArray(data.strengths),
    weaknesses: asStringArray(data.weaknesses),
    recommendations: toRecommendations(data.recommendations),
    raw: payload,
  };
}

export async function runScorer(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const resumeText = await resolveResumeText(ctx);
  const { data } = await apiClient.post<unknown>(aiToolPath("resume-score"), {
    resumeText,
    resumeId: ctx.bound.resumeId,
  });
  return normalizeAnalysisPayload(data);
}

export async function runOptimizer(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const resumeText = await resolveResumeText(ctx);
  const { data } = await apiClient.post<unknown>(aiToolPath("resume-optimize"), {
    resumeText,
    resumeId: ctx.bound.resumeId,
    jobDescription: asString(ctx.args.jobDescription),
  });
  return normalizeAnalysisPayload(data);
}

export async function runSentiment(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const { resumeId } = ctx.bound;
  const score = resumeId
    ? await sentimentService.analyzeResumeSentiment(resumeId)
    : await sentimentService.analyzeSentiment(asString(ctx.args.resumeText) ?? "");
  const interpretation = sentimentService.interpretSentiment(score);
  return {
    overallScore: score,
    grade: interpretation.label,
    summary: interpretation.description,
    recommendations: interpretation.recommendations.map((title) => ({ title })),
    raw: { score, interpretation },
  };
}

export async function runSummarize(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const { resumeId } = ctx.bound;
  const { data } = await apiClient.post<unknown>(
    aiToolPath("resume-summarize"),
    resumeId ? { resumeId } : { resumeText: asString(ctx.args.resumeText) },
  );
  const record = asRecord(data);
  const summary = typeof data === "string" ? data : (record.result ?? record.summary ?? "");
  return { summary: String(summary ?? ""), raw: data };
}

export async function runTailor(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const jobDescription = asString(ctx.args.jobDescription);
  if (!jobDescription) throw new Error("A job description is required to tailor a resume.");
  const data = await matchService.tailorResumeFromJobHtml({
    jobHtml: jobDescription,
    resumeId: ctx.bound.resumeId,
  });
  const record = asRecord(data);
  const matched = asStringArray(record.matchedKeywords);
  return {
    overallScore: asNumber(record.newScore),
    jobLabel: jobLabel(jobDescription, "") || undefined,
    strengths: matched && matched.length ? matched : undefined,
    recommendations: toRecommendations(record.recommendations),
    summary: record.tailoredResume ? "Tailored resume generated — open the full tool to view or export it." : undefined,
    raw: data,
  };
}

export async function runSkillExtractor(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const jobDescription = asString(ctx.args.jobDescription);
  const content = jobDescription ?? await resolveResumeText(ctx);
  const sourceType: "job" | "resume" = jobDescription ? "job" : "resume";
  const { data } = await apiClient.post<{ summary?: string; skills?: Array<{ name: string; category: string }> }>(
    aiToolPath("skill-extract"),
    { content, sourceType },
  );
  const skills = Array.isArray(data?.skills) ? data.skills : [];
  return {
    summary: data?.summary,
    strengths: skills.map((s) => s.name),
    raw: data,
  };
}

const INTERVIEW_QUESTION_TYPES = [
  "technical",
  "behavioral",
  "system-design",
  "product",
  "general",
] as const;

export async function runInterviewQuestions(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  // The endpoint requires a job description (or a detailed target-role brief)
  // ≥20 chars. "From my resume" alone has no JD, so the coach must supply the
  // target — its description tells the model that.
  const jobDescription = asString(ctx.args.jobDescription);
  if (!jobDescription || jobDescription.trim().length < 20) {
    throw new Error(
      "A target job description or detailed target-role brief (20+ characters) is required to generate interview questions.",
    );
  }
  const rawType = asString(ctx.args.type);
  const type = (INTERVIEW_QUESTION_TYPES as readonly string[]).includes(rawType ?? "")
    ? rawType
    : "behavioral";
  const count =
    typeof ctx.args.count === "number" && ctx.args.count >= 3 && ctx.args.count <= 10
      ? Math.round(ctx.args.count)
      : 5;
  // Best-effort: personalise against the active resume when one is bound.
  let resumeText: string | undefined;
  try {
    resumeText = (await resolveResumeText(ctx)).slice(0, 5000);
  } catch {
    resumeText = undefined;
  }
  const { data } = await apiClient.post<{
    questions?: Array<{ question: string; category: string; timeLimit?: number }>;
  }>("/api/interview/questions", {
    jobDescription: jobDescription.slice(0, 5000),
    resumeText,
    type,
    count,
  });
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  return {
    summary: `Generated ${questions.length} ${type} interview question${questions.length === 1 ? "" : "s"}.`,
    recommendations: questions.map((q) => ({
      title: q.question,
      description: [q.category, q.timeLimit ? `${q.timeLimit}s` : null].filter(Boolean).join(" · "),
    })),
    raw: data,
  };
}

export async function runJobMatch(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const jobDescription = asString(ctx.args.jobDescription);
  if (!jobDescription) throw new Error("A job description is required for job matching.");
  const data = await matchService.matchJobWithResume({
    jobContent: jobDescription,
    resumeId: ctx.bound.resumeId,
  });
  const record = asRecord(data);
  return {
    overallScore: asNumber(record.score),
    jobLabel: jobLabel(jobDescription, "") || undefined,
    strengths: asStringArray(record.matchedKeywords),
    weaknesses: asStringArray(record.missingKeywords),
    recommendations: toRecommendations(record.recommendations),
    raw: data,
  };
}
