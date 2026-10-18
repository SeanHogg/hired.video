/**
 * Match scoring use cases — Job↔Resume scoring flows:
 *   • handleAnalyze   — POST /api/match/analyze
 *   • handleByid      — POST /api/match/byid
 *   • handleInsights  — POST /api/match/insights (Pro)
 *   • handleByContent — POST /api/match/bycontent (raw strings)
 * Split out of match-handlers.ts (now a re-export facade).
 */
import { DomainError, requireUserId } from "../../domains/errors.js";
import { ANALYZE_SKILLS_PROMPT_FRAGMENT, keywordSkillLists } from "./match-skills.js";
import { detach, type MatchDeps } from "./match-deps.js";
import {
  AnalyzeResponseSchema,
  AnalyzeWithSkillsResponseSchema,
  InsightsResponseIngest,
  MatchByContentSchema,
  MatchByIdSchema,
  MatchInputSchema,
  MatchInsightsSchema,
} from "./match-schemas.js";
import { TEXT_CAP, htmlToPlainText, keywordScore, resumeContentToText } from "./match-text.js";
import { resolveJob, resolveResume } from "./match-resolvers.js";
import { saveMatchScore } from "./match-score-cache.js";

// ---------------------------------------------------------------------------
// handleAnalyze — score resume vs job
// ---------------------------------------------------------------------------

const ANALYZE_SYSTEM_PROMPT = `You are a professional resume analyst. Evaluate how well a resume matches a job description and return a JSON response.
Scoring criteria:
- Skills match (required skills present in resume): 40%
- Experience relevance (titles, industries, years): 30%
- Education and certifications: 15%
- Language and keywords match: 15%
Always return valid JSON with integer score 0-100 and actionable recommendations.`;

export async function handleAnalyze(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
) {
  const userId = requireUserId(viewerId);

  const parsed = MatchInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const resume = await resolveResume(deps, userId, parsed.data.resumeId);
  if (!resume) throw new DomainError(404, "NOT_FOUND", "No resume found. Please create a resume first.");

  const job = await resolveJob(deps, parsed.data);
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found. Track the job before scoring.");

  const resumeText = resumeContentToText(resume.content);
  const resumeId = resume.id as string;

  if (deps.llm) {
    try {
      const { data: result } = await deps.llm.callJson(
        "match_analyze",
        {
          useCase: "match",
          systemPrompt: ANALYZE_SYSTEM_PROMPT,
          userMessage: `Job Description:\n${job.text}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<2-4 bullet points of key gaps and suggestions>", ${ANALYZE_SKILLS_PROMPT_FRAGMENT} }`,
          responseFormat: "json_object",
        },
        AnalyzeWithSkillsResponseSchema,
      );
      detach(deps, () => saveMatchScore(deps, {
        userId,
        jobId: job.jobId,
        resumeId,
        score: result.score,
        recommendations: result.summaryRecommendations,
      }));
      return {
        score: result.score,
        summaryRecommendations: result.summaryRecommendations,
        matchedSkills: result.matchedSkills,
        missingSkills: result.missingSkills,
        resumeId,
        sourceUrl: job.sourceUrl,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const { score, message } = keywordScore(job.text, resumeText);
      return {
        score,
        summaryRecommendations: message + `\n\n_LLM error: ${msg.slice(0, 300)}_`,
        ...keywordSkillLists(resume.content, job.text),
        resumeId,
        sourceUrl: job.sourceUrl,
      };
    }
  }

  const { score, message } = keywordScore(job.text, resumeText);
  return {
    score,
    summaryRecommendations: message,
    ...keywordSkillLists(resume.content, job.text),
    resumeId,
    sourceUrl: job.sourceUrl,
  };
}

// ---------------------------------------------------------------------------
// handleByid — analyze by persisted job + resume IDs (no jobHtml path)
// ---------------------------------------------------------------------------

export async function handleByid(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
) {
  const userId = requireUserId(viewerId);

  const parsed = MatchByIdSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "jobId and resumeId are required");
  }

  const { jobId, resumeId } = parsed.data;

  const job = await resolveJob(deps, { jobId });
  if (!job) throw new DomainError(404, "NOT_FOUND", "Job not found");

  const resume = await resolveResume(deps, userId, resumeId);
  if (!resume) throw new DomainError(404, "NOT_FOUND", "Resume not found");

  const resumeText = resumeContentToText(resume.content);

  if (deps.llm) {
    try {
      const { data: result } = await deps.llm.callJson(
        "match_byid",
        {
          useCase: "match",
          systemPrompt:
            "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job:\n${job.text}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
        },
        AnalyzeResponseSchema,
      );
      detach(deps, () => saveMatchScore(deps, {
        userId,
        jobId: job.jobId,
        resumeId: resume.id as string,
        score: result.score,
        recommendations: result.summaryRecommendations,
      }));
      return { ...result, jobId, resumeId };
    } catch {
      // fall through to keyword overlap
    }
  }

  const { score, message } = keywordScore(job.text, resumeText);
  return { score, summaryRecommendations: message, jobId, resumeId };
}

