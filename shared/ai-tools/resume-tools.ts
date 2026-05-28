import type { AIToolDef } from "./types.js";

/** Resume tools — read, optimize, score, save.
 *
 * Endpoint paths corrected from the legacy frontend registry, where
 * they referenced retired PascalCase routes that no longer exist:
 *
 *   `/api/Resume/{id}`           → `/api/resume/:id`
 *   `/api/Resume/user/{userId}`  → `/api/resume/withownership` (the
 *                                  current "list mine" endpoint;
 *                                  see resumes.ts:819)
 *   `/api/Resume/Save`           → `/api/resume/save`
 *   `/api/ResumeOptimizer/...`   → `/api/resumeoptimizer/...`
 *   `/api/ResumeScorer/...`      → `/api/resumescorer/...`
 */
export const resumeOptimize: AIToolDef = {
  id: "resume-optimize",
  description:
    "Optimize a resume with comprehensive analysis and ATS recommendations. Returns scored breakdown + prioritized improvements.",
  endpoint: "/api/resumeoptimizer/optimize",
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
  endpoint: "/api/resumescorer/score",
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
  endpoint: "/api/resume/roast",
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
  endpoint: "/api/resume/withownership",
  method: "GET",
  requiresAuth: true,
  supportedActions: ["optimize-content", "ats-score"],
  contextTypes: ["resume-list", "dashboard", "search"],
  responseSchema: { resumes: "array", total: "number" },
};

export const resumeSave: AIToolDef = {
  id: "resume-save",
  description: "Create or update a resume.",
  endpoint: "/api/resume/save",
  method: "POST",
  requiresAuth: true,
  supportedActions: ["optimize-content", "improve-summary", "enhance-experience"],
  contextTypes: ["resume-create", "resume-edit"],
  requestSchema: { resumeJson: "string (JSON Resume format)" },
  responseSchema: { id: "string", success: "boolean" },
};
