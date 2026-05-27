import type { AIToolDef } from "./types.js";

/** Salary analysis tools.
 *
 * Endpoint paths corrected from the legacy frontend registry:
 *
 *   `/api/SalaryAnalyzer/analyze`           → `/api/salaryanalyzer/analyze`
 *   `/api/SalaryAnalyzer/negotiation-tips`  → `/api/salaryanalyzer/negotiation-tips`
 */
export const salaryAnalyze: AIToolDef = {
  id: "salary-analyze",
  description:
    "Comprehensive salary analysis based on job title, location, and experience. Returns market median + percentile bands + location adjustment.",
  endpoint: "/api/salaryanalyzer/analyze",
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
  endpoint: "/api/salaryanalyzer/negotiation-tips",
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
