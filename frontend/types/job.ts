// Card/list projection types for <JobCard>. The wire contracts for job
// create/update live in @shared/api (CreateJobRequestSchema) — the old local
// JobData / CreateJobRequest / JobRequirement redeclarations were dead drift.

export type JobStatus = "active" | "paused" | "closed" | "draft";
export type JobPrivacy =
  | "public"
  | "company_only"
  | "recruiter_only"
  | "private";

export interface JobMetadata {
  id: string;
  slug: string; // User-friendly URL identifier
  title: string;
  company: string;
  location: string;
  salary?: string;
  employmentType: string;
  experienceLevel: string;
  status: JobStatus;
  privacy: JobPrivacy;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  views: number;
  applications: number;
  summary: string;
  userId: string;
  companyId?: string;
}

export type JobOwnership = "owned" | "tracked";

export interface JobWithOwnership extends JobMetadata {
  ownership: JobOwnership;
}
