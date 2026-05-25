export interface JobSummaryDTO {
  id: string;
  title: string;
  description?: string;
  company?: string;
  location?: string;
  employmentType?: string;
  experienceLevel?: string;
  salaryMin?: number;
  salaryMax?: number;
  postedDate?: string;
  isRemote?: boolean;
  slug?: string;
  heroImageUrl?: string;
  /** Latest sentiment score from the Sentiment Analysis tool, or null
   *  if it hasn't been run against this job. Persisted on
   *  `job_items.sentiment_score` (migration 0070). */
  sentimentScore?: number | null;
  /** AI-resilient sector slug (see shared/sectors.ts). Drives sector
   *  landing pages, filtered search, and pivot-explorer matches. */
  sector?: string | null;
}

export interface PaginatedJobsDTO {
  items: JobSummaryDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface CreateJobDTO {
  title: string;
  description: string;
  location?: string;
  heroImageUrl?: string;
  /** Required-skills list. Persisted on `job_items.skills_required`
   *  (DB column) and exposed on the wire as `skills` (see `rowToJob`).
   *  Optional on create — the extension/extract path mints it from the
   *  posting; the manual UI may set it later. */
  skills?: string[];
  /** AI-resilient sector slug. See `shared/sectors.ts` for the enum.
   *  Optional — legacy jobs and scraped jobs stay untagged until
   *  edited through the form. */
  sector?: string;
}

export interface ApplyJobDTO {
  resumeId: string;
  coverLetter?: string;
}
