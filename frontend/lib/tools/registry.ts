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
  Pencil,
  Plus,
  Sparkles,
  Target,
  Wand2,
  Zap,
} from "lucide-react";
import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { matchService } from "@/lib/services/match-service";
import { sentimentService } from "@/lib/services/sentiment-service";
import { resumeService } from "@/lib/services/resume-service";
import { applyResumeRewrite } from "@/lib/tools/apply-rewrite";
import type { ResumeContent } from "@shared/resume";
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

// ── Mutation runners (AI coach edits resume / profile) ──────────────────────
//
// These return `mutation: { status: "pending", ... }` and DO NOT persist on
// their own. The chat panel's ToolCallCard inspects the user's
// `aiAutoApplyChanges` setting and either calls `commitMutation` (which
// performs the persist) or waits for the user to click Apply. Read-only
// tools keep their original semantics — they always run to completion.

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function runApplyResumeRewrite(
  { resumeId, args }: ToolRunContext,
): Promise<NormalizedToolRunResult> {
  const original = asString(args?.original);
  const improved = asString(args?.improved);
  if (!original || !improved) {
    throw new Error("apply_resume_rewrite requires `original` and `improved` strings.");
  }
  if (!resumeId) {
    throw new Error("No active resume — open a resume to apply edits.");
  }
  return {
    summary: `Rewrite proposed: replace one bullet/summary on the active resume.`,
    previewText: `Before:\n${original}\n\nAfter:\n${improved}`,
    mutation: { status: "pending" },
    raw: { kind: "apply_resume_rewrite", resumeId, original, improved },
  };
}

async function runUpdateResumeSummary(
  { resumeId, args }: ToolRunContext,
): Promise<NormalizedToolRunResult> {
  const summary = asString(args?.summary);
  if (!summary) throw new Error("update_resume_summary requires `summary`.");
  if (!resumeId) throw new Error("No active resume — open a resume to apply edits.");
  return {
    summary: "New resume summary proposed.",
    previewText: summary,
    mutation: { status: "pending", location: "basics.summary" },
    raw: { kind: "update_resume_summary", resumeId, summary },
  };
}

async function runAddResumeSkill(
  { resumeId, args }: ToolRunContext,
): Promise<NormalizedToolRunResult> {
  const name = asString(args?.name);
  if (!name) throw new Error("add_resume_skill requires `name`.");
  if (!resumeId) throw new Error("No active resume — open a resume to add skills.");
  const level = asString(args?.level) ?? "";
  return {
    summary: `Add skill: ${name}${level ? ` (${level})` : ""}`,
    previewText: name,
    mutation: { status: "pending", location: "skills" },
    raw: { kind: "add_resume_skill", resumeId, name, level },
  };
}

/**
 * Persist a `mutation: { status: "pending" }` result. Called by the
 * ToolCallCard either when the user clicks Apply or when auto-apply is on.
 * Returns an updated NormalizedToolRunResult with `mutation.status` set
 * to `applied` or `failed`.
 */
export async function commitMutation(
  result: NormalizedToolRunResult,
  queryClient?: QueryClient,
): Promise<NormalizedToolRunResult> {
  const raw = (result.raw ?? {}) as { kind?: string; resumeId?: string } & Record<string, unknown>;

  try {
    if (raw.kind === "apply_resume_rewrite") {
      const original = String(raw.original ?? "");
      const improved = String(raw.improved ?? "");
      const out = await applyResumeRewrite(raw.resumeId, original, improved, queryClient);
      if (out.ok) {
        return { ...result, mutation: { status: "applied", location: out.location } };
      }
      return { ...result, mutation: { status: "failed", location: result.mutation?.location }, summary: out.reason === "no_match" ? "Couldn't find that bullet on the resume — was it edited recently?" : (out.message || "Apply failed") };
    }

    if (raw.kind === "update_resume_summary") {
      if (!raw.resumeId) throw new Error("Missing resumeId");
      const resume = await resumeService.getResumeById(raw.resumeId);
      const content = (resume?.content ?? {}) as ResumeContent;
      const next = JSON.parse(JSON.stringify(content)) as ResumeContent;
      next.basics = { ...(next.basics ?? { name: "", label: "", image: "", email: "", phone: "", url: "", summary: "" }), summary: String(raw.summary ?? "") };
      await resumeService.updateResumeData(raw.resumeId, { data: next });
      await queryClient?.invalidateQueries({ queryKey: ["resume", raw.resumeId] });
      await queryClient?.invalidateQueries({ queryKey: ["resumes"] });
      return { ...result, mutation: { status: "applied", location: "basics.summary" } };
    }

    if (raw.kind === "add_resume_skill") {
      if (!raw.resumeId) throw new Error("Missing resumeId");
      const resume = await resumeService.getResumeById(raw.resumeId);
      const content = (resume?.content ?? {}) as ResumeContent;
      const next = JSON.parse(JSON.stringify(content)) as ResumeContent;
      const name = String(raw.name ?? "");
      const level = String(raw.level ?? "");
      const skills = Array.isArray(next.skills) ? next.skills : [];
      // Skip duplicates (case-insensitive) so the LLM can re-call without harm.
      if (!skills.some((s) => s.name?.toLowerCase() === name.toLowerCase())) {
        skills.push({ name, level, keywords: [] });
        next.skills = skills;
        await resumeService.updateResumeData(raw.resumeId, { data: next });
        await queryClient?.invalidateQueries({ queryKey: ["resume", raw.resumeId] });
        await queryClient?.invalidateQueries({ queryKey: ["resumes"] });
      }
      return { ...result, mutation: { status: "applied", location: "skills" } };
    }

    throw new Error(`Unknown mutation kind: ${raw.kind}`);
  } catch (err: any) {
    return {
      ...result,
      mutation: { status: "failed", location: result.mutation?.location },
      summary: err?.message || "Apply failed",
    };
  }
}

