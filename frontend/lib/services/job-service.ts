/**
 * Job Service
 * Handles job-related API operations
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import type { ApiSuccessResponse } from "@shared/api";
import { CARD_FIELDS_BY_KIND, serializeListFields } from "@shared/projection";

// ============================================================================
// SCHEMAS
// ============================================================================

export const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  companyId: z.string().optional(),
  location: z.string(),
  description: z.string(),
  requirements: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  employmentType: z.enum([
    "full_time",
    "part_time",
    "contract",
    "internship",
    "remote",
  ]),
  experienceLevel: z.enum(["entry", "mid", "senior", "executive"]),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  currency: z.string().optional(),
  isRemote: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  postedDate: z.string(),
  expiryDate: z.string().optional(),
  applicationCount: z.number().optional(),
  viewCount: z.number().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const JobSummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    company: z.string().optional(),
    companyId: z.string().optional(),
    location: z.string().optional(),
    employmentType: z.string().optional(),
    experienceLevel: z.string().optional(),
    salaryMin: z.number().optional(),
    salaryMax: z.number().optional(),
    postedDate: z.string().optional(),
    isRemote: z.boolean().optional(),
    requirements: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    views: z.number().optional(),
    applications: z.number().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    summary: z.string().optional(),
    userId: z.string().optional(),
    createdBy: z.string().optional(),
    slug: z.string().optional(),
  })
  .passthrough();

export const CreateJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  // The route accepts both (CreateJobSchema in api/src/routes/jobs.ts); the
  // studio's first save of a job document sends them (#1915).
  company: z.string().max(255).optional(),
  location: z.string().optional(),
  responsibilities: z.array(z.string()).optional(),
  requirements: z.array(z.string()).optional(),
  employmentType: z
    .array(
      z.enum([
        "FullTime",
        "PartTime",
        "Freelance",
        "Contractor",
        "ContractToHire",
        "Temporary",
        "Internship",
      ]),
    )
    .optional(),
  seniority: z
    .array(
      z.enum(["Entry", "Junior", "Mid", "Senior", "LeadExecutive", "None"]),
    )
    .optional(),
  workSetting: z.enum(["Onsite", "Remote", "Hybrid"]).optional(),
  // Hybrid weekly split (#2069) — only sent/meaningful when workSetting is Hybrid.
  onsiteDaysPerWeek: z.number().int().min(0).max(7).optional().nullable(),
  remoteDaysPerWeek: z.number().int().min(0).max(7).optional().nullable(),
  expirationDate: z.string().optional(),
  status: z.enum(["Draft", "Open", "Closed", "Hired"]).optional(),
});

export const JobFiltersSchema = z.object({
  search: z.string().optional(),
  location: z.string().optional(),
  // Structured geo filter — see shared/content-locations.ts. When set,
  // the backend resolves to a job-id allowlist via LocationService and
  // returns only matching jobs. Coexists with `location` free-text
  // (legacy fallback for un-geocoded rows).
  countryId: z.number().optional(),
  stateId: z.string().optional(),
  cityId: z.string().optional(),
  radiusKm: z.number().optional(),
  skills: z.array(z.string()).optional(),
  employmentType: z.string().optional(),
  experienceLevel: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  isRemote: z.boolean().optional(),
  // Work-setting facet (#2069): onsite | remote | hybrid.
  workSetting: z.string().optional(),
  companyId: z.string().optional(),
  // AI-resilient sector filter (#1168). Backend `/api/jobs/public` reads
  // this and joins against the partial sector index from migration 0112.
  sector: z.string().optional(),
  page: z.number().optional(),
  limit: z.number().optional(),
});

// Accept both our normalized keys and backend PascalCase keys
export const PaginatedJobsSchema = z
  .object({
    items: z.array(JobSummarySchema).optional(),
    Items: z.array(JobSummarySchema).optional(),
    total: z.number().optional(),
    Total: z.number().optional(),
    page: z.number().optional(),
    Page: z.number().optional(),
    limit: z.number().optional(),
    Limit: z.number().optional(),
    totalPages: z.number().optional(),
    hasNext: z.boolean().optional(),
    hasPrev: z.boolean().optional(),
    hasNextPage: z.boolean().optional(),
    HasNextPage: z.boolean().optional(),
    hasPreviousPage: z.boolean().optional(),
    HasPreviousPage: z.boolean().optional(),
  })
  .passthrough();

// ============================================================================
// TYPES
// ============================================================================

export type Job = z.infer<typeof JobSchema>;
export type JobSummary = z.infer<typeof JobSummarySchema>;
export type CreateJob = z.infer<typeof CreateJobSchema>;
/** The full write body `POST /api/jobs` accepts (api/src/routes/jobs.ts
 *  CreateJobSchema) — the studio job document sends every field it edits. */
export type JobWriteBody = { title: string; description: string } & Record<string, unknown>;
export type JobFilters = z.infer<typeof JobFiltersSchema>;
export type PaginatedJobs = z.infer<typeof PaginatedJobsSchema>;

