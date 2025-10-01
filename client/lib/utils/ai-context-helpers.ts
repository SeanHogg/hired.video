/**
 * AI Context Helper Functions
 * 
 * Utility functions for creating, managing, and working with AI contexts
 */

import type {
  AIContext,
  AIContextType,
  ResumeContext,
  JobContext,
  ProfileContext,
  OutreachContext,
  SearchContext,
  DashboardContext,
  GeneralContext,
  ResumeAIAction,
  JobAIAction,
  ProfileAIAction,
  OutreachAIAction,
  SearchAIAction,
  DashboardAIAction,
  GeneralAIAction,
  AvailableAPI,
} from "@/lib/types/ai-context";
import { getAPIsForContext } from "@/lib/config/ai-api-registry";

// ============================================================================
// CONTEXT CREATION HELPERS
// ============================================================================

/**
 * Create a resume context
 */
export function createResumeContext(
  type: "resume-list" | "resume-create" | "resume-edit" | "resume-view",
  resume?: ResumeContext["resume"],
  userRole?: string,
): ResumeContext {
  const actions: ResumeAIAction[] = [];

  // Add actions based on context type
  if (type === "resume-create" || type === "resume-edit") {
    actions.push(
      "optimize-content",
      "improve-summary",
      "enhance-experience",
      "suggest-skills",
      "generate-bullet-points",
      "rewrite-section",
      "keyword-optimization",
    );
  }

  if (type === "resume-view") {
    actions.push("ats-score", "optimize-content", "suggest-skills");
  }

  if (type === "resume-list") {
    actions.push("optimize-content", "ats-score");
  }

  // Get available APIs for this context type
  const availableAPIs = getAPIsForContext(type);

  return {
    contextType: type,
    pageUrl: window.location.href,
    userRole,
    timestamp: new Date(),
    availableAPIs,
    resume,
    availableActions: actions,
  };
}

/**
 * Create a job context
 */
export function createJobContext(
  type: "job-list" | "job-create" | "job-edit" | "job-view",
  job?: JobContext["job"],
  userRole?: string,
): JobContext {
  const actions: JobAIAction[] = [];

  // Add actions based on context type
  if (type === "job-create" || type === "job-edit") {
    actions.push(
      "generate-description",
      "suggest-requirements",
      "improve-responsibilities",
      "optimize-posting",
      "suggest-keywords",
      "salary-insights",
    );
  }

  if (type === "job-view") {
    actions.push("match-candidates", "optimize-posting", "suggest-keywords");
  }

  if (type === "job-list") {
    actions.push("optimize-posting", "match-candidates");
  }

  const availableAPIs = getAPIsForContext(type);

  return {
    contextType: type,
    pageUrl: window.location.href,
    userRole,
    timestamp: new Date(),
    availableAPIs,
    job,
    availableActions: actions,
  };
}

/**
 * Create a profile context
 */
export function createProfileContext(
  type: "profile-view" | "profile-edit",
  profile?: ProfileContext["profile"],
  userRole?: string,
): ProfileContext {
  const actions: ProfileAIAction[] = [];

  // Add actions based on context type
  if (type === "profile-edit") {
    actions.push(
      "optimize-headline",
      "improve-summary",
      "suggest-skills",
      "enhance-profile",
      "generate-bio",
    );
  }

  if (type === "profile-view") {
    actions.push("optimize-headline", "improve-summary", "suggest-skills");
  }

  const availableAPIs = getAPIsForContext(type);

  return {
    contextType: type,
    pageUrl: window.location.href,
    userRole,
    timestamp: new Date(),
    availableAPIs,
    profile,
    availableActions: actions,
  };
}

/**
 * Create an outreach context
 */
export function createOutreachContext(
  type: "outreach" | "messaging",
  data?: {
    recipient?: OutreachContext["recipient"];
    messageType?: OutreachContext["messageType"];
    existingThread?: OutreachContext["existingThread"];
  },
  userRole?: string,
): OutreachContext {
  const actions: OutreachAIAction[] = [
    "generate-message",
    "personalize-template",
    "suggest-subject",
    "improve-tone",
    "follow-up-suggestion",
  ];

  const availableAPIs = getAPIsForContext(type);

  return {
    contextType: type,
    pageUrl: window.location.href,
    userRole,
    timestamp: new Date(),
    availableAPIs,
    recipient: data?.recipient,
    messageType: data?.messageType,
    existingThread: data?.existingThread,
    availableActions: actions,
  };
}

/**
 * Create a search context
 */
export function createSearchContext(
  searchQuery?: string,
  searchType?: SearchContext["searchType"],
  filters?: SearchContext["filters"],
  results?: SearchContext["results"],
  userRole?: string,
): SearchContext {
  const actions: SearchAIAction[] = [
    "refine-search",
    "suggest-keywords",
    "analyze-results",
    "recommend-filters",
  ];

  const availableAPIs = getAPIsForContext("search");

  return {
    contextType: "search",
    pageUrl: window.location.href,
    userRole,
    timestamp: new Date(),
    availableAPIs,
    searchQuery,
    searchType,
    filters,
    results,
    availableActions: actions,
  };
}

