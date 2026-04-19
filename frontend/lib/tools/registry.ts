// Single registry of every AI tool in the app. Each entry declares the
// entity types it accepts as input; context menus call getToolsForContext
// to surface the tools valid for the current entity (resume, job, video,
// template, company).

import {
  Brain,
  FileText,
  Gauge,
  Heart,
  ListChecks,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { matchService } from "@/lib/services/match-service";
import { sentimentService } from "@/lib/services/sentiment-service";
import type {
  NormalizedToolRunResult,
  ToolDefinition,
  ToolEntityType,
  ToolRunContext,
} from "./types";

// ── Individual runners ──────────────────────────────────────────────────────

async function runScorer({ resumeText }: ToolRunContext): Promise<NormalizedToolRunResult> {
  if (!resumeText) throw new Error("Resume content is required to score.");
  const { data } = await apiClient.post<any>("/api/ResumeScorer/score", { resumeText });
  return {
    overallScore: data.overallScore,
    grade: data.grade,
    categoryScores: [
      ...(typeof data.atsCompatibility === "number" ? [{ label: "ATS Compatibility", score: data.atsCompatibility }] : []),
      ...(typeof data.contentQuality === "number" ? [{ label: "Content Quality", score: data.contentQuality }] : []),
      ...(typeof data.keywordScore === "number" ? [{ label: "Keywords", score: data.keywordScore }] : []),
      ...(typeof data.formatScore === "number" ? [{ label: "Format", score: data.formatScore }] : []),
      ...(typeof data.impactScore === "number" ? [{ label: "Impact", score: data.impactScore }] : []),
    ],
    strengths: Array.isArray(data.strengths) ? data.strengths : undefined,
    weaknesses: Array.isArray(data.weaknesses) ? data.weaknesses : undefined,
    recommendations: Array.isArray(data.recommendations) ? data.recommendations : undefined,
    raw: data,
  };
}

async function runOptimizer({ resumeText, jobDescription }: ToolRunContext): Promise<NormalizedToolRunResult> {
  if (!resumeText) throw new Error("Resume content is required to optimize.");
  const { data } = await apiClient.post<any>("/api/ResumeOptimizer/optimize", {
    resumeText,
    jobDescription: jobDescription || undefined,
  });
  return {
    overallScore: data.overallScore,
    categoryScores: [
      ...(typeof data.atsScore === "number" ? [{ label: "ATS Compatibility", score: data.atsScore }] : []),
      ...(typeof data.keywordScore === "number" ? [{ label: "Keywords", score: data.keywordScore }] : []),
      ...(typeof data.formatScore === "number" ? [{ label: "Format", score: data.formatScore }] : []),
      ...(typeof data.contentScore === "number" ? [{ label: "Content Quality", score: data.contentScore }] : []),
    ],
    recommendations: Array.isArray(data.suggestions)
      ? data.suggestions.map((s: any) => ({
          category: s.type,
          title: s.title,
          description: s.description,
          impact: s.impact,
        }))
      : undefined,
    raw: data,
  };
}

async function runSentiment({ resumeId, resumeText }: ToolRunContext): Promise<NormalizedToolRunResult> {
  const score = resumeId
    ? await sentimentService.analyzeResumeSentiment(resumeId)
    : await sentimentService.analyzeSentiment(resumeText ?? "");
  const interpretation = sentimentService.interpretSentiment(score);
  return {
    overallScore: score,
    grade: interpretation.label,
    summary: interpretation.description,
    recommendations: interpretation.recommendations.map((title) => ({ title })),
    raw: { score, interpretation },
  };
}

async function runSummarize({ resumeId, resumeText }: ToolRunContext): Promise<NormalizedToolRunResult> {
  const { data } = await apiClient.post<any>(
    "/api/Resume/Summarize",
    resumeId ? { resumeId } : { resumeText },
  );
  const summary = typeof data === "string" ? data : (data?.result ?? data?.summary ?? "");
  return { summary: String(summary ?? ""), raw: data };
}

async function runTailor({ resumeId, jobDescription }: ToolRunContext): Promise<NormalizedToolRunResult> {
  if (!jobDescription) throw new Error("A job description is required to tailor a resume.");
  const data = await matchService.tailorResumeFromJobHtml({
    jobHtml: jobDescription,
    resumeId,
  } as any);
  const anyData = data as any;
  return {
    overallScore: typeof anyData.newScore === "number" ? anyData.newScore : undefined,
    recommendations: Array.isArray(anyData.recommendations)
      ? anyData.recommendations.map((r: any) => ({ title: typeof r === "string" ? r : r.title, description: r.description }))
      : undefined,
    summary: anyData.tailoredResume ? "Tailored resume generated — open the full tool to view or export it." : undefined,
    raw: data,
  };
}

async function runSkillExtractor({ resumeText, jobDescription }: ToolRunContext): Promise<NormalizedToolRunResult> {
  const content = (jobDescription ?? resumeText ?? "").trim();
  if (!content) throw new Error("Provide a resume or job description to extract skills from.");
  const sourceType = jobDescription ? "job" : "resume";
  const { data } = await apiClient.post<any>("/api/skillextractor/extract", { content, sourceType });
  const skills: Array<{ name: string; category: string }> = Array.isArray(data?.skills) ? data.skills : [];
  return {
    summary: data?.summary,
    strengths: skills.map((s) => s.name),
    raw: data,
  };
}

async function runJobMatch({ resumeId, jobDescription }: ToolRunContext): Promise<NormalizedToolRunResult> {
  if (!jobDescription) throw new Error("A job description is required for job matching.");
  const data = await matchService.matchJobWithResume({
    jobContent: jobDescription,
    resumeId,
  });
  const anyData = data as any;
  return {
    overallScore: typeof anyData.score === "number" ? anyData.score : undefined,
    strengths: Array.isArray(anyData.matchedKeywords) ? anyData.matchedKeywords : undefined,
    weaknesses: Array.isArray(anyData.missingKeywords) ? anyData.missingKeywords : undefined,
    recommendations: Array.isArray(anyData.recommendations)
      ? anyData.recommendations.map((r: any) => ({ title: typeof r === "string" ? r : r.title, description: r.description }))
      : undefined,
    raw: data,
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

export const toolRegistry: ToolDefinition[] = [
  {
    id: "ai-resume-scorer",
    label: "AI Resume Scorer",
    description: "Get an AI-powered score and grade across ATS, content, keywords, format, and impact.",
    icon: Brain,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/tools/ai-resume-scorer",
    inputs: ["resume"],
    producesScore: true,
    run: runScorer,
  },
  {
    id: "resume-optimizer",
    label: "Resume Optimizer",
    description: "Optimize for ATS, keywords, format, and content — optionally against a target job description.",
    icon: Zap,
    accentClassName: "bg-brand-blue/10 text-brand-blue",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    producesScore: true,
    requiresPro: true,
    run: runOptimizer,
  },
  {
    id: "sentiment-analysis",
    label: "Sentiment Analysis",
    description: "Check whether your resume's tone reads as positive, neutral, or negative.",
    icon: Heart,
    accentClassName: "bg-pink-100 text-pink-600",
    route: "/tools/sentiment-analysis",
    inputs: ["resume"],
    producesScore: true,
    run: runSentiment,
  },
  {
    id: "summarize-resume",
    label: "Summarize Resume",
    description: "Generate an AI summary paragraph of your resume.",
    icon: FileText,
    accentClassName: "bg-brand-green/10 text-brand-green",
    route: "/tools/summarize-resume",
    inputs: ["resume"],
    run: runSummarize,
  },
  {
    id: "resume-tailor",
    label: "Tailor to Job",
    description: "Tailor your resume to a specific job description and see the new score.",
    icon: Sparkles,
    accentClassName: "bg-amber-100 text-amber-600",
    route: "/tools/resume-tailor",
    inputs: ["resume", "job"],
    producesScore: true,
    requiresPro: true,
    run: runTailor,
  },
  {
    id: "job-resume-match",
    label: "Job Match",
    description: "See how well your resume matches a specific job posting.",
    icon: Target,
    accentClassName: "bg-indigo-100 text-indigo-600",
    route: "/tools/job-resume-match",
    inputs: ["resume", "job"],
    producesScore: true,
    requiresPro: true,
    run: runJobMatch,
  },
  {
    id: "skill-extractor",
    label: "Skill Extractor",
    description: "Upload a job description or resume and instantly pull out every skill it mentions, grouped and deduplicated.",
    icon: ListChecks,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/tools/skill-extractor",
    inputs: ["resume", "job"],
    run: runSkillExtractor,
  },
  {
    id: "value-proposition",
    label: "Value Proposition",
    description: "Craft a tailored value proposition for a specific company and role.",
    icon: Gauge,
    accentClassName: "bg-teal-100 text-teal-600",
    route: "/tools/value-proposition",
    inputs: ["resume", "job", "company"],
    producesScore: true,
    requiresPro: true,
    // Multi-step wizard — runs only from the full tool.
    run: async () => {
      throw new Error("Value Proposition is a multi-step tool. Open the full tool to configure company details.");
    },
  },
];

export function getTool(id: string): ToolDefinition | undefined {
  return toolRegistry.find((t) => t.id === id);
}

/**
 * Tools available from a given entity's context menu — any tool whose
 * inputs include that entity type. Additional inputs are gathered in the
 * dialog (e.g. a pasted job description for a resume-anchored tailor run).
 */
export function getToolsForContext(entity: ToolEntityType): ToolDefinition[] {
  return toolRegistry.filter((t) => t.inputs.includes(entity));
}

/** Tools that can't run inside the quick-run dialog (full page only). */
const FULL_PAGE_ONLY = new Set<string>(["value-proposition"]);

export function isInlineRunnable(tool: ToolDefinition): boolean {
  return !FULL_PAGE_ONLY.has(tool.id);
}
