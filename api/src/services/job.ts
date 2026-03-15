import type {
  ApplyJobDTO,
  CreateJobDTO,
  JobSummaryDTO,
  PaginatedJobsDTO,
} from "../../../shared/job.js";

// NOTE: These are placeholder implementations until the legacy .NET domain is migrated.
// Proper implementations should query the database, apply permissions, and return real data.

export interface JobQuery {
  page?: number;
  limit?: number;
  search?: string;
  location?: string;
}

export interface JobEntity extends JobSummaryDTO {
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export async function getPublicJobs(filters?: JobQuery): Promise<PaginatedJobsDTO> {
  return {
    items: [],
    total: 0,
    page: filters?.page ?? 1,
    limit: filters?.limit ?? 10,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  };
}

export async function getUserJobs(): Promise<JobSummaryDTO[]> {
  return [];
}

export async function getJobById(id: string): Promise<JobEntity | null> {
  return null;
}

export async function createJob(job: CreateJobDTO): Promise<JobEntity> {
  return {
    id: "stub-job",
    title: job.title,
    company: "Stub Company",
    location: "Remote",
    description: job.description,
    isRemote: true,
    postedDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function updateJob(id: string, jobData: Partial<CreateJobDTO>): Promise<JobEntity | null> {
  return null;
}

export async function deleteJob(id: string): Promise<void> {
  // no-op
}

export async function saveJob(jobId: string): Promise<void> {
  // no-op
}

export async function unsaveJob(jobId: string): Promise<void> {
  // no-op
}

export async function getSavedJobs(): Promise<JobSummaryDTO[]> {
  return [];
}

export async function applyToJob(jobId: string, application: ApplyJobDTO): Promise<void> {
  // no-op
}

export async function getJobBySlug(slug: string): Promise<JobEntity | null> {
  return null;
}
