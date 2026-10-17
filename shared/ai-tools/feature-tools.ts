import { aiToolPath } from "./tool-ids.js";
import type { AIToolDef } from "./types.js";

/**
 * LLM-feature tools — distinct from the CRUD tools in the other files.
 * Each maps to a real backend endpoint (verified against the route
 * mounts in app.ts) and an `LLMUseCase` profile in providers.ts. Adds
 * the agent-callable AI features beyond resume/job/salary/profile/task
 * CRUD (gap #1623 breadth). Tools served by the AI tool dispatcher
 * (`POST /api/ai/tools/:toolId`) build their URL with `aiToolPath(id)`.
 */

export const interviewQuestions: AIToolDef = {
  id: "interview-questions",
  description:
    "Generate calibrated interview questions tailored to a job description (+ optional resume).",
  endpoint: "/api/interview/questions",
  method: "POST",
  requiresAuth: true,
  useCase: "interview_questions",
  supportedActions: ["interview-prep", "generate-questions"],
  contextTypes: ["job-view", "interview-practice", "resume-view"],
  requestSchema: {
    jobDescription: "string",
    resumeText: "string (optional)",
    type: "string (behavioural | technical | system-design)",
    count: "number",
  },
  responseSchema: { questions: "array" },
};

export const videoPitchScript: AIToolDef = {
  id: "video-pitch-script",
  description:
    "Write a spoken-word elevator pitch (hook + value prop + ask) under a target word count.",
  endpoint: "/api/video-pitch/script",
  method: "POST",
  requiresAuth: true,
  useCase: "video_pitch_script",
  supportedActions: ["generate-pitch", "video-script"],
  contextTypes: ["resume-view", "profile-view", "studio"],
  requestSchema: {
    role: "string",
    resumeText: "string (optional)",
    targetSeconds: "number (optional)",
  },
  responseSchema: { script: "string" },
};

export const skillExtract: AIToolDef = {
  id: "skill-extract",
  description: "Extract a normalized skill list from resume or profile text.",
  endpoint: aiToolPath("skill-extract"),
  method: "POST",
  requiresAuth: true,
  useCase: "skill_extract",
  supportedActions: ["extract-skills", "suggest-skills"],
  contextTypes: ["resume-view", "resume-edit", "profile-view", "profile-edit"],
  requestSchema: { content: "string", sourceType: "string (resume | job)" },
  responseSchema: { skills: "array" },
};

export const careerResilience: AIToolDef = {
  id: "career-resilience",
  description:
    "Assess career resilience + AI-displacement risk for a role and return a resilience score with recommendations.",
  endpoint: aiToolPath("career-resilience"),
  method: "POST",
  requiresAuth: true,
  useCase: "career",
  supportedActions: ["career-advice", "career-insights"],
  contextTypes: ["dashboard", "profile-view"],
  requestSchema: {
    role: "string",
    industry: "string (optional)",
    yearsExperience: "number (optional)",
  },
  responseSchema: { score: "number", recommendations: "array" },
};

export const profileAudit: AIToolDef = {
  id: "profile-audit",
  description: "Audit a profile for completeness + impact and return prioritized improvements (Pro).",
  endpoint: aiToolPath("profile-audit"),
  method: "POST",
  requiresAuth: true,
  useCase: "profile_audit",
  supportedActions: ["enhance-profile", "optimize-headline", "improve-summary"],
  contextTypes: ["profile-view", "profile-edit"],
  requestSchema: { profileId: "string (optional — defaults to current user)" },
  responseSchema: { score: "number", improvements: "array" },
};

export const autoApply: AIToolDef = {
  id: "auto-apply",
  description: "Start the auto-apply agent: tailor + submit applications to matched jobs (Pro).",
  endpoint: "/api/auto-apply/start",
  method: "POST",
  requiresAuth: true,
  useCase: "auto_apply",
  supportedActions: ["auto-apply", "apply-to-jobs"],
  contextTypes: ["job-list", "search", "dashboard"],
  requestSchema: {
    resumeId: "string",
    filters: "object (optional)",
  },
  responseSchema: { runId: "string", queued: "number" },
};

export const discoveryJobs: AIToolDef = {
  id: "discovery-jobs",
  description: "Personalized job discovery feed for the current user.",
  endpoint: "/api/discovery/jobs",
  method: "GET",
  requiresAuth: true,
  useCase: "discovery",
  supportedActions: ["find-matches", "find-job-matches", "refine-search"],
  contextTypes: ["job-list", "search", "dashboard"],
  responseSchema: { jobs: "array", total: "number" },
};
