/**
 * AI API Registry
 * 
 * Central registry of all available APIs that the AI can orchestrate.
 * Maps APIs to context types and actions they support.
 */

import type { AvailableAPI, AIContextType } from "@/lib/types/ai-context";

// ============================================================================
// AI-POWERED APIS
// ============================================================================

export const AI_APIS: Record<string, AvailableAPI> = {
  // Resume Optimization APIs
  RESUME_OPTIMIZE: {
    id: "resume_optimize",
    endpoint: "/api/ResumeOptimizer/optimize",
    method: "POST",
    description: "Optimize resume with comprehensive analysis and ATS recommendations",
    supportedActions: ["optimize-content", "improve-summary", "keyword-optimization"],
    requiresAuth: true,
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
  },

  RESUME_ATS_ANALYSIS: {
    id: "resume_ats_analysis",
    endpoint: "/api/ResumeOptimizer/ats-analysis",
    method: "POST",
    description: "Analyze resume for ATS (Applicant Tracking System) compatibility",
    supportedActions: ["ats-score", "optimize-content"],
    requiresAuth: true,
    requestSchema: {
      resumeText: "string",
    },
    responseSchema: {
      atsScore: "number",
      compatibility: "string",
      issues: "array",
      recommendations: "array",
    },
  },

  RESUME_KEYWORD_SUGGESTIONS: {
    id: "resume_keyword_suggestions",
    endpoint: "/api/ResumeOptimizer/keyword-suggestions",
    method: "POST",
    description: "Get industry-specific keyword suggestions for resume",
    supportedActions: ["suggest-skills", "keyword-optimization"],
    requiresAuth: true,
    requestSchema: {
      resumeText: "string",
      industry: "string",
    },
    responseSchema: {
      keywords: "array",
      industrySpecific: "array",
      trending: "array",
    },
  },

  RESUME_SCORE: {
    id: "resume_score",
    endpoint: "/api/ResumeScorer/score",
    method: "POST",
    description: "Comprehensive resume scoring across 6 categories with letter grades",
    supportedActions: ["ats-score", "optimize-content"],
    requiresAuth: false,
    requestSchema: {
      resumeText: "string",
    },
    responseSchema: {
      overallScore: "number",
      grade: "string",
      categoryScores: "array",
      feedback: "array",
    },
  },

  RESUME_CATEGORY_BREAKDOWN: {
    id: "resume_category_breakdown",
    endpoint: "/api/ResumeScorer/category-breakdown",
    method: "POST",
    description: "Detailed breakdown of resume scoring categories",
    supportedActions: ["ats-score", "optimize-content"],
    requiresAuth: false,
    requestSchema: {
      resumeText: "string",
    },
    responseSchema: {
      categories: "array",
      strengths: "array",
      weaknesses: "array",
    },
  },

  RESUME_RECOMMENDATIONS: {
    id: "resume_recommendations",
    endpoint: "/api/ResumeScorer/recommendations",
    method: "POST",
    description: "Get actionable improvement recommendations for resume",
    supportedActions: ["optimize-content", "improve-summary", "enhance-experience"],
    requiresAuth: false,
    requestSchema: {
      resumeText: "string",
    },
    responseSchema: {
      quickWins: "array",
      longTermImprovements: "array",
      examples: "array",
    },
  },

  // Salary Analysis APIs
  SALARY_ANALYZE: {
    id: "salary_analyze",
    endpoint: "/api/SalaryAnalyzer/analyze",
    method: "POST",
    description: "Comprehensive salary analysis based on job, location, and experience",
    supportedActions: ["salary-insights"],
    requiresAuth: false,
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
  },

  SALARY_NEGOTIATION_TIPS: {
    id: "salary_negotiation_tips",
    endpoint: "/api/SalaryAnalyzer/negotiation-tips",
    method: "POST",
    description: "Strategic salary negotiation advice",
    supportedActions: ["salary-insights"],
    requiresAuth: false,
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
  },
};

// ============================================================================
// DATA APIS (CRUD Operations)
// ============================================================================