/**
 * Create a dashboard context
 */
export function createDashboardContext(
  stats?: DashboardContext["stats"],
  recentActivity?: DashboardContext["recentActivity"],
  userRole?: string,
): DashboardContext {
  const actions: DashboardAIAction[] = [
    "analyze-performance",
    "suggest-improvements",
    "generate-insights",
    "recommend-actions",
  ];

  const availableAPIs = getAPIsForContext("dashboard");

  return {
    contextType: "dashboard",
    pageUrl: window.location.href,
    userRole,
    timestamp: new Date(),
    availableAPIs,
    stats,
    recentActivity,
    availableActions: actions,
  };
}

/**
 * Create a general context (fallback)
 */
export function createGeneralContext(userRole?: string): GeneralContext {
  const actions: GeneralAIAction[] = [
    "ask-question",
    "get-help",
    "explain-feature",
    "provide-tips",
  ];

  const availableAPIs = getAPIsForContext("general");

  return {
    contextType: "general",
    pageUrl: window.location.href,
    userRole,
    timestamp: new Date(),
    availableAPIs,
    availableActions: actions,
  };
}

// ============================================================================
// CONTEXT UTILITIES
// ============================================================================

/**
 * Get human-readable label for context type
 */
export function getContextLabel(contextType: AIContextType): string {
  const labels: Record<AIContextType, string> = {
    "resume-list": "Resume List",
    "resume-create": "Create Resume",
    "resume-edit": "Edit Resume",
    "resume-view": "View Resume",
    "job-list": "Job List",
    "job-create": "Create Job",
    "job-edit": "Edit Job",
    "job-view": "View Job",
    "profile-view": "View Profile",
    "profile-edit": "Edit Profile",
    outreach: "Outreach",
    messaging: "Messaging",
    search: "Search",
    dashboard: "Dashboard",
    general: "General",
  };

  return labels[contextType] || "General";
}

/**
 * Get human-readable label for an action
 */
export function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    // Resume actions
    "optimize-content": "Optimize Content",
    "improve-summary": "Improve Summary",
    "enhance-experience": "Enhance Experience",
    "suggest-skills": "Suggest Skills",
    "ats-score": "ATS Score",
    "generate-bullet-points": "Generate Bullet Points",
    "rewrite-section": "Rewrite Section",
    "keyword-optimization": "Keyword Optimization",

    // Job actions
    "generate-description": "Generate Description",
    "suggest-requirements": "Suggest Requirements",
    "improve-responsibilities": "Improve Responsibilities",
    "optimize-posting": "Optimize Posting",
    "suggest-keywords": "Suggest Keywords",
    "match-candidates": "Match Candidates",
    "salary-insights": "Salary Insights",

    // Profile actions
    "optimize-headline": "Optimize Headline",
    "generate-bio": "Generate Bio",
    "enhance-profile": "Enhance Profile",

    // Outreach actions
    "generate-message": "Generate Message",
    "personalize-template": "Personalize Template",
    "suggest-subject": "Suggest Subject",
    "improve-tone": "Improve Tone",
    "follow-up-suggestion": "Follow-up Suggestion",

    // Search actions
    "refine-search": "Refine Search",
    "analyze-results": "Analyze Results",
    "recommend-filters": "Recommend Filters",

    // Dashboard actions
    "analyze-performance": "Analyze Performance",
    "suggest-improvements": "Suggest Improvements",
    "generate-insights": "Generate Insights",
    "recommend-actions": "Recommend Actions",

    // General actions
    "ask-question": "Ask Question",
    "get-help": "Get Help",
    "explain-feature": "Explain Feature",
    "provide-tips": "Provide Tips",
  };

  return labels[action] || action;
}

/**
 * Check if a context has a specific action available
 */
export function hasAction(context: AIContext, action: string): boolean {
  return context.availableActions.includes(action as any);
}

/**
 * Get icon name for context type (for UI display)
 */
export function getContextIcon(contextType: AIContextType): string {
  const icons: Record<AIContextType, string> = {
    "resume-list": "FileText",
    "resume-create": "FilePlus",
    "resume-edit": "FileEdit",
    "resume-view": "FileText",
    "job-list": "Briefcase",
    "job-create": "BriefcasePlus",
    "job-edit": "BriefcaseEdit",
    "job-view": "Briefcase",
    "profile-view": "User",
    "profile-edit": "UserEdit",
    outreach: "Mail",
    messaging: "MessageSquare",
    search: "Search",
    dashboard: "LayoutDashboard",
    general: "Brain",
  };

  return icons[contextType] || "Brain";
}

