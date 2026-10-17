/**
 * Frontend resume types — re-exports the canonical contract from
 * shared/resume.ts. There is no frontend-only divergence: the wire format
 * is the only format. Merge-analysis types that aren't on the wire live
 * at the bottom.
 */

export {
  // Content
  BasicsSchema,
  WorkSchema,
  VolunteerSchema,
  EducationSchema,
  AwardSchema,
  CertificateSchema,
  PublicationSchema,
  SkillSchema,
  SkillEvidenceSchema,
  SkillEvidenceItemTypeSchema,
  SKILL_LEVELS,
  LanguageSchema,
  InterestSchema,
  ReferenceSchema,
  ProjectSchema,
  LocationSchema,
  ResumeContentSchema,
  ResumeMetaSchema,
  ResumeSectionMetaSchema,
  MetaTypeSchema,
  MetaType,
  // Envelope
  ResumeSchema,
  ResumeSummarySchema,
  ResumePrivacySchema,
  ResumeStatusSchema,
  SlugSchema,
  // Requests
  CreateResumeSchema,
  UpdateResumeSchema,
  MergeSectionTypeSchema,
  // Work entry employment / location type
  ResumeWorkSettingSchema,
  ResumeEmploymentTypeSchema,
  workEntryTags,
} from "@shared/resume";

export type {
  Basics,
  Work,
  Volunteer,
  Education,
  Award,
  Certificate,
  Publication,
  Skill,
  SkillLevel,
  SkillEvidence,
  SkillEvidenceItemType,
  Language,
  Interest,
  Reference,
  Project,
  Location,
  ResumeContent,
  ResumeMeta,
  ResumeSectionMeta,
  Resume,
  ResumeSummary,
  ResumePrivacy,
  ResumeStatus,
  CreateResumeRequest,
  UpdateResumeRequest,
  MergeSectionType,
  WorkEntryTag,
} from "@shared/resume";

// Keep the old `ResumeData` name as a legacy alias of `ResumeContent`
// so existing call-sites compile without a rename. New code should
// prefer `ResumeContent`.
export type { ResumeContent as ResumeData } from "@shared/resume";

// ---------------------------------------------------------------------------
// Upload / search / merge analysis — frontend-only types, not wire-bound.
// ---------------------------------------------------------------------------

import type { ResumeContent, ResumePrivacy } from "@shared/resume";

// ---------------------------------------------------------------------------
// ResumeWithOwnership — re-exported from shared/resume.ts, which holds
// the single canonical definition. The list UI treats "owned" rows
// (authored by the caller) and "tracked" rows (watched by the caller)
// in the same grid. Any field change must go through shared/resume.ts
// so the backend's rowToResumeSummary output stays in lockstep with
// what the Resumes page reads.
// ---------------------------------------------------------------------------

export type ResumeOwnership = "owned" | "tracked";
export type { ResumeWithOwnership } from "@shared/resume";

export interface UploadResumeRequest {
  name: string;
  file: File;
  privacy?: ResumePrivacy;
  isMaster?: boolean;
}

export interface ResumeSearchFilters {
  privacy?: ResumePrivacy;
  isMaster?: boolean;
  parentId?: string;
  search?: string;
}

export interface ResumeUploadResponse {
  id: string;
  content: ResumeContent;
  message: string;
  confidence: number;
}

export type {
  ArrayDiff,
  ScalarFieldDiffs,
  CrossSectionConflict,
  SectionMatch,
  BasicsConflict,
  MergeAnalysis,
  MergeDecision,
} from "@shared/resume-merge-decisions";
import type { MergeAnalysis, MergeDecision } from "@shared/resume-merge-decisions";

export interface MergeRequest {
  sourceResumeId?: string;
  sourceContent?: Record<string, unknown>;
  /** A stored target (required to save), or the content on screen
   *  (`targetContent`) for a preview that is applied client-side. */
  targetResumeId?: string;
  targetContent?: Record<string, unknown>;
  decisions: MergeDecision[];
  basicDecisions?: Record<string, "source" | "target">;
  createNew: boolean;
  newTitle?: string;
}

/** A merge preview never saves, so the save-only fields don't apply. */
export type MergePreviewRequest = Omit<MergeRequest, "createNew" | "newTitle">;

export interface MergeResult {
  resumeId: string;
  title: string;
  mergedSections: number;
  skippedSections: number;
  newSections: number;
}

export interface FileMergeAnalysis {
  parsedContent: Record<string, unknown>;
  targetContent: Record<string, unknown>;
  analysis: MergeAnalysis;
  parseConfidence: number;
}

export interface ResumeToResumeAnalysis {
  analysis: MergeAnalysis;
  sourceContent: Record<string, unknown>;
  targetContent: Record<string, unknown>;
}

export interface MergePreview {
  mergedContent: Record<string, unknown>;
  stats: {
    mergedSections: number;
    skippedSections: number;
    newSections: number;
  };
}

// ---------------------------------------------------------------------------
// AI bullet consolidation
// ---------------------------------------------------------------------------

export type BulletFieldType = "highlights" | "keywords" | "courses" | "roles";

export interface ConsolidateBulletsRequest {
  bullets: string[];
  fieldType: BulletFieldType;
  sectionType: string;
  entryLabel?: string;
}

export interface ConsolidateBulletsResult {
  rewritten: string[];
  notes?: string[];
  /** True when the backend returned the input unchanged (no API key,
   *  AI failure, etc.). UI should surface a subtle "AI unavailable"
   *  hint instead of pretending a rewrite happened. */
  unchanged?: boolean;
  reason?: string;
}
