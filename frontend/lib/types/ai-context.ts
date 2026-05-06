/**
 * AI Context Types
 * 
 * Defines comprehensive context interfaces for AI integration across different pages.
 * Each context type provides page-specific metadata and available AI actions.
 */

// ============================================================================
// BASE CONTEXT TYPES
// ============================================================================

/**
 * Available API endpoint definition
 */
export interface AvailableAPI {
  /** Unique identifier for the API */
  id: string;
  /** API endpoint path */
  endpoint: string;
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Human-readable description of what this API does */
  description: string;
  /** What AI actions this API supports */
  supportedActions: string[];
  /** Whether this API requires authentication */
  requiresAuth: boolean;
  /** Expected request payload structure (for documentation) */
  requestSchema?: Record<string, any>;
  /** Expected response structure (for documentation) */
  responseSchema?: Record<string, any>;
}

/**
 * Base context interface that all specific contexts extend
 */
export interface BaseAIContext {
  /** The type of page/context */
  contextType: AIContextType;
  /** Current page URL */
  pageUrl: string;
  /** User's current role */
  userRole?: string;
  /** Timestamp when context was created */
  timestamp: Date;
  /** Available APIs that the AI can orchestrate for this context */
  availableAPIs: AvailableAPI[];
  /** Live page-form snapshot. Authoring pages (e.g. JobCreatePage) drop
   *  the raw RHF values here so the AI panel can surface them in the
   *  system prompt without us shoehorning every form into the typed
   *  business shapes (`JobContext.job`, `ResumeContext.resume`, etc.).
   *  Read it as a free-form record — keys/values are page-specific. */
  formSnapshot?: Record<string, unknown>;
}

/**
 * Available context types across the application
 */
export type AIContextType =
  | "resume-list"
  | "resume-create"
  | "resume-edit"
  | "resume-view"
  | "job-list"
  | "job-create"
  | "job-edit"
  | "job-view"
  | "profile-view"
  | "profile-edit"
  | "outreach"
  | "messaging"
  | "search"
  | "dashboard"
  | "tasks"
  | "general";

// ============================================================================
// RESUME CONTEXTS
// ============================================================================

/**
 * Context for resume-related pages
 */
export interface ResumeContext extends BaseAIContext {
  contextType: "resume-list" | "resume-create" | "resume-edit" | "resume-view";
  resume?: {
    id?: string;
    title?: string;
    summary?: string;
    experience?: Array<{
      title: string;
      company: string;
      description: string;
      startDate: string;
      endDate?: string;
    }>;
    education?: Array<{
      degree: string;
      institution: string;
      graduationDate: string;
    }>;
    skills?: string[];
    isActive?: boolean;
    visibility?: string;
  };
  /** Available AI actions for this context */
  availableActions: ResumeAIAction[];
}

export type ResumeAIAction =
  | "optimize-content"
  | "improve-summary"
  | "enhance-experience"
  | "suggest-skills"
  | "ats-score"
  | "generate-bullet-points"
  | "rewrite-section"
  | "keyword-optimization"
  // Recruiter/Employer actions
  | "analyze-candidate"
  | "match-to-jobs"
  | "skill-assessment"
  | "compare-candidates"
  | "find-best-match";

// ============================================================================
// JOB CONTEXTS
// ============================================================================

/**
 * Context for job posting pages
 */
export interface JobContext extends BaseAIContext {
  contextType: "job-list" | "job-create" | "job-edit" | "job-view";
  job?: {
    id?: string;
    title?: string;
    description?: string;
    requirements?: string[];
    responsibilities?: string[];
    location?: string;
    salaryRange?: {
      min?: number;
      max?: number;
      currency?: string;
    };
    employmentType?: string;
    experienceLevel?: string;
  };
  /** Available AI actions for this context */
  availableActions: JobAIAction[];
}

export type JobAIAction =
  | "generate-description"
  | "suggest-requirements"
  | "improve-responsibilities"
  | "optimize-posting"
  | "suggest-keywords"
  | "match-candidates"
  | "salary-insights"
  // Job Seeker actions
  | "analyze-fit"
  | "application-tips"
  | "find-matches"
  | "career-advice";

// ============================================================================
// PROFILE CONTEXTS
// ============================================================================

/**
 * Context for user profile pages
 */
export interface ProfileContext extends BaseAIContext {
  contextType: "profile-view" | "profile-edit";
  profile?: {
    id?: string;
    name?: string;
    headline?: string;
    summary?: string;
    location?: string;
    industry?: string;
    yearsOfExperience?: number;
    skills?: string[];
  };
  /** Available AI actions for this context */
  availableActions: ProfileAIAction[];
}

export type ProfileAIAction =
  | "optimize-headline"
  | "improve-summary"
  | "suggest-skills"
  | "enhance-profile"
  | "generate-bio";

// ============================================================================
// OUTREACH & MESSAGING CONTEXTS
// ============================================================================

/**
 * Context for outreach and messaging pages
 */
export interface OutreachContext extends BaseAIContext {
  contextType: "outreach" | "messaging";
  recipient?: {
    name?: string;
    role?: string;
    company?: string;
  };
  messageType?: "initial-contact" | "follow-up" | "thank-you" | "networking";
  existingThread?: Array<{
    sender: string;
    content: string;
    timestamp: Date;
  }>;
  /** Available AI actions for this context */
  availableActions: OutreachAIAction[];
}