export const DATA_APIS: Record<string, AvailableAPI> = {
  // Resume Data APIs
  RESUME_GET: {
    id: "resume_get",
    endpoint: "/api/Resume/{id}",
    method: "GET",
    description: "Get resume by ID (respects privacy and authentication)",
    supportedActions: ["optimize-content", "ats-score", "improve-summary"],
    requiresAuth: false,
    responseSchema: {
      id: "string",
      userId: "string",
      basics: "object",
      work: "array",
      education: "array",
      skills: "array",
    },
  },

  RESUME_LIST: {
    id: "resume_list",
    endpoint: "/api/Resume/user/{userId}",
    method: "GET",
    description: "Get all resumes for a user",
    supportedActions: ["optimize-content", "ats-score"],
    requiresAuth: true,
    responseSchema: {
      resumes: "array",
      total: "number",
    },
  },

  RESUME_SAVE: {
    id: "resume_save",
    endpoint: "/api/Resume/Save",
    method: "POST",
    description: "Save or update a resume",
    supportedActions: ["optimize-content", "improve-summary", "enhance-experience"],
    requiresAuth: true,
    requestSchema: {
      resumeJson: "string (JSON Resume format)",
    },
    responseSchema: {
      id: "string",
      success: "boolean",
    },
  },

  // Job Data APIs
  JOB_GET: {
    id: "job_get",
    endpoint: "/api/Job/{id}",
    method: "GET",
    description: "Get job by ID",
    supportedActions: ["match-candidates", "optimize-posting", "generate-description"],
    requiresAuth: false,
    responseSchema: {
      id: "string",
      title: "string",
      description: "string",
      requirements: "array",
      location: "object",
      salary: "object",
    },
  },

  JOB_LIST_PUBLIC: {
    id: "job_list_public",
    endpoint: "/api/Job/GetPublicJobs",
    method: "GET",
    description: "Get public job listings with filtering",
    supportedActions: ["match-candidates", "refine-search", "analyze-results"],
    requiresAuth: false,
    responseSchema: {
      jobs: "array",
      total: "number",
      page: "number",
      limit: "number",
    },
  },

  JOB_SAVE: {
    id: "job_save",
    endpoint: "/api/Job/save",
    method: "POST",
    description: "Save or update a job posting",
    supportedActions: ["generate-description", "optimize-posting", "suggest-requirements"],
    requiresAuth: true,
    requestSchema: {
      jobData: "object (JobItem format)",
    },
    responseSchema: {
      id: "string",
      success: "boolean",
    },
  },

  // User Profile APIs
  USER_PROFILE_GET: {
    id: "user_profile_get",
    endpoint: "/api/Users/{id}",
    method: "GET",
    description: "Get user profile (supports slug or GUID)",
    supportedActions: ["optimize-headline", "improve-summary", "enhance-profile"],
    requiresAuth: false,
    responseSchema: {
      id: "string",
      name: "string",
      headline: "string",
      summary: "string",
      skills: "array",
    },
  },
};

// ============================================================================
// CONTEXT-TO-API MAPPING
// ============================================================================

/**
 * Maps context types to their available APIs
 */
export const CONTEXT_API_MAPPING: Record<AIContextType, string[]> = {
  "resume-list": [
    "RESUME_LIST",
    "RESUME_GET",
    "RESUME_SCORE",
    "RESUME_ATS_ANALYSIS",
  ],
  "resume-create": [
    "RESUME_SAVE",
    "RESUME_OPTIMIZE",
    "RESUME_KEYWORD_SUGGESTIONS",
    "RESUME_RECOMMENDATIONS",
  ],
  "resume-edit": [
    "RESUME_GET",
    "RESUME_SAVE",
    "RESUME_OPTIMIZE",
    "RESUME_ATS_ANALYSIS",
    "RESUME_KEYWORD_SUGGESTIONS",
    "RESUME_RECOMMENDATIONS",
    "RESUME_CATEGORY_BREAKDOWN",
  ],
  "resume-view": [
    "RESUME_GET",
    "RESUME_SCORE",
    "RESUME_ATS_ANALYSIS",
    "RESUME_CATEGORY_BREAKDOWN",
  ],
  "job-list": [
    "JOB_LIST_PUBLIC",
    "JOB_GET",
    "RESUME_GET",
    "RESUME_LIST",
  ],
  "job-create": [
    "JOB_SAVE",
    "SALARY_ANALYZE",
    "SALARY_NEGOTIATION_TIPS",
  ],
  "job-edit": [
    "JOB_GET",
    "JOB_SAVE",
    "SALARY_ANALYZE",
  ],
  "job-view": [
    "JOB_GET",
    "RESUME_GET",
    "RESUME_LIST",
    "SALARY_ANALYZE",
  ],
  "profile-view": [
    "USER_PROFILE_GET",
    "RESUME_LIST",
  ],
  "profile-edit": [
    "USER_PROFILE_GET",
    "RESUME_OPTIMIZE",
    "RESUME_KEYWORD_SUGGESTIONS",
  ],
  "outreach": [],
  "messaging": [],
  "search": [
    "JOB_LIST_PUBLIC",
    "RESUME_LIST",
  ],
  "dashboard": [
    "RESUME_LIST",
    "JOB_LIST_PUBLIC",
  ],
  "general": [],
};

/**
 * Get available APIs for a specific context type
 */
export function getAPIsForContext(contextType: AIContextType): AvailableAPI[] {
  const apiIds = CONTEXT_API_MAPPING[contextType] || [];
  const allAPIs = { ...AI_APIS, ...DATA_APIS };
  
  return apiIds
    .map((id) => allAPIs[id])
    .filter((api): api is AvailableAPI => api !== undefined);
}

/**
 * Get API by ID
 */
export function getAPIById(apiId: string): AvailableAPI | undefined {
  // Search through AI_APIS by id field
  const aiAPI = Object.values(AI_APIS).find((api) => api.id === apiId);
  if (aiAPI) return aiAPI;

  // Search through DATA_APIS by id field
  const dataAPI = Object.values(DATA_APIS).find((api) => api.id === apiId);
  return dataAPI;
}

/**
 * Find APIs that support a specific action
 */
export function getAPIsByAction(action: string): AvailableAPI[] {
  const aiAPIs = Object.values(AI_APIS).filter((api) =>
    api.supportedActions.includes(action)
  );
  const dataAPIs = Object.values(DATA_APIS).filter((api) =>
    api.supportedActions.includes(action)
  );
  return [...aiAPIs, ...dataAPIs];
}

