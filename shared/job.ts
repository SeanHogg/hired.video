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
}

export interface ApplyJobDTO {
  resumeId: string;
  coverLetter?: string;
}
