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
} from "@shared/resume";

// Keep the old `ResumeData` name as a legacy alias of `ResumeContent`
// so existing call-sites compile without a rename. New code should
// prefer `ResumeContent`.
export type { ResumeContent as ResumeData } from "@shared/resume";

// ---------------------------------------------------------------------------
// Upload / search / merge analysis — frontend-only types, not wire-bound.
// ---------------------------------------------------------------------------

import type { ResumeContent, ResumePrivacy, MergeSectionType } from "@shared/resume";

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

export interface ArrayDiff {
  onlyInSource: number;
  onlyInTarget: number;
  shared: number;
}

export type ScalarFieldDiffs = Record<string, { source: string; target: string }>;

export interface SectionMatch {
  sectionType: MergeSectionType;
  sourceIndex: number;
  targetIndex: number | null;
  confidence: number;
  matchReason: string;
  mergeAction: "auto" | "manual" | "skip";
  hasContentDifferences?: boolean;
  highlightDiff?: ArrayDiff;
  keywordDiff?: ArrayDiff;
  scalarDiffs?: ScalarFieldDiffs;
}

export interface BasicsConflict {
  field: string;
  sourceValue: string;
  targetValue: string;
}

export interface MergeAnalysis {
  basics: {
    conflicts: BasicsConflict[];
    autoMerge: boolean;
  };
  sectionMatches: SectionMatch[];
  newSections: Array<{
    sectionType: MergeSectionType;
    sourceIndex: number;
    item: Record<string, unknown>;
  }>;
  summary: {
    totalSections: number;
    autoMerge: number;
    manualReview: number;
    skip: number;
    newItems: number;
  };
}

export interface MergeDecision {
  sectionType: string;
  sourceIndex: number;
  targetIndex: number | null;
  action: "merge" | "replace" | "skip" | "add";
  mergeHighlights?: "combine" | "source_only" | "target_only";
  selectedHighlights?: string[];
  scalarChoices?: Record<string, "source" | "target">;
}

export interface MergeRequest {
  sourceResumeId?: string;
  sourceContent?: Record<string, unknown>;
  targetResumeId: string;
  decisions: MergeDecision[];
  basicDecisions?: Record<string, "source" | "target">;
  createNew: boolean;
  newTitle?: string;
}

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
