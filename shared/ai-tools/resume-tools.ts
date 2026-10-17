import { aiToolPath } from "./tool-ids.js";
import type { AIToolDef } from "./types.js";

/** Resume tools — read, optimize, score, save.
 *
 * AI tools (optimize, score) go through the one dispatcher
 * `POST /api/ai/tools/:toolId` — the URL is always built with
 * `aiToolPath(id)`. Résumé CRUD lives on the plural `/api/resumes`
 * resource (the singular `/api/resume` alias is gone):
 *
 *   get       → `GET  /api/resumes/:id`
 *   list mine → `GET  /api/resumes?owner=me&include=ownership`
 *   save      → `POST /api/resumes` with `{ source: "blank", content, title? }`
 *   roast     → `POST /api/resumes/roast`
 */
export const resumeOptimize: AIToolDef = {
  id: "resume-optimize",
  description:
    "Optimize a resume with comprehensive analysis and ATS recommendations. Returns scored breakdown + prioritized improvements.",
  endpoint: aiToolPath("resume-optimize"),
  method: "POST",
  requiresAuth: true,
  useCase: "resume_optimize",
  supportedActions: ["optimize-content", "improve-summary", "keyword-optimization"],
  contextTypes: ["resume-create", "resume-edit", "resume-view", "profile-edit"],
  requestSchema: {
    resumeText: "string",
    jobDescription: "string (optional)",
  },
  responseSchema: {
    overallScore: "number",
    atsScore: "number",
    keywordScore: "number",
    improvements: "array",
    industryBenchmark: "object",
  },
};

export const resumeScore: AIToolDef = {
  id: "resume-score",
  description:
    "Comprehensive resume scoring across ATS, content, keyword, format, and impact dimensions. Returns letter grade + strengths + prioritized recommendations.",
  endpoint: aiToolPath("resume-score"),
  method: "POST",
  requiresAuth: false,
  useCase: "resume_score",
  supportedActions: ["ats-score", "optimize-content"],
  contextTypes: ["resume-list", "resume-view", "resume-edit", "resume-create"],
  requestSchema: { resumeText: "string" },
  responseSchema: {
    overallScore: "number",
    grade: "string",
    atsScore: "number",
    contentScore: "number",
    keywordScore: "number",
    formatScore: "number",
    impactScore: "number",
    strengths: "array",
    weaknesses: "array",
    recommendations: "array",
  },
};

export const resumeRoast: AIToolDef = {
  id: "resume-roast",
  description:
    "Brutally honest but constructive resume roast — JSON with score, strengths, weaknesses, witty roast paragraph, and improved bullet examples.",
  endpoint: "/api/resumes/roast",
  method: "POST",
  requiresAuth: false,
  useCase: "resume_roast",
  supportedActions: ["roast-resume"],
  contextTypes: ["resume-list", "resume-view"],
  requestSchema: { resumeText: "string" },
  responseSchema: {
    score: "number",
    strengths: "array",
    weaknesses: "array",
    roast: "string",
    fixes: "array",
    improvedExamples: "array",
  },
};

export const resumeGet: AIToolDef = {
  id: "resume-get",
  description: "Get a resume by ID (respects privacy and authentication).",
  endpoint: "/api/resumes/:id",
  method: "GET",
  requiresAuth: false,
  supportedActions: ["optimize-content", "ats-score", "improve-summary"],
  contextTypes: ["resume-view", "resume-edit"],
  responseSchema: {
    id: "string",
    userId: "string",
    basics: "object",
    work: "array",
    education: "array",
    skills: "array",
  },
};

export const resumeListMine: AIToolDef = {
  id: "resume-list-mine",
  description: "List the current user's resumes (auth required).",
  endpoint: "/api/resumes?owner=me&include=ownership",
  method: "GET",
  requiresAuth: true,
  supportedActions: ["optimize-content", "ats-score"],
  contextTypes: ["resume-list", "dashboard", "search"],
  responseSchema: { resumes: "array", total: "number" },
};

export const resumeSave: AIToolDef = {
  id: "resume-save",
  description: "Create or update a resume.",
  endpoint: "/api/resumes",
  method: "POST",
  requiresAuth: true,
  supportedActions: ["optimize-content", "improve-summary", "enhance-experience"],
  contextTypes: ["resume-create", "resume-edit"],
  requestSchema: {
    source: "\"blank\"",
    content: "object (JSON Resume format)",
    title: "string (optional)",
  },
  responseSchema: { id: "string", success: "boolean" },
};
