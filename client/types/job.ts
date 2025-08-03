export interface JobLocation {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  remote: boolean;
  hybrid: boolean;
  timezone?: string;
}

export interface JobCompany {
  name: string;
  logo?: string;
  website?: string;
  size?: string;
  industry?: string;
  description?: string;
}

export interface JobRequirement {
  skill: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  required: boolean;
}

export interface JobBenefit {
  type: string;
  description: string;
}

export interface JobData {
  title: string;
  department?: string;
  description: string;
  summary: string;
  responsibilities: string[];
  requirements: JobRequirement[];
  qualifications: string[];
  skills: string[];
  benefits: JobBenefit[];
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship' | 'temporary';
  experienceLevel: 'entry' | 'mid' | 'senior' | 'executive';
  education?: string;
  location: JobLocation;
  company: JobCompany;
  videoUrl?: string;
  applicationUrl?: string;
  contactEmail?: string;
  applicationDeadline?: string;
}

export type JobStatus = 'active' | 'paused' | 'closed' | 'draft';
export type JobPrivacy = 'public' | 'company_only' | 'recruiter_only' | 'private';

export interface Job {
  id: string;
  slug: string; // User-friendly URL identifier (e.g., "senior-software-engineer-remote")
  data: JobData;
  status: JobStatus;
  privacy: JobPrivacy;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  views: number;
  applications: number;
  userId: string; // User who posted the job
  companyId?: string; // Associated company account
}

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

export type JobOwnership = 'owned' | 'tracked';

export interface JobWithOwnership extends JobMetadata {
  ownership: JobOwnership;
}

export interface CreateJobRequest {
  data: JobData;
  status?: JobStatus;
  privacy?: JobPrivacy;
  expiresAt?: string;
  companyId?: string;
}

export interface UpdateJobRequest {
  data?: Partial<JobData>;
  status?: JobStatus;
  privacy?: JobPrivacy;
  expiresAt?: string;
}

export interface JobSearchFilters {
  location?: string;
  remote?: boolean;
  employmentType?: string[];
  experienceLevel?: string[];
  salaryMin?: number;
  salaryMax?: number;
  skills?: string[];
  company?: string;
  search?: string;
  status?: JobStatus;
  privacy?: JobPrivacy;
}

export interface JobApplication {
  id: string;
  jobId: string;
  userId: string;
  resumeId?: string;
  coverLetter?: string;
  status: 'pending' | 'reviewed' | 'interview' | 'offered' | 'rejected' | 'withdrawn';
  appliedAt: string;
  updatedAt: string;
  notes?: string;
}
