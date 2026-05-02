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
}

export interface ApplyJobDTO {
  resumeId: string;
  coverLetter?: string;
}
