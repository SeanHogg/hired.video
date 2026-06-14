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
  /** Where the role is performed (#2069): 'onsite' | 'remote' | 'hybrid'.
   *  Canonical vocab in shared/work-settings.ts. `isRemote` is the derived
   *  legacy convenience (workSetting === 'remote'). */
  workSetting?: string | null;
  /** Hybrid weekly split — only populated when workSetting === 'hybrid'. */
  onsiteDaysPerWeek?: number | null;
  remoteDaysPerWeek?: number | null;
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
  company?: string;
  location?: string;
  heroImageUrl?: string;
  /** #743 — Optional Studio video project attached to the job. */
  videoProjectId?: string | null;
  /** Required-skills list. Persisted on `job_items.skills_required`
   *  (DB column) and exposed on the wire as `skills` (see `rowToJob`).
   *  Optional on create — the extension/extract path mints it from the
   *  posting; the manual UI may set it later. */
  skills?: string[];
  /** AI-resilient sector slug. See `shared/sectors.ts` for the enum.
   *  Optional — legacy jobs and scraped jobs stay untagged until
   *  edited through the form. */
  sector?: string;
  // ---- Editable surface widened in #878 ----
  // The job create/edit form ships every one of these, but they were
  // silently dropped: the route schema stripped unknown keys and the
  // service hand-rolled a 5-column SET clause. They map to `job_items`
  // columns + the `details` jsonb bag via `buildJobColumnPatch`.
  /** Stored in `details.responsibilities` (jsonb). */
  responsibilities?: string[];
  /** Stored in `details.requirements` (jsonb). */
  requirements?: string[];
  /** Stored in `details.qualifications` (jsonb). */
  qualifications?: string[];
  /** Stored in `details.benefits` (jsonb). */
  benefits?: string[];
  /** PascalCase / kebab / snake / single-or-array — normalized to the
   *  canonical kebab value and stored on `job_items.job_type`. */
  employmentType?: string | string[];
  /** Single-or-array experience level → `job_items.experience_level`. */
  seniority?: string | string[];
  /** Alias of `seniority` from the read DTO; either is accepted. */
  experienceLevel?: string;
  /** "Onsite" | "Remote" | "Hybrid" — normalized + stored on `work_setting`,
   *  with `is_remote` derived from it (#2069). */
  workSetting?: string;
  /** Hybrid weekly split (#2069) — only meaningful when workSetting is hybrid. */
  onsiteDaysPerWeek?: number | null;
  remoteDaysPerWeek?: number | null;
  isRemote?: boolean;
  salaryMin?: number;
  salaryMax?: number;
  /** Wire field `currency` → `job_items.salary_currency`. */
  currency?: string;
  /** Direct-apply URL → `job_items.apply_url`. */
  applyUrl?: string;
  /** ISO date string → `job_items.expires_at`. */
  expirationDate?: string;
  /** "Open" publishes (is_active=true); any other value unpublishes. */
  status?: string;
  /** Legacy publish toggle → `job_items.is_active` (used when `status` absent). */
  isPublic?: boolean;
}

export interface ApplyJobDTO {
  resumeId: string;
  coverLetter?: string;
}
