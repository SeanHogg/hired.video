// Meta types mirror backend enum hired.video.Abstractions.Core.MetaType
export enum MetaType {
  Hyperlink = 0,
  VideoMP4 = 1,
  VideoWebM = 2,
  Image = 5,
  YouTube = 10,
  HtmlContent = 15,
}

export interface ResumeBasics {
  Id?: string; // Optional UUID for metadata association
  Name: string;
  Label: string;
  Image: string;
  Email: string;
  Phone: string;
  Url: string;
  Summary: string;
  Location: {
    Address?: string;
    PostalCode?: string;
    City?: string;
    CountryCode?: string;
    Region?: string;
  } | null;
}

export interface WorkExperience {
  Id?: string; // Optional UUID for metadata association
  Name: string;
  Position: string;
  Summary: string;
  StartDate: string;
  EndDate: string;
  Highlights: string[];
  Url: string;
}

export interface VolunteerExperience {
  Id?: string;
  Organization: string;
  Position: string;
  Summary: string;
  StartDate: string;
  EndDate: string;
  Highlights: string[] | null;
  Url: string;
}

export interface Education {
  Id?: string;
  Institution: string;
  Area: string;
  StudyType: string;
  StartDate: string;
  EndDate: string;
  Score: string;
  Courses: string[] | null;
  Url: string;
}

export interface Award {
  Id?: string;
  Title: string;
  Date: string;
  Awarder: string;
  Summary: string;
}

export interface Certificate {
  Id?: string;
  Name: string;
  Date: string;
  Issuer: string;
  Url: string;
}

export interface Publication {
  Id?: string;
  Name: string;
  Publisher: string;
  ReleaseDate: string;
  Url: string;
  Summary: string;
}

export interface Skill {
  Id?: string;
  Name: string;
  Level: string;
  Keywords: string[];
}

export interface Language {
  Id?: string;
  Language: string;
  Fluency: string;
}

export interface Interest {
  Id?: string;
  Name: string;
  Keywords: string[];
}

export interface Reference {
  Id?: string;
  Name: string;
  Reference: string;
}

export interface Project {
  Id?: string;
  Name: string;
  Description: string;
  Highlights: string[];
  Keywords: string[];
  StartDate: string;
  EndDate: string;
  Url: string;
  Roles: string[];
  Entity: string;
  Type: string;
}

export interface ResumeData {
  Basics: ResumeBasics;
  Work: WorkExperience[];
  Volunteer: VolunteerExperience[];
  Education: Education[];
  Awards: Award[];
  Certificates: Certificate[];
  Publications: Publication[];
  Skills: Skill[];
  Languages: Language[];
  Interests: Interest[];
  References: Reference[];
  Projects: Project[];
  Meta?: {
    template?: string;
    version?: string;
    lastModified?: string;
  };
}

export interface ResumeSectionMeta {
  id: string;
  userId: string;
  referenceId: string; // UUID of the resume section this metadata is attached to
  name: string;
  metaType: MetaType; // Use enum for type safety
  url: string;
  description?: string;
  creationDateTime?: string;
}

export type ResumePrivacy = "public" | "recruiter_only" | "connections" | "private" | "draft";

export interface Resume {
  id: string;
  slug: string; // User-friendly URL identifier (e.g., "john-seeker-cto-resume")
  name: string;
  data: ResumeData;
  privacy: ResumePrivacy;
  isMaster: boolean;
  isActive: boolean; // Only one resume can be active per user
  parentId?: string; // For variations
  createdAt: string;
  updatedAt: string;
  views: number;
  userId: string;
  metaData?: ResumeSectionMeta[]; // Optional metadata entries for interactive UI
}

export interface ResumeMetadata {
  id: string;
  slug: string; // User-friendly URL identifier
  name: string;
  privacy: ResumePrivacy;
  isMaster: boolean;
  isActive: boolean;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
  views: number;
  summary: string; // Derived from basics.summary
  title: string; // Derived from basics.label
  userId: string;
}

export type ResumeOwnership = "owned" | "tracked";

export interface ResumeWithOwnership extends ResumeMetadata {
  ownership: ResumeOwnership;
}

export interface CreateResumeRequest {
  name: string;
  data: ResumeData;
  privacy?: ResumePrivacy;
  isMaster?: boolean;
  isActive?: boolean;
  parentId?: string;
  slug?: string; // Optional vanity slug
}

export interface UpdateResumeRequest {
  name?: string;
  data?: ResumeData;
  privacy?: ResumePrivacy;
  isMaster?: boolean;
  isActive?: boolean;
  metaData?: ResumeSectionMeta[];
  slug?: string; // Optional vanity slug update
}

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
  data: ResumeData;
  message: string;
  confidence: number; // How confident the AI is in the extraction
}

// ---------------------------------------------------------------------------
// Merge types
// ---------------------------------------------------------------------------

export type MergeSectionType =
  | "work"
  | "education"
  | "skills"
  | "volunteer"
  | "awards"
  | "certificates"
  | "publications"
  | "languages"
  | "interests"
  | "references"
  | "projects";

export interface SectionMatch {
  sectionType: MergeSectionType;
  sourceIndex: number;
  targetIndex: number | null;
  confidence: number;
  matchReason: string;
  mergeAction: "auto" | "manual" | "skip";
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
}

export interface MergeRequest {
  // Either sourceResumeId (resume-to-resume) or sourceContent (file-based merge)
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
  analysis: MergeAnalysis;
  parseConfidence: number;
}
