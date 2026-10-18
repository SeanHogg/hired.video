import type { AIToolDef } from "./types.js";

/** Job tools — read, list public, save, match. Endpoints are the /api/jobs
 *  resource (api/src/routes/jobs/: listing.ts serves /public, manage.ts
 *  serves POST / and GET /:id). */
export const jobGet: AIToolDef = {
  id: "job-get",
  description: "Get a job posting by id.",
  endpoint: "/api/jobs/:id",
  method: "GET",
  requiresAuth: false,
  supportedActions: ["match-candidates", "optimize-posting", "generate-description"],
  contextTypes: ["job-view", "job-edit"],
  responseSchema: {
    id: "string",
    title: "string",
    description: "string",
    requirements: "array",
    location: "object",
    salary: "object",
  },
};

export const jobListPublic: AIToolDef = {
  id: "job-list-public",
  description: "List public job postings with filtering, pagination, and field-projection support.",
  endpoint: "/api/jobs/public",
  method: "GET",
  requiresAuth: false,
  supportedActions: ["match-candidates", "refine-search", "analyze-results"],
  contextTypes: ["job-list", "search", "dashboard"],
  responseSchema: {
    jobs: "array",
    total: "number",
    page: "number",
    limit: "number",
  },
};

export const jobSave: AIToolDef = {
  id: "job-save",
  description: "Create or update a job posting.",
  endpoint: "/api/jobs",
  method: "POST",
  requiresAuth: true,
  supportedActions: ["generate-description", "optimize-posting", "suggest-requirements"],
  contextTypes: ["job-create", "job-edit"],
  requestSchema: { jobData: "object (JobItem format)" },
  responseSchema: { id: "string", success: "boolean" },
};

export const jobResumeMatch: AIToolDef = {
  id: "job-resume-match",
  description: "Score how well a resume matches a job description with bias-aware breakdown + tailoring suggestions.",
  endpoint: "/api/match",
  method: "POST",
  requiresAuth: false,
  useCase: "match",
  supportedActions: ["match-candidates", "tailor-resume"],
  contextTypes: ["job-view", "resume-view", "search"],
  requestSchema: { jobDescription: "string", resumeText: "string" },
  responseSchema: {
    overallScore: "number",
    skillsMatch: "object",
    experienceMatch: "object",
    recommendations: "array",
  },
};
