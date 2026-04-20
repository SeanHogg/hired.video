/**
 * Shared types for the Application Form Autofill feature.
 * Used by API backend, frontend web app, and Chrome extension.
 */

import { z } from "zod";

// ============================================================================
// REQUEST SCHEMAS — single source of truth for the autofill write endpoints.
// ============================================================================

export const SaveSubmissionSchema = z.object({
  fields: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
  answers: z.record(z.string(), z.unknown()),
  sourceUrl: z.string().url().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  savedJobId: z.string().uuid().optional().nullable(),
  resumeId: z.string().uuid().optional().nullable(),
  atsProvider: z.string().max(50).optional().nullable(),
  jobDescription: z.string().max(50000).optional().nullable(),
  status: z.enum(["draft", "submitted", "reviewed"]).optional(),
});
export type SaveSubmissionInput = z.infer<typeof SaveSubmissionSchema>;

export const UpdateCacheEntrySchema = z.object({
  answer: z.string().max(5000),
});
export type UpdateCacheEntryInput = z.infer<typeof UpdateCacheEntrySchema>;

// ============================================================================
// FORM FIELD TYPES
// ============================================================================

export type FormFieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "date"
  | "number"
  | "file"
  | "hidden";

export type FieldCategory =
  | "personal_info"
  | "contact"
  | "work_authorization"
  | "education"
  | "experience"
  | "motivation"
  | "availability"
  | "salary"
  | "technical"
  | "diversity"
  | "custom";

export type AnswerConfidence = "high" | "medium" | "low";
export type AnswerSource = "profile" | "resume" | "ai" | "cache";
export type SubmissionStatus = "draft" | "submitted" | "reviewed";

export interface FormField {
  /** Unique within the form — HTML name/id attribute or generated ("field_0") */
  id: string;
  /** Human-readable label extracted from the form */
  label: string;
  /** HTML input type */
  type: FormFieldType;
  /** HTML name attribute */
  name?: string;
  /** Whether the field is required */
  required: boolean;
  /** Available options for select/radio/checkbox fields */
  options?: string[];
  /** Placeholder text */
  placeholder?: string;
  /** Current value already in the field */
  currentValue?: string;
  /** CSS selector to target the DOM element */
  selector: string;
  /** Semantic category for the field */
  category?: FieldCategory;
  /** Group label for nested/grouped fields (e.g. "Address") */
  groupLabel?: string;
}

// ============================================================================
// API REQUEST / RESPONSE
// ============================================================================

export interface FormAnalysisRequest {
  /** Raw form HTML to parse */
  html?: string;
  /** Pasted questions (alternative to HTML) */
  questions?: string[];
  /** URL of the application form page (server will fetch + parse) */
  url?: string;
}

export interface FormAnalysisResponse {
  fields: FormField[];
  atsProvider?: string;
  formTitle?: string;
}

export interface AnswerGenerationRequest {
  /** Extracted form fields to generate answers for */
  fields: FormField[];
  /** Link to a tracked job for context */
  jobId?: string;
  /** Raw job description text (if no tracked job) */
  jobDescription?: string;
  /** Specific resume to use; defaults to master/active */
  resumeId?: string;
  /** Additional user instructions for the AI */
  customInstructions?: string;
}

export interface FieldAnswer {
  fieldId: string;
  answer: string;
  confidence: AnswerConfidence;
  source: AnswerSource;
}

export interface AnswerGenerationResponse {
  answers: FieldAnswer[];
  tokensUsed?: number;
}

export interface SaveSubmissionRequest {
  fields: FormField[];
  answers: Record<string, string>;
  sourceUrl?: string;
  jobId?: string;
  savedJobId?: string;
  resumeId?: string;
  atsProvider?: string;
  jobDescription?: string;
  status?: SubmissionStatus;
}

export interface SavedFormSubmission {
  id: string;
  sourceUrl?: string;
  atsProvider?: string;
  fields: FormField[];
  answers: Record<string, string>;
  jobTitle?: string;
  company?: string;
  status: SubmissionStatus;
  createdAt: string;
}

export interface CachedAnswer {
  id: string;
  questionText: string;
  questionCategory?: string;
  answer: string;
  timesUsed: number;
  lastUsedAt: string;
}

// ============================================================================
// ATS DETECTION
// ============================================================================

export const ATS_URL_PATTERNS: Record<string, RegExp> = {
  greenhouse: /boards\.greenhouse\.io|\.greenhouse\.io/i,
  lever: /jobs\.lever\.co/i,
  workday: /\.myworkdayjobs\.com|\.myworkdaysite\.com/i,
  ashby: /jobs\.ashbyhq\.com/i,
  smartrecruiters: /jobs\.smartrecruiters\.com/i,
  icims: /\.icims\.com/i,
  bamboohr: /\.bamboohr\.com\/careers/i,
};

/**
 * Detect the ATS provider from a URL.
 * Returns the provider name or null if unrecognized.
 */
export function detectAtsProvider(url: string): string | null {
  for (const [provider, pattern] of Object.entries(ATS_URL_PATTERNS)) {
    if (pattern.test(url)) return provider;
  }
  return null;
}