export type OutreachAIAction =
  | "generate-message"
  | "personalize-template"
  | "suggest-subject"
  | "improve-tone"
  | "follow-up-suggestion";

// ============================================================================
// SEARCH CONTEXT
// ============================================================================

/**
 * Context for search pages
 */
export interface SearchContext extends BaseAIContext {
  contextType: "search";
  searchQuery?: string;
  searchType?: "jobs" | "candidates" | "companies" | "all";
  filters?: Record<string, any>;
  results?: {
    count: number;
    type: string;
  };
  /** Available AI actions for this context */
  availableActions: SearchAIAction[];
}

export type SearchAIAction =
  | "refine-search"
  | "suggest-keywords"
  | "analyze-results"
  | "recommend-filters"
  // Job Seeker actions
  | "find-job-matches"
  | "career-advice"
  // Recruiter/Employer actions
  | "find-candidates"
  | "analyze-talent-pool";

// ============================================================================
// DASHBOARD CONTEXT
// ============================================================================

/**
 * Context for dashboard pages
 */
export interface DashboardContext extends BaseAIContext {
  contextType: "dashboard";
  stats?: {
    activeJobs?: number;
    applications?: number;
    views?: number;
    matches?: number;
  };
  recentActivity?: Array<{
    type: string;
    description: string;
    timestamp: Date;
  }>;
  /** Available AI actions for this context */
  availableActions: DashboardAIAction[];
}

export type DashboardAIAction =
  | "analyze-performance"
  | "suggest-improvements"
  | "generate-insights"
  | "recommend-actions"
  // Job Seeker actions
  | "career-insights"
  // Recruiter actions
  | "hiring-insights"
  | "candidate-pipeline"
  // Employer actions
  | "hiring-metrics"
  | "team-insights"
  // Affiliate actions
  | "referral-insights"
  | "commission-tracking";

// ============================================================================
// TASKS CONTEXT
// ============================================================================

/**
 * Context for task management pages
 */
export interface TasksContext extends BaseAIContext {
  contextType: "tasks";
  tasks?: Array<{
    id?: string;
    text?: string;
    description?: string;
    start?: Date;
    end?: Date;
    progress?: number;
    type?: string;
    priority?: string;
  }>;
  /** Available AI actions for this context */
  availableActions: TasksAIAction[];
}

export type TasksAIAction =
  | "create-task"
  | "prioritize-tasks"
  | "suggest-deadlines"
  | "break-down-task"
  | "estimate-time"
  | "organize-tasks"
  | "suggest-schedule"
  | "productivity-tips";

// ============================================================================
// GENERAL CONTEXT
// ============================================================================

/**
 * General context for pages without specific context
 */
export interface GeneralContext extends BaseAIContext {
  contextType: "general";
  /** Available AI actions for this context */
  availableActions: GeneralAIAction[];
}

export type GeneralAIAction =
  | "ask-question"
  | "get-help"
  | "explain-feature"
  | "provide-tips"
  // Job Seeker actions
  | "career-advice"
  | "resume-tips"
  | "interview-prep"
  // Recruiter actions
  | "recruiting-tips"
  | "candidate-sourcing"
  | "hiring-best-practices"
  // Employer actions
  | "hiring-guidance"
  | "team-building"
  | "job-posting-tips"
  // Affiliate actions
  | "marketing-tips"
  | "referral-strategies"
  | "commission-info";

// ============================================================================
// UNION TYPE FOR ALL CONTEXTS
// ============================================================================

/**
 * Union type of all possible AI contexts
 */
export type AIContext =
  | ResumeContext
  | JobContext
  | ProfileContext
  | OutreachContext
  | SearchContext
  | DashboardContext
  | TasksContext
  | GeneralContext;

// ============================================================================
// AI ACTION TYPES
// ============================================================================

/**
 * Union type of all possible AI actions
 */
export type AIAction =
  | ResumeAIAction
  | JobAIAction
  | ProfileAIAction
  | OutreachAIAction
  | SearchAIAction
  | DashboardAIAction
  | GeneralAIAction;

// ============================================================================
// CONTEXT PAYLOAD FOR API REQUESTS
// ============================================================================

/**
 * Payload sent to backend AI endpoints with context information
 */
export interface AIContextPayload {
  /** The current context */
  context: AIContext;
  /** The user's message/request */
  message: string;
  /** Conversation history */
  history?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  /** Specific action being requested (optional) */
  action?: AIAction;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

// ============================================================================
// AI RESPONSE TYPES
// ============================================================================

/**
 * Response from context-aware AI endpoints
 */
export interface AIContextResponse {
  /** The AI's response message */
  message: string;
  /** Suggested actions based on context */
  suggestedActions?: Array<{
    action: AIAction;
    label: string;
    description: string;
  }>;
  /** Context-specific data (e.g., optimized content, suggestions) */
  data?: Record<string, any>;
  /** Usage information */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Helper type to get available actions for a specific context type
 */
export type ActionsForContext<T extends AIContextType> = T extends
  | "resume-list"
  | "resume-create"
  | "resume-edit"
  | "resume-view"
  ? ResumeAIAction
  : T extends "job-list" | "job-create" | "job-edit" | "job-view"
    ? JobAIAction
    : T extends "profile-view" | "profile-edit"
      ? ProfileAIAction
      : T extends "outreach" | "messaging"
        ? OutreachAIAction
        : T extends "search"
          ? SearchAIAction
          : T extends "dashboard"
            ? DashboardAIAction
            : GeneralAIAction;