// ── Registry ────────────────────────────────────────────────────────────────

// JSON-schema fragment shared by every tool that operates on the active
// resume. The chat panel injects the bound resumeId into ToolRunContext,
// so the LLM never has to (and never should) pass it.
const NO_ARGS = { type: "object", properties: {}, additionalProperties: false } as const;

export const toolRegistry: ToolDefinition[] = [
  {
    id: "ai-resume-scorer",
    label: "AI Resume Scorer",
    description: "Score the user's active resume across ATS, content, keywords, format, and impact. Returns an overall 0–100 score, category breakdowns, strengths, weaknesses, and recommendations.",
    icon: Brain,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/tools/ai-resume-scorer",
    inputs: ["resume"],
    producesScore: true,
    parameters: NO_ARGS,
    run: runScorer,
  },
  {
    id: "resume-optimizer",
    label: "Resume Optimizer",
    description: "Optimize the active resume for ATS, keywords, format, and content. Optionally against a target job description if the user has supplied one. Returns a 0–100 score plus prioritized rewrite suggestions.",
    icon: Zap,
    accentClassName: "bg-brand-blue/10 text-brand-blue",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    producesScore: true,
    requiresPro: true,
    parameters: NO_ARGS,
    run: runOptimizer,
  },
  {
    id: "sentiment-analysis",
    label: "Sentiment Analysis",
    description: "Score the tone of the active resume on a 0–100 scale (positive, neutral, negative). Useful when the user is worried their resume reads as flat or negative.",
    icon: Heart,
    accentClassName: "bg-pink-100 text-pink-600",
    route: "/tools/sentiment-analysis",
    inputs: ["resume"],
    producesScore: true,
    parameters: NO_ARGS,
    run: runSentiment,
  },
  {
    id: "summarize-resume",
    label: "Summarize Resume",
    description: "Generate a recruiter-ready summary paragraph of the active resume. Use this before suggesting a new headline/summary so you have a baseline.",
    icon: FileText,
    accentClassName: "bg-brand-green/10 text-brand-green",
    route: "/tools/summarize-resume",
    inputs: ["resume"],
    parameters: NO_ARGS,
    run: runSummarize,
  },
  {
    id: "resume-tailor",
    label: "Tailor to Job",
    description: "Rewrite the active resume to better match a specific job description that the user has shared. Returns the tailored content and the new ATS-style score.",
    icon: Sparkles,
    accentClassName: "bg-amber-100 text-amber-600",
    route: "/tools/resume-tailor",
    inputs: ["resume", "job"],
    producesScore: true,
    requiresPro: true,
    parameters: {
      type: "object",
      properties: {
        jobDescription: {
          type: "string",
          description: "The full text of the job posting to tailor the resume against. Pass exactly what the user shared.",
        },
      },
      required: ["jobDescription"],
      additionalProperties: false,
    },
    run: runTailor,
  },
  {
    id: "job-resume-match",
    label: "Job Match",
    description: "Score how well the active resume matches a specific job posting (0–100), with matched and missing keywords. Use this when the user wants to know if it's worth applying.",
    icon: Target,
    accentClassName: "bg-indigo-100 text-indigo-600",
    route: "/tools/job-resume-match",
    inputs: ["resume", "job"],
    producesScore: true,
    requiresPro: true,
    parameters: {
      type: "object",
      properties: {
        jobDescription: {
          type: "string",
          description: "The full text of the job posting to match against.",
        },
      },
      required: ["jobDescription"],
      additionalProperties: false,
    },
    run: runJobMatch,
  },
  {
    id: "skill-extractor",
    label: "Skill Extractor",
    description: "Pull every distinct skill (grouped, deduplicated) out of either the active resume or a job description the user shared. Pass jobDescription only when the user wants skills from a job, not from their resume.",
    icon: ListChecks,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/tools/skill-extractor",
    inputs: ["resume", "job"],
    parameters: {
      type: "object",
      properties: {
        jobDescription: {
          type: "string",
          description: "Optional. If present, extract skills from this job description instead of the resume.",
        },
      },
      additionalProperties: false,
    },
    run: runSkillExtractor,
  },
  {
    id: "value-proposition",
    label: "Value Proposition",
    description: "Craft a tailored value proposition for a specific company and role. Multi-step — open the full tool page rather than calling from the coach.",
    icon: Gauge,
    accentClassName: "bg-teal-100 text-teal-600",
    route: "/tools/value-proposition",
    inputs: ["resume", "job", "company"],
    producesScore: true,
    requiresPro: true,
    // No `parameters` — the coach won't expose it; users open the page.
    run: async () => {
      throw new Error("Value Proposition is a multi-step tool. Open the full tool to configure company details.");
    },
  },

  // ── Mutation tools (AI coach edits) ──────────────────────────────────────
  // These all target the user's *active* resume. The chat panel binds
  // `resumeId` into ToolRunContext from the route — the LLM does not pass it.

  {
    id: "apply_resume_rewrite",
    label: "Apply rewrite",
    description: "Replace ONE specific bullet, work summary, or basics summary on the active resume with an improved version. `original` must quote (verbatim or near-verbatim) text that already appears on the resume — the matcher will find the right slot. Use this after the user agrees to a specific rewrite you've proposed.",
    icon: Wand2,
    accentClassName: "bg-amber-100 text-amber-600",
    route: "/tools/resume-optimizer",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        original: {
          type: "string",
          description: "The bullet/summary text as it currently appears on the resume. Quote verbatim if possible.",
        },
        improved: {
          type: "string",
          description: "The replacement text. One bullet/summary at a time — do not concatenate multiple bullets.",
        },
      },
      required: ["original", "improved"],
      additionalProperties: false,
    },
    run: runApplyResumeRewrite,
  },
  {
    id: "update_resume_summary",
    label: "Update resume summary",
    description: "Replace the resume's `basics.summary` (the headline paragraph at the top) with a new version. Use after the user approves the new summary text.",
    icon: Pencil,
    accentClassName: "bg-brand-green/10 text-brand-green",
    route: "/tools/summarize-resume",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "The new summary paragraph. Plain prose, no bullet glyphs.",
        },
      },
      required: ["summary"],
      additionalProperties: false,
    },
    run: runUpdateResumeSummary,
  },
  {
    id: "add_resume_skill",
    label: "Add skill",
    description: "Append a skill to the active resume's skills list. Idempotent — duplicate skills (case-insensitive name match) are skipped. Use one call per skill.",
    icon: Plus,
    accentClassName: "bg-brand-purple/10 text-brand-purple",
    route: "/tools/skill-extractor",
    inputs: ["resume"],
    mutates: true,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name (e.g. \"TypeScript\", \"Stakeholder management\")." },
        level: {
          type: "string",
          enum: ["", "Beginner", "Intermediate", "Advanced", "Expert"],
          description: "Optional proficiency. Leave empty if the user hasn't told you.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
    run: runAddResumeSkill,
  },
];

/**
 * Serialize the tools the AI coach should expose to the LLM. Filters to
 * tools that declare a JSON-schema `parameters` block — wizards and
 * page-only tools are intentionally left out.
 *
 * Single source of truth: the chat panel calls this on every request so
 * adding a tool to the registry automatically exposes it to the model.
 */
export function getCoachToolSpecs(): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: NonNullable<ToolDefinition["parameters"]>;
  };
}> {
  return toolRegistry
    .filter((t) => t.parameters)
    .map((t) => ({
      type: "function",
      function: {
        name: t.id,
        description: t.description,
        parameters: t.parameters!,
      },
    }));
}

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
