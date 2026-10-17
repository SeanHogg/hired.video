import { aiToolPath } from "./tool-ids.js";
import type { AIToolDef } from "./types.js";

/** Salary analysis tools — served by the AI tool dispatcher
 *  (`POST /api/ai/tools/:toolId`); URLs are built with `aiToolPath(id)`. */
export const salaryAnalyze: AIToolDef = {
  id: "salary-analyze",
  description:
    "Comprehensive salary analysis based on job title, location, and experience. Returns market median + percentile bands + location adjustment.",
  endpoint: aiToolPath("salary-analyze"),
  method: "POST",
  requiresAuth: false,
  useCase: "salary_estimate",
  supportedActions: ["salary-insights"],
  contextTypes: ["job-view", "job-create", "job-edit"],
  requestSchema: {
    jobTitle: "string",
    location: "string",
    experienceYears: "number",
    industry: "string (optional)",
  },
  responseSchema: {
    medianSalary: "number",
    percentiles: "object",
    locationAdjustment: "number",
    industryComparison: "object",
  },
};

export const salaryNegotiationTips: AIToolDef = {
  id: "salary-negotiation-tips",
  description: "Strategic salary negotiation advice given a current offer + market rate + experience.",
  endpoint: aiToolPath("salary-negotiation-tips"),
  method: "POST",
  requiresAuth: false,
  useCase: "salary_negotiation",
  supportedActions: ["salary-insights"],
  contextTypes: ["job-view"],
  requestSchema: {
    currentOffer: "number",
    marketRate: "number",
    experienceYears: "number",
  },
  responseSchema: {
    strategies: "array",
    talkingPoints: "array",
    alternativeCompensation: "array",
  },
};
