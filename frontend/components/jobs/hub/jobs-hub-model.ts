// Pure model for the /jobs hub (pages/Jobs.tsx): wire schemas for the
// applications + alerts tabs, tab resolution, alert-criteria parsing and the
// JobSummary → JobCard projection. No React, no I/O.

import { z } from "zod";
import type { JobSummary } from "@/lib/services/job-service";

export const JobApplicationSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  userId: z.string(),
  resumeId: z.string(),
  coverLetter: z.string().optional(),
  status: z.string(),
  appliedAt: z.string(),
  job: z.object({
    id: z.string(),
    title: z.string(),
    company: z.string().optional(),
    location: z.string().optional(),
    employmentType: z.string().optional(),
  }),
  resume: z
    .object({
      id: z.string(),
      title: z.string(),
    })
    .optional(),
});

export const JobAlertSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  searchCriteria: z.string(),
  alertFrequency: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  lastTriggered: z.string().optional().nullable(),
});

export type JobApplication = z.infer<typeof JobApplicationSchema>;
export type JobAlert = z.infer<typeof JobAlertSchema>;

// Saved jobs are returned by the API as flat JobSummary entities
// (see GET /api/jobs/saved → jobService.getSavedJobs()).
export type SavedJob = JobSummary;

/** A job a per-card dialog (QR / history / analytics / delete) targets. */
export type JobDialogTarget = { id: string; title: string };

export type JobsHubTab =
  | "jobs"
  | "saved"
  | "applications"
  | "alerts"
  | "candidates"
  | "posted";

/** Single tab axis: jobs (browse), saved, applications, alerts, candidates,
 *  posted. The legacy ?section=candidates and ?tab=browse URLs still resolve
 *  here so bookmarks survive. "browse" maps to "jobs" since the dedicated
 *  Browse sub-tab is gone — the Jobs tab itself owns the browse surface now. */
export function resolveJobsHubTab(rawTab: string | null): JobsHubTab {
  return rawTab === "saved" ? "saved" :
    rawTab === "applications" ? "applications" :
    rawTab === "alerts" ? "alerts" :
    rawTab === "candidates" ? "candidates" :
    rawTab === "posted" ? "posted" :
    "jobs";
}

/** Hiring-side-only tabs collapse to "jobs" for non-hiring viewers so a
 *  stale ?tab=… URL doesn't render an empty agency panel. */
const HIRING_ONLY: ReadonlyArray<string> = ["candidates", "posted"];
export function effectiveJobsHubTab(activeTab: JobsHubTab, canManageJobs: boolean): JobsHubTab {
  return HIRING_ONLY.includes(activeTab) && !canManageJobs ? "jobs" : activeTab;
}

/** Alert `searchCriteria` is "keywords | Location: city" — split it back. */
export function parseSearchCriteria(criteria: string): { keywords: string; location: string | undefined } {
  const parts = criteria.split("|").map((p) => p.trim());
  const keywords = parts[0] || "";
  const location = parts
    .find((p) => p.startsWith("Location:"))
    ?.replace("Location:", "")
    .trim();
  return { keywords, location };
}

/** Fields shared by every JobCard projection on the hub. */
function baseJobCardMetadata(job: JobSummary) {
  return {
    id: job.id,
    slug: job.slug || "",
    title: job.title,
    company: job.company,
    companyId: job.companyId || "",
    location: job.location,
    description: job.description || "",
    employmentType: job.employmentType,
    experienceLevel: job.experienceLevel || "entry",
    postedDate: job.postedDate || "",
    isRemote: job.isRemote || false,
    status: "active" as const,
    privacy: "public" as const,
    views: job.views || 0,
    applications: job.applications || 0,
    createdAt: job.createdAt || "",
    updatedAt: job.updatedAt || "",
    summary: job.summary || "",
    userId: job.userId || "",
  };
}

/** Posted-tab projection (no salary / work-setting badge). */
export function toPostedJobCardMetadata(job: JobSummary) {
  return baseJobCardMetadata(job);
}

/** Browse-grid projection: adds the "$Nk - $Mk" salary and (#2092) the work
 *  setting + hybrid day-split for the card badge. */
export function toBrowseJobCardMetadata(job: JobSummary) {
  return {
    ...baseJobCardMetadata(job),
    salary:
      job.salaryMin && job.salaryMax
        ? `$${(job.salaryMin / 1000).toFixed(0)}k - $${(job.salaryMax / 1000).toFixed(0)}k`
        : undefined,
    workSetting: typeof job.workSetting === "string" ? job.workSetting : undefined,
    onsiteDaysPerWeek: typeof job.onsiteDaysPerWeek === "number" ? job.onsiteDaysPerWeek : null,
    remoteDaysPerWeek: typeof job.remoteDaysPerWeek === "number" ? job.remoteDaysPerWeek : null,
  };
}

/** Ownership marker on the public-jobs payload (#401 fallback). */
export function isOwnedBy(job: JobSummary, userId: string): boolean {
  return job.userId === userId;
}