// ============================================================================
// POST /api/jobs/extract — the ONE parser for its two answer shapes
// ============================================================================

/** Extract's "did you mean?" answer: the page matches jobs already on file
 *  ambiguously, so the server returns candidates instead of a job. */
const ExtractDuplicatesSchema = z
  .object({
    duplicate_candidates: z
      .array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            company: z.string().nullish(),
            location: z.string().nullish(),
            sourceUrl: z.string().nullish(),
          })
          .passthrough(),
      )
      .min(1),
    parsed_title: z.string().nullish(),
    parsed_company: z.string().nullish(),
  })
  .passthrough();

/** Duplicates first: a job row never carries `duplicate_candidates`. */
export const ExtractJobResponseSchema = z.union([ExtractDuplicatesSchema, JobSummarySchema]);
export type ExtractJobResponse = z.infer<typeof ExtractJobResponseSchema>;

export type ExtractJobResult =
  | { kind: "job"; job: JobSummary }
  /** The best (first — the server ranks them) existing job it matched. */
  | { kind: "duplicate"; job: JobSummary };

/** Either Extract answer as the job to use. Pure. */
export function parseExtractJobResponse(data: ExtractJobResponse): ExtractJobResult {
  if ("duplicate_candidates" in data && Array.isArray(data.duplicate_candidates)) {
    const best = data.duplicate_candidates[0];
    return {
      kind: "duplicate",
      job: {
        id: best.id,
        title: best.title,
        company: best.company ?? data.parsed_company ?? undefined,
        location: best.location ?? undefined,
      },
    };
  }
  return { kind: "job", job: JobSummarySchema.parse(data) };
}

// ============================================================================
// JOB SERVICE CLASS
// ============================================================================

