// Catalog: read-only résumé / job analysis tools.

import { Brain, FileText, Heart, ListChecks, Sparkles, Target, Zap } from "lucide-react";
import { NO_ARGS } from "./shared";
import {
  runInterviewQuestions,
  runJobMatch,
  runOptimizer,
  runScorer,
  runSentiment,
  runSkillExtractor,
  runSummarize,
  runTailor,
} from "./runners-resume";
import type { ToolDefinition } from "../types";

export const resumeAnalysisTools: ToolDefinition[] = [
  {
    id: "ai-resume-scorer",
    label: "AI Resume Scorer",
    description: "Score the user's active resume across ATS, content, keywords, format, and impact. Returns an overall 0–100 score, category breakdowns, strengths, weaknesses, and recommendations.",
    icon: Brain,
    accentClassName: "bg-brand-primary/10 text-brand-primary",
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
    id: "interview-questions",
    label: "Interview Questions",
    description:
      "Generate calibrated interview questions for a target role from a job description (or a detailed target-role brief). Personalises against the user's active resume when one is open. Use when the user asks to practise or prep interview questions. Requires a jobDescription — if the user only names a role, write a short JD for it before calling.",
    icon: ListChecks,
    accentClassName: "bg-sky-100 text-sky-600",
    route: "/tools/interview-questions",
    inputs: ["resume", "job"],
    parameters: {
      type: "object",
      properties: {
        jobDescription: {
          type: "string",
          description:
            "The target job description (or a detailed target-role brief, 20+ characters) to generate questions for.",
        },
        type: {
          type: "string",
          enum: ["technical", "behavioral", "system-design", "product", "general"],
          description: "Interview type. Defaults to behavioral.",
        },
        count: {
          type: "number",
          description: "How many questions to generate (3–10). Defaults to 5.",
        },
      },
      required: ["jobDescription"],
      additionalProperties: false,
    },
    run: runInterviewQuestions,
  },
  {
    id: "skill-extractor",
    label: "Skill Extractor",
    description: "Pull every distinct skill (grouped, deduplicated) out of either the active resume or a job description the user shared. Pass jobDescription only when the user wants skills from a job, not from their resume.",
    icon: ListChecks,
    accentClassName: "bg-brand-primary/10 text-brand-primary",
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
];
