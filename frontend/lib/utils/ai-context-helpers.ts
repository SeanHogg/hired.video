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
  TasksContext,
  GeneralContext,
  ResumeAIAction,
  JobAIAction,
  ProfileAIAction,
  OutreachAIAction,
  SearchAIAction,
  DashboardAIAction,
  TasksAIAction,
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

  // Add actions based on context type and user role
  if (type === "resume-create" || type === "resume-edit") {
    // Job seekers creating/editing their own resume
    if (userRole === "job_seeker" || !userRole) {
      actions.push(
        "optimize-content",
        "improve-summary",
        "enhance-experience",
        "suggest-skills",
        "generate-bullet-points",
        "rewrite-section",
        "keyword-optimization",
      );
    } else if (userRole === "recruiter" || userRole === "employer") {
      // Recruiters might help candidates with resumes
      actions.push(
        "optimize-content",
        "suggest-skills",
        "improve-summary",
      );
    }
  }

  if (type === "resume-view") {
    if (userRole === "job_seeker" || !userRole) {
      // Job seekers viewing their own resume
      actions.push("ats-score", "optimize-content", "suggest-skills");
    } else if (userRole === "recruiter" || userRole === "employer") {
      // Recruiters viewing candidate resumes
      actions.push("analyze-candidate", "match-to-jobs", "skill-assessment");
    }
  }

  if (type === "resume-list") {
    if (userRole === "job_seeker" || !userRole) {
      actions.push("optimize-content", "ats-score");
    } else if (userRole === "recruiter" || userRole === "employer") {
      actions.push("compare-candidates", "find-best-match");
    }
  }

  // Get available APIs for this context type
  const availableAPIs = getAPIsForContext(type);

  return {
    contextType: type,
    pageUrl: typeof window !== "undefined" ? window.location.href : "",
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

  // Add actions based on context type and user role
  if (type === "job-create" || type === "job-edit") {
    // Recruiters and Employers can create/edit jobs
    if (userRole === "recruiter" || userRole === "employer" || userRole === "admin" || userRole === "super_admin") {
      actions.push(
        "generate-description",
        "suggest-requirements",
        "improve-responsibilities",
        "optimize-posting",
        "suggest-keywords",
        "salary-insights",
      );
    }
  }

  if (type === "job-view") {
    // Different actions based on role
    if (userRole === "job_seeker") {
      // Job seekers want to know if they're a good match
      actions.push("analyze-fit", "suggest-keywords", "application-tips");
    } else if (userRole === "recruiter" || userRole === "employer") {
      // Recruiters/Employers want to find candidates
      actions.push("match-candidates", "optimize-posting", "suggest-keywords");
    } else {
      // Default for unauthenticated or other roles
      actions.push("analyze-fit", "suggest-keywords");
    }
  }

  if (type === "job-list") {
    if (userRole === "job_seeker") {
      actions.push("find-matches", "career-advice");
    } else if (userRole === "recruiter" || userRole === "employer") {
      actions.push("optimize-posting", "match-candidates");
    } else {
      actions.push("find-matches");
    }
  }

  const availableAPIs = getAPIsForContext(type);

  return {
    contextType: type,
    pageUrl: typeof window !== "undefined" ? window.location.href : "",
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
    pageUrl: typeof window !== "undefined" ? window.location.href : "",
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
    pageUrl: typeof window !== "undefined" ? window.location.href : "",
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
  const actions: SearchAIAction[] = [];

  // Add role-specific search actions
  if (userRole === "job_seeker" || !userRole) {
    actions.push(
      "refine-search",
      "suggest-keywords",
      "find-job-matches",
      "career-advice",
    );
  } else if (userRole === "recruiter" || userRole === "employer") {
    actions.push(
      "refine-search",
      "suggest-keywords",
      "find-candidates",
      "analyze-talent-pool",
    );
  } else {
    // Default for other roles
    actions.push(
      "refine-search",
      "suggest-keywords",
      "analyze-results",
      "recommend-filters",
    );
  }

  const availableAPIs = getAPIsForContext("search");

  return {
    contextType: "search",
    pageUrl: typeof window !== "undefined" ? window.location.href : "",
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
  const actions: DashboardAIAction[] = [];

  // Add role-specific dashboard actions
  if (userRole === "job_seeker" || !userRole) {
    actions.push(
      "analyze-performance",
      "suggest-improvements",
      "career-insights",
      "recommend-actions",
    );
  } else if (userRole === "recruiter") {
    actions.push(
      "analyze-performance",
      "hiring-insights",
      "candidate-pipeline",
      "recommend-actions",
    );
  } else if (userRole === "employer") {
    actions.push(
      "analyze-performance",
      "hiring-metrics",
      "team-insights",
      "recommend-actions",
    );
  } else if (false /* affiliate is not a role — service flag, handled separately */) {
    actions.push(
      "analyze-performance",
      "referral-insights",
      "commission-tracking",
      "recommend-actions",
    );
  } else {
    // Admin/SuperAdmin or default
    actions.push(
      "analyze-performance",
      "suggest-improvements",
      "generate-insights",
      "recommend-actions",
    );
  }

  const availableAPIs = getAPIsForContext("dashboard");

  return {
    contextType: "dashboard",
    pageUrl: typeof window !== "undefined" ? window.location.href : "",
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
  const actions: GeneralAIAction[] = [];

  // Add role-specific general actions
  if (userRole === "job_seeker" || !userRole) {
    actions.push(
      "ask-question",
      "career-advice",
      "resume-tips",
      "interview-prep",
    );
  } else if (userRole === "recruiter") {
    actions.push(
      "ask-question",
      "recruiting-tips",
      "candidate-sourcing",
      "hiring-best-practices",
    );
  } else if (userRole === "employer") {
    actions.push(
      "ask-question",
      "hiring-guidance",
      "team-building",
      "job-posting-tips",
    );
  } else if (false /* affiliate is not a role — service flag, handled separately */) {
    actions.push(
      "ask-question",
      "marketing-tips",
      "referral-strategies",
      "commission-info",
    );
  } else {
    // Default for Admin/SuperAdmin or unknown roles
    actions.push(
      "ask-question",
      "get-help",
      "explain-feature",
      "provide-tips",
    );
  }

  const availableAPIs = getAPIsForContext("general");

  return {
    contextType: "general",
    pageUrl: typeof window !== "undefined" ? window.location.href : "",
    userRole,
    timestamp: new Date(),
    availableAPIs,
    availableActions: actions,
  };
}

/**
 * Create a tasks context
 */
export function createTasksContext(
  tasks?: TasksContext["tasks"],
  userRole?: string,
): TasksContext {
  const actions: TasksAIAction[] = [];

  // Add role-specific task management actions
  if (userRole === "job_seeker" || !userRole) {
    actions.push(
      "create-task",
      "prioritize-tasks",
      "suggest-deadlines",
      "break-down-task",
      "estimate-time",
      "organize-tasks",
      "productivity-tips",
    );
  } else if (userRole === "recruiter" || userRole === "employer") {
    actions.push(
      "create-task",
      "prioritize-tasks",
      "suggest-schedule",
      "organize-tasks",
      "break-down-task",
      "productivity-tips",
    );
  } else {
    // Default for other roles
    actions.push(
      "create-task",
      "prioritize-tasks",
      "organize-tasks",
      "productivity-tips",
    );
  }

  const availableAPIs = getAPIsForContext("tasks");

  return {
    contextType: "tasks",
    pageUrl: typeof window !== "undefined" ? window.location.href : "",
    userRole,
    timestamp: new Date(),
    availableAPIs,
    tasks,
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
    tasks: "Task Management",
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
  return (context.availableActions as string[]).includes(action);
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
    tasks: "CheckSquare",
    general: "Brain",
  };

  return icons[contextType] || "Brain";
}