// ---------------------------------------------------------------------------
// handleInsights — deep career analysis (Pro only — the gate is
// applied at the route layer via requirePro middleware)
// ---------------------------------------------------------------------------

export async function handleInsights(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
) {
  const userId = requireUserId(viewerId);

  const parsed = MatchInsightsSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "Invalid request", parsed.error.flatten());
  }

  const resume = await resolveResume(deps, userId, parsed.data.resumeId);
  if (!resume) throw new DomainError(404, "NOT_FOUND", "No resume found. Please create a resume first.");

  const jobText = htmlToPlainText(parsed.data.jobHtml).slice(0, TEXT_CAP);
  const resumeText = resumeContentToText(resume.content);

  if (!deps.llm) {
    throw new DomainError(503, "AI_ERROR", "AI service not configured. Please contact support.");
  }

  try {
    const { data: result } = await deps.llm.callJsonLenient(
      "match_insights",
      {
        useCase: "match_insights",
        systemPrompt:
          "You are a senior career strategist and talent acquisition expert. Perform a deep analysis of a candidate's fit for a role, going beyond keyword matching to assess career trajectory, skill gaps, and actionable preparation steps. Return valid JSON only.",
        userMessage: `Analyse this candidate's fit for the role and return a comprehensive JSON insights report.

Job Description:
${jobText}

---

Candidate Resume:
${resumeText}

---

Return JSON matching this structure exactly:
{
  "overallFit": "strong|good|fair|weak",
  "seniorityFit": "<1-2 sentences>",
  "missingSkills": [{"skill": "<name>", "category": "<technical|soft|domain|tool>", "importance": "critical|important|nice-to-have"}],
  "careerTrajectory": "<2-3 sentences>",
  "interviewTips": ["<tip 1>", "<tip 2>", "<tip 3>"],
  "suggestedCertifications": [{"name": "<cert>", "reason": "<why>"}],
  "estimatedRampTime": "<e.g. '2-4 weeks'>"
}`,
        responseFormat: "json_object",
      },
      InsightsResponseIngest,
    );

    return { ...result, resumeId: resume.id };
  } catch {
    throw new DomainError(500, "AI_ERROR", "Failed to generate insights. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// handleByContent — analyze by raw strings (no persistence)
// ---------------------------------------------------------------------------

export async function handleByContent(
  deps: MatchDeps,
  viewerId: string | null,
  body: unknown,
) {
  requireUserId(viewerId);

  const parsed = MatchByContentSchema.safeParse(body);
  if (!parsed.success) {
    throw new DomainError(400, "VALIDATION_ERROR", "jobContent and resumeContent are required");
  }

  const jobText = parsed.data.jobContent.slice(0, TEXT_CAP);
  const resumeText = parsed.data.resumeContent.slice(0, TEXT_CAP);

  if (deps.llm) {
    try {
      const { data: result } = await deps.llm.callJson(
        "match_bycontent",
        {
          useCase: "match",
          systemPrompt:
            "You are a professional resume analyst. Evaluate how well a resume matches a job description and return valid JSON.",
          userMessage: `Job:\n${jobText}\n\n---\n\nResume:\n${resumeText}\n\n---\n\nReturn JSON: { "score": <0-100>, "summaryRecommendations": "<brief recommendations>" }`,
          responseFormat: "json_object",
        },
        AnalyzeResponseSchema,
      );
      return result;
    } catch {
      // fall through
    }
  }

  const { score, message } = keywordScore(jobText, resumeText);
  return { score, summaryRecommendations: message };
}