export class JobService {
  /**
   * Get all public jobs
   */
  async getPublicJobs(
    filters?: JobFilters,
    options: { fields?: readonly string[] } = {},
  ): Promise<PaginatedJobs> {
    const params = new URLSearchParams();

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => params.append(key, v.toString()));
          } else {
            params.append(key, value.toString());
          }
        }
      });
    }

    // `?fields=` projection (gap #1444). Default to the JOBS card subset
    // so unconditional list calls automatically benefit; callers that
    // need the full row pass `fields: []` or override with their own
    // narrower / wider set.
    const fields = serializeListFields(
      "jobs",
      options.fields ?? CARD_FIELDS_BY_KIND.jobs,
    );
    if (fields) params.set("fields", fields);

    const endpoint = `/api/jobs${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await apiClient.get<z.infer<typeof PaginatedJobsSchema>>(endpoint, PaginatedJobsSchema);

    const dto = response.data;
    const items = (dto.items || dto.Items || []);
    const total = dto.total ?? dto.Total ?? items.length;
    const page = dto.page ?? dto.Page ?? 1;
    const limit = dto.limit ?? dto.Limit ?? items.length;
    const hasNext = dto.hasNext ?? dto.hasNextPage ?? dto.HasNextPage ?? page * limit < total;
    const hasPrev = dto.hasPrev ?? dto.hasPreviousPage ?? dto.HasPreviousPage ?? page > 1;

    return {
      items,
      total,
      page,
      limit,
      hasNext,
      hasPrev,
    };
  }

  /**
   * Get jobs for current user (owned + saved)
   */
  async getUserJobs(): Promise<JobSummary[]> {
    const response = await apiClient.get<JobSummary[]>(
      "/api/jobs/getsummaryitems",
      z.array(JobSummarySchema),
    );

    return response.data;
  }

  /**
   * Get jobs the user posted (`jobItems.postedByUserId = me`). Distinct
   * from `getUserJobs` which mixes owned + saved + applied. Used by the
   * Studio SubjectPickerDialog to surface only OWNED jobs as pickable
   * subjects (#642).
   */
  async getMyPostedJobs(): Promise<JobSummary[]> {
    const response = await apiClient.get<JobSummary[]>(
      "/api/jobs/user-jobs",
      z.array(JobSummarySchema),
    );
    return response.data;
  }

  /** #154/#1493 — Archive (soft-delete) a job. Hides it from default
   *  listings while preserving slug + analytics; owner only. */
  async archiveJob(id: string): Promise<void> {
    await apiClient.post(`/api/jobs/${id}/archive`, {});
  }

  /** #154/#1493 — Restore an archived job. Owner only. */
  async unarchiveJob(id: string): Promise<void> {
    await apiClient.post(`/api/jobs/${id}/unarchive`, {});
  }

  /**
   * Get specific job by ID
   */
  async getJobById(id: string): Promise<any> {
    // Bypass strict client-side schema; backend returns JobItemEntity shape
    const response = await apiClient.get<any>(`/api/jobs/${id}`);
    return response.data;
  }

  /**
   * Create new job
   */
  async createJob(jobData: CreateJob | JobWriteBody): Promise<Job> {
    const response = await apiClient.post<Job>("/api/jobs", jobData, JobSchema);
    return response.data;
  }

  /**
   * Update existing job
   */
  async updateJob(id: string, jobData: any): Promise<any> {
    // Bypass strict client-side schema; backend expects JobItemEntity shape
    const response = await apiClient.put<any>(`/api/jobs/${id}`, jobData);
    return response.data;
  }

  /**
   * Create job from file upload.
   *
   * Validates the response with the permissive JobSummarySchema rather
   * than the strict JobSchema. Reason: the /api/jobs/createfromfile backend path
   * only extracts title + description + location from the upload — the
   * enum fields (employmentType, experienceLevel) and metadata (company,
   * postedDate, createdAt, …) aren't populated synchronously, so strict
   * validation produces 400 VALIDATION_ERROR responses to a call that
   * actually succeeded on the server. Support ticket 2026-04-14 was
   * this exact failure mode from the ValueProposition wizard.
   */
  async createJobFromFile(file: File): Promise<JobSummary> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.request<JobSummary>(
      "/api/jobs/createfromfile",
      {
        method: "POST",
        body: formData,
        headers: {}, // Let the browser set the multipart boundary.
      },
      JobSummarySchema,
    );

    return response.data;
  }

  /**
   * Extract job from URL. Uses the permissive JobSummarySchema for the
   * same reason as createJobFromFile — enum fields may be absent when
   * the extractor can't infer them from the page. Every caller (the kit's
   * job-link import, the chat's review intake, the tools' job step) gets a
   * job either way: an ambiguous-duplicate answer resolves to the best
   * existing candidate (parseExtractJobResponse).
   */
  async extractJobFromUrl(url: string): Promise<JobSummary> {
    const response = await apiClient.post<ExtractJobResponse>(
      "/api/jobs/extract",
      { url },
      ExtractJobResponseSchema,
    );
    const result = parseExtractJobResponse(response.data);
    if (result.kind === "job") return result.job;
    // A known job matched: use it, with its full posting when we can read it
    // (the candidate list carries only title / company / location).
    const full: unknown = await this.getJobById(result.job.id).catch(() => null);
    const known =
      full && typeof full === "object"
        ? Object.fromEntries(Object.entries(full).filter(([, value]) => value != null))
        : {};
    const parsed = JobSummarySchema.safeParse({ ...result.job, ...known });
    return parsed.success ? parsed.data : result.job;
  }

  /**
   * Delete job
   */
  async deleteJob(id: string): Promise<void> {
    await apiClient.delete(`/api/jobs/${id}`);
  }

  /**
   * Clone job — `POST /api/jobs/:id/clone`. Backend appends " (Copy)" to the
   * title and lands the clone as `isActive: false`. Returns the cloned row
   * (full Job shape) so callers can navigate to its edit page.
   */
  async cloneJob(id: string): Promise<Job> {
    const response = await apiClient.post<Job>(
      `/api/jobs/${id}/clone`,
      {},
      JobSchema,
    );
    return response.data;
  }

  /**
   * Save/bookmark job
   */
  async saveJob(jobId: string): Promise<void> {
    await apiClient.post(`/api/jobs/${jobId}/save`);
  }

  /**
   * Remove saved job
   */
  async unsaveJob(jobId: string): Promise<void> {
    await apiClient.delete(`/api/jobs/${jobId}/save`);
  }

  /**
   * Get user's saved jobs
   */
  async getSavedJobs(): Promise<JobSummary[]> {
    const response = await apiClient.get<JobSummary[]>(
      "/api/jobs/saved",
      z.array(JobSummarySchema),
    );

    return response.data;
  }

  /**
   * Apply to a job. When the job has a video screening attached, the response
   * carries an inviteToken + screeningRequired flag — the apply page uses
   * that to land the candidate directly on `/interview/:token`.
   */
  async applyToJob(
    jobId: string,
    application: { resumeId: string; coverLetter?: string },
  ): Promise<{
    success: true;
    applicationId: string;
    screening: {
      interviewId: string;
      inviteToken: string;
      screeningRequired: "required" | "optional";
    } | null;
  }> {
    const res = await apiClient.post<{
      success: true;
      applicationId: string;
      screening: {
        interviewId: string;
        inviteToken: string;
        screeningRequired: "required" | "optional";
      } | null;
    }>(`/api/jobs/${jobId}/apply`, application);
    return res.data;
  }

  /**
   * Create a job alert
   */
  async createJobAlert(alert: {
    name: string;
    keywords: string;
    location?: string;
    frequency: string;
  }): Promise<void> {
    await apiClient.post("/api/jobs/alerts", alert);
  }

  /**
   * Get job by slug (for SEO-friendly URLs)
   */
  async getJobBySlug(slug: string): Promise<any> {
    // Bypass strict client-side schema; backend returns JobItemEntity shape
    const response = await apiClient.get<any>(`/api/jobs/slug/${slug}`);
    return response.data;
  }

  /**
   * Search jobs with filters
   */
  async searchJobs(filters: JobFilters): Promise<PaginatedJobs> {
    return this.getPublicJobs(filters);
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const jobService = new JobService();
export default jobService;
